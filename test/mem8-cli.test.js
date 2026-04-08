const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function makeDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem8-cli-'));
  return {
    dir,
    dbPath: path.join(dir, 'memories.sqlite')
  };
}

test('mem8 CLI can list, stats, show, and dump memories', () => {
  const { dir, dbPath } = makeDbPath();
  const seed = {
    version: 2,
    memories: [
      {
        id: 'm1',
        scope: 'user',
        type: 'preference',
        userId: 'u1',
        content: 'Prefer concise answers.',
        importance: 0.9,
        freshness: 0.9,
        confidence: 0.8,
        source: 'conversation',
        createdAt: 1,
        updatedAt: 1,
        embedding: [0.1, 0.2]
      }
    ]
  };
  fs.writeFileSync(path.join(dir, 'memories.json'), JSON.stringify(seed, null, 2));

  const listOut = execFileSync('node', ['scripts/mem8-cli.js', 'list', '--db', dbPath], {
    cwd: '/Users/qihoo/mem8',
    encoding: 'utf8'
  });
  assert.match(listOut, /Prefer concise answers/);

  const statsOut = execFileSync('node', ['scripts/mem8-cli.js', 'stats', '--db', dbPath], {
    cwd: '/Users/qihoo/mem8',
    encoding: 'utf8'
  });
  assert.match(statsOut, /"total": 1/);
  assert.match(statsOut, /"withEmbedding": 1/);

  const showOut = execFileSync('node', ['scripts/mem8-cli.js', 'show', '--db', dbPath, '--id', 'm1'], {
    cwd: '/Users/qihoo/mem8',
    encoding: 'utf8'
  });
  assert.match(showOut, /"id": "m1"/);

  const dumpOut = execFileSync('node', ['scripts/mem8-cli.js', 'dump', '--db', dbPath], {
    cwd: '/Users/qihoo/mem8',
    encoding: 'utf8'
  });
  assert.match(dumpOut, /"scope": "user"/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('mem8 CLI recall supports semantic mode when Ollama is available', () => {
  const { dir, dbPath } = makeDbPath();
  const seed = {
    version: 2,
    memories: [
      {
        id: 'm1',
        scope: 'project',
        type: 'decision',
        projectId: 'p1',
        content: 'mem8 must remain local-first and avoid cloud sync dependencies.',
        importance: 0.95,
        freshness: 0.95,
        confidence: 0.9,
        source: 'conversation',
        createdAt: 1,
        updatedAt: 1,
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'fake'
      }
    ]
  };
  fs.writeFileSync(path.join(dir, 'memories.json'), JSON.stringify(seed, null, 2));

  const out = execFileSync('node', ['scripts/mem8-cli.js', 'recall', '--db', dbPath, '--query', 'local-first architecture', '--top', '1'], {
    cwd: '/Users/qihoo/mem8',
    encoding: 'utf8'
  });
  assert.match(out, /local-first/);

  fs.rmSync(dir, { recursive: true, force: true });
});
