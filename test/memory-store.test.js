const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { MemoryStore } = require('../dist/memory-store.js');

function makeTempConfig(ext = 'json') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem8-store-'));
  return {
    dir,
    config: { dbPath: path.join(dir, `memories.${ext}`), userId: 'user-1', projectId: 'project-1' }
  };
}

test('MemoryStore persists v2 memories to JSON disk', async () => {
  const { dir, config } = makeTempConfig('json');
  const store = new MemoryStore(config, false);

  const memory = await store.add({
    scope: 'user',
    type: 'preference',
    userId: 'user-1',
    content: 'Prefer concise answers.',
    importance: 0.9,
    confidence: 0.8,
    source: 'conversation'
  });

  assert.equal(await store.count(), 1);
  assert.equal(memory.scope, 'user');
  await store.close();

  const reopened = new MemoryStore(config, false);
  const results = await reopened.query({ scope: 'user', userId: 'user-1' });
  assert.equal(results.length, 1);
  assert.equal(results[0].type, 'preference');

  await reopened.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MemoryStore migrates legacy schema to v2 JSON', async () => {
  const { dir, config } = makeTempConfig('json');
  fs.writeFileSync(
    config.dbPath,
    JSON.stringify({
      version: 1,
      memories: [
        {
          id: 'legacy-1',
          sessionId: 'session-1',
          content: 'Legacy content',
          createdAt: 1,
          updatedAt: 2,
          metadata: { source: 'legacy' }
        }
      ]
    })
  );

  const store = new MemoryStore(config, false);
  const migrated = await store.getById('legacy-1');
  assert.equal(migrated.scope, 'session');
  assert.equal(migrated.type, 'fact');
  assert.equal(await store.count(), 1);

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MemoryStore initializes SQLite and migrates seed from neighboring JSON', async () => {
  const { dir } = makeTempConfig('json');
  const jsonPath = path.join(dir, 'memories.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({
      version: 2,
      memories: [
        {
          id: 'seed-1',
          scope: 'project',
          type: 'decision',
          projectId: 'project-1',
          content: 'Keep mem8 local-first.',
          importance: 0.9,
          freshness: 0.9,
          confidence: 0.8,
          source: 'conversation',
          createdAt: 1,
          updatedAt: 1
        }
      ]
    })
  );

  const store = new MemoryStore({ dbPath: path.join(dir, 'memories.sqlite'), projectId: 'project-1' }, false);
  const results = await store.query({ scope: 'project', projectId: 'project-1' });
  assert.equal(results.length, 1);
  assert.equal(results[0].content, 'Keep mem8 local-first.');

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
