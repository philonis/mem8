const test = require('node:test');
const assert = require('node:assert/strict');

const { MemoryExtractor } = require('../dist/memory-extractor.js');
const { MemoryRanker } = require('../dist/memory-ranker.js');
const { MemoryCompactor } = require('../dist/memory-compactor.js');
const { MemoryHygiene } = require('../dist/memory-hygiene.js');

test('MemoryExtractor classifies preference into user scope', () => {
  const extractor = new MemoryExtractor();
  const records = extractor.extract({
    sessionId: 'session-1',
    turnNumber: 1,
    config: { userId: 'user-1', projectId: 'project-1' },
    recentMessages: [
      { role: 'user', content: 'I prefer concise updates with bullet points because they are easier to scan quickly.' }
    ]
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'preference');
  assert.equal(records[0].scope, 'user');
  assert.equal(records[0].metadata.extractedBy, 'rule-based-v2');
});

test('MemoryExtractor classifies project decisions and task follow-ups', () => {
  const extractor = new MemoryExtractor();
  const records = extractor.extract({
    sessionId: 'session-2',
    turnNumber: 2,
    config: { userId: 'user-1', projectId: 'project-1' },
    recentMessages: [
      {
        role: 'user',
        content: 'We decided to use SQLite as the default store for mem8. Next step is to improve retrieval quality with semantic ranking.'
      }
    ]
  });

  assert.equal(records.length, 2);
  assert.equal(records[0].type, 'decision');
  assert.equal(records[0].scope, 'project');
  assert.equal(records[1].type, 'task');
  assert.equal(records[1].scope, 'session');
});

test('MemoryExtractor filters obvious chat noise', () => {
  const extractor = new MemoryExtractor();
  const records = extractor.extract({
    sessionId: 'session-3',
    turnNumber: 1,
    config: { userId: 'user-1', projectId: 'project-1' },
    recentMessages: [
      { role: 'user', content: '好的。谢谢。mem8 必须保持本地优先，不能依赖云同步。' }
    ]
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'fact');
  assert.equal(records[0].scope, 'project');
});

test('MemoryHygiene merges similar preference memories', () => {
  const hygiene = new MemoryHygiene();
  const existing = {
    id: '1',
    scope: 'user',
    type: 'preference',
    userId: 'u1',
    content: 'Prefer concise answers.',
    summary: 'Prefer concise answers.',
    importance: 0.8,
    freshness: 0.8,
    confidence: 0.7,
    source: 'conversation',
    createdAt: 1,
    updatedAt: 1,
    metadata: { a: 1 }
  };
  const incoming = {
    scope: 'user',
    type: 'preference',
    userId: 'u1',
    content: 'Prefer concise answers with bullet points.',
    summary: 'Prefer concise answers with bullet points.',
    importance: 0.9,
    freshness: 0.9,
    confidence: 0.8,
    source: 'conversation',
    metadata: { b: 2 }
  };

  assert.equal(hygiene.shouldMerge(existing, incoming, 0.8), true);
  const patch = hygiene.mergePatch(existing, incoming);
  assert.match(patch.content, /bullet points/);
  assert.equal(patch.importance, 0.9);
});

test('MemoryRanker prioritizes project decisions over weak session notes', () => {
  const ranker = new MemoryRanker();
  const ranked = ranker.rank(
    [
      {
        id: '1', scope: 'session', type: 'fact', sessionId: 's', content: 'Short-lived note.',
        importance: 0.4, freshness: 0.4, confidence: 0.6, source: 'conversation', createdAt: Date.now(), updatedAt: Date.now()
      },
      {
        id: '2', scope: 'project', type: 'decision', projectId: 'p', content: 'mem8 must remain local-first and avoid cloud sync dependencies.',
        importance: 0.95, freshness: 0.95, confidence: 0.8, source: 'conversation', createdAt: Date.now(), updatedAt: Date.now()
      }
    ],
    'We are designing mem8 architecture.'
  );

  assert.equal(ranked[0].id, '2');
});

test('MemoryCompactor keeps highest-value long-term memories and prunes stale noise', () => {
  const compactor = new MemoryCompactor();
  const now = Date.now();
  const result = compactor.compact(
    [
      {
        id: '1', scope: 'session', type: 'fact', sessionId: 's', content: 'tiny noisy note',
        importance: 0.2, freshness: 0.2, confidence: 0.6, source: 'conversation', createdAt: 1, updatedAt: now - 10 * 24 * 60 * 60 * 1000
      },
      {
        id: '2', scope: 'project', type: 'decision', projectId: 'p', content: 'A much more important architecture decision for mem8.',
        importance: 0.95, freshness: 0.95, confidence: 0.8, source: 'conversation', createdAt: 2, updatedAt: now
      }
    ],
    20
  );

  assert.equal(result.kept[0].id, '2');
  assert.ok(result.evicted.some((memory) => memory.id === '1'));
});
