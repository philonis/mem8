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
    availableTokens: 120,
    currentText: 'We are designing mem8 architecture.'
  });

  assert.equal(assembled.errors.length, 0);
  assert.ok(assembled.memories.length >= 1);
  assert.ok(assembled.memories.some((memory) => /local-first/.test(memory.content)));

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('assemble keeps budget-fitting memories when top-ranked item exceeds token budget', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);
  const store = engine.getStore();

  await store.add({
    scope: 'project',
    type: 'decision',
    projectId: 'project-1',
    content: 'Critical architecture decision '.repeat(20).trim(),
    importance: 0.99,
    confidence: 0.95,
    source: 'conversation'
  });
  await store.add({
    scope: 'user',
    type: 'preference',
    userId: 'user-1',
    content: 'User prefers concise status updates.',
    importance: 0.8,
    confidence: 0.85,
    source: 'conversation'
  });
  await store.add({
    scope: 'session',
    type: 'fact',
    sessionId: 'session-f',
    content: 'Current task is validating memory assembly output.',
    importance: 0.65,
    confidence: 0.8,
    source: 'conversation'
  });

  const assembled = await engine.assemble({
    sessionId: 'session-f',
    turnNumber: 1,
    config,
    availableTokens: 100,
    currentText: 'We need concise updates while validating memory assembly.'
  });

  assert.equal(assembled.errors.length, 0);
  assert.equal(assembled.memories.length, 2);
  assert.ok(assembled.memories.every((memory) => memory.content.length < 120));

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('assemble respects configured maxTokensPerAssemble cap', async () => {
  const { dir, config } = makeTempConfig();
  config.maxTokensPerAssemble = 18;
  const engine = new Mem8ContextEngine(config);
  const store = engine.getStore();

  await store.add({
    scope: 'project',
    type: 'decision',
    projectId: 'project-1',
    content: 'Keep mem8 local first with SQLite persistence.',
    importance: 0.95,
    confidence: 0.9,
    source: 'conversation'
  });
  await store.add({
    scope: 'user',
    type: 'preference',
    userId: 'user-1',
    content: 'Use concise bullet updates.',
    importance: 0.8,
    confidence: 0.85,
    source: 'conversation'
  });

  const assembled = await engine.assemble({
    sessionId: 'session-g',
    turnNumber: 1,
    config,
    availableTokens: 400,
    currentText: 'Need concise local-first guidance.'
  });

  assert.equal(assembled.errors.length, 0);
  assert.ok(assembled.tokenCount <= 18);

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('searchMemories returns virtual path and citation metadata', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);
  const store = engine.getStore();

  const memory = await store.add({
    scope: 'project',
    type: 'decision',
    projectId: 'project-1',
    content: 'We decided to keep mem8 local-first with SQLite persistence and semantic recall.',
    summary: 'Keep mem8 local-first.',
    importance: 0.95,
    confidence: 0.88,
    source: 'conversation'
  });

  const results = await engine.searchMemories({
    query: 'local-first sqlite',
    projectId: 'project-1',
    maxResults: 3
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].id, memory.id);
  assert.match(results[0].path, new RegExp(`memory/project/project-1/${memory.id}\\.md$`));
  assert.ok(results[0].startLine >= 1);
  assert.ok(results[0].endLine >= results[0].startLine);
  assert.match(results[0].citation, /#L\d+-L\d+$/);
  assert.match(results[0].snippet, /local-first/i);

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('getMemoryByPath supports virtual paths and line slicing', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);
  const store = engine.getStore();

  const memory = await store.add({
    scope: 'user',
    type: 'preference',
    userId: 'user-1',
    content: 'Prefer concise progress updates.\nPrefer bullet points for action items.',
    importance: 0.9,
    confidence: 0.8,
    source: 'conversation'
  });

  const full = await engine.getMemoryByPath(`memory/user/user-1/${memory.id}.md`);
  assert.equal(full.found, true);
  assert.equal(full.id, memory.id);
  assert.match(full.text, /## Content/);
  assert.match(full.text, /Prefer concise progress updates/);

  const sliced = await engine.getMemoryByPath(`memory/user/user-1/${memory.id}.md`, 15, 2);
  assert.equal(sliced.found, true);
  assert.equal(sliced.startLine, 15);
  assert.equal(sliced.endLine, 16);
  assert.doesNotMatch(sliced.text, /# mem8 memory/);
  assert.match(sliced.text, /Prefer concise progress updates/);

  const missing = await engine.getMemoryByPath('memory/user/user-1/missing.md', 5, 2);
  assert.equal(missing.found, false);
  assert.equal(missing.startLine, 5);
  assert.equal(missing.endLine, 5);

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('status and index report embedding readiness for local stores', async () => {
  const { dir, config } = makeTempConfig();
  const engine = new Mem8ContextEngine(config);
  const store = engine.getStore();

  await store.add({
    scope: 'session',
    type: 'fact',
    sessionId: 'session-status',
    content: 'Current debugging task is validating status output.',
    importance: 0.6,
    confidence: 0.7,
    source: 'conversation'
  });
  await store.add({
    scope: 'project',
    type: 'decision',
    projectId: 'project-1',
    content: 'Ship search and get tooling before claiming inspectable memory.',
    importance: 0.9,
    confidence: 0.85,
    source: 'conversation'
  });

  const status = await engine.getStatus();
  assert.equal(status.healthy, true);
  assert.equal(status.memoryCount, 2);
  assert.equal(status.embeddingAvailable, false);
  assert.equal(status.pendingEmbeddingCount, 2);
  assert.equal(status.scopeCounts.session, 1);
  assert.equal(status.scopeCounts.project, 1);
  assert.equal(status.typeCounts.fact, 1);
  assert.equal(status.typeCounts.decision, 1);

  const indexed = await engine.indexMemories();
  assert.equal(indexed.indexed, 0);
  assert.equal(indexed.skipped, 2);
  assert.equal(indexed.total, 2);
  assert.equal(indexed.embeddingAvailable, false);

  await store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
