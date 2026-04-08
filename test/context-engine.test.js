const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Mem8ContextEngine } = require('../dist/context-engine.js');

function makeTempConfig(ext = 'json') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem8-engine-'));
  return {
    dir,
    config: {
      dbPath: path.join(dir, `memories.${ext}`),
      debug: false,
      userId: 'user-1',
      projectId: 'project-1',
      embeddingProvider: 'none'
    }
  };
}

test('bootstrap returns session and user memories', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);
  const store = engine.getStore();

  await store.add({
    scope: 'session',
    type: 'fact',
    sessionId: 'session-a',
    content: 'Session fact',
    importance: 0.5,
    confidence: 0.6,
    source: 'conversation'
  });
  await store.add({
    scope: 'user',
    type: 'preference',
    userId: 'user-1',
    content: 'User prefers concise answers.',
    importance: 0.9,
    confidence: 0.8,
    source: 'conversation'
  });

  const result = await engine.bootstrap({ sessionId: 'session-a', config });
  assert.equal(result.errors.length, 0);
  assert.equal(result.memories.length, 2);

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ingest classifies preference memories into user scope', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);

  const result = await engine.ingest({
    sessionId: 'session-b',
    turnNumber: 3,
    config,
    recentMessages: [
      {
        role: 'user',
        content: 'I prefer weekly progress updates with short bullet points because long reports are hard to scan.'
      }
    ]
  });

  const userMemories = await engine.getStore().query({ scope: 'user', userId: 'user-1' });
  assert.equal(result.errors.length, 0);
  assert.equal(result.memoriesAdded, 1);
  assert.equal(userMemories.length, 1);
  assert.equal(userMemories[0].type, 'preference');

  await engine.getStore().close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ingest merges similar user preferences instead of duplicating them', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);

  await engine.ingest({
    sessionId: 'session-c',
    turnNumber: 1,
    config,
    recentMessages: [
      { role: 'user', content: 'I prefer concise answers.' }
    ]
  });

  const result = await engine.ingest({
    sessionId: 'session-c',
    turnNumber: 2,
    config,
    recentMessages: [
      { role: 'user', content: 'I prefer concise answers with bullet points.' }
    ]
  });

  const userMemories = await engine.getStore().query({ scope: 'user', userId: 'user-1' });
  assert.equal(result.memoriesUpdated, 1);
  assert.equal(userMemories.length, 1);
  assert.match(userMemories[0].content, /bullet points/);

  await engine.getStore().close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ingest captures decision and task as separate records', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);

  const result = await engine.ingest({
    sessionId: 'session-d',
    turnNumber: 4,
    config,
    recentMessages: [
      {
        role: 'user',
        content: 'We decided to use SQLite as the main store for mem8. Next step is to improve retrieval quality with semantic ranking.'
      }
    ]
  });

  const projectMemories = await engine.getStore().query({ scope: 'project', projectId: 'project-1' });
  const taskMemories = await engine.getStore().query({ scope: 'session', sessionId: 'session-d', type: 'task' });
  assert.equal(result.errors.length, 0);
  assert.ok(projectMemories.some((memory) => memory.type === 'decision'));
  assert.ok(taskMemories.length >= 1);

  await engine.getStore().close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('assemble prioritizes scoped and important memories', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);
  const store = engine.getStore();

  await store.add({
    scope: 'session',
    type: 'fact',
    sessionId: 'session-e',
    content: 'Short-lived session note.',
    importance: 0.4,
    confidence: 0.6,
    source: 'conversation'
  });
  await store.add({
    scope: 'project',
    type: 'decision',
    projectId: 'project-1',
    content: 'mem8 must remain local-first and avoid cloud sync dependencies.',
    importance: 0.95,
    confidence: 0.9,
    source: 'conversation'
  });

  const assembled = await engine.assemble({
    sessionId: 'session-e',
    turnNumber: 1,
    config,
    availableTokens: 40,
    currentText: 'We are designing mem8 architecture.'
  });

  assert.equal(assembled.errors.length, 0);
  assert.ok(assembled.memories.length >= 1);
  assert.match(assembled.memories[0].content, /local-first/);

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
