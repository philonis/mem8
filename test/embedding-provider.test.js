const test = require('node:test');
const assert = require('node:assert/strict');

const { cosineSimilarity } = require('../dist/embedding-provider.js');
const { MemoryRanker } = require('../dist/memory-ranker.js');

test('cosineSimilarity returns 1 for identical vectors', () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test('MemoryRanker falls back to heuristic ranking when no embedding provider is available', async () => {
  const ranker = new MemoryRanker();
  const ranked = await ranker.rankSemantic(
    [
      {
        id: '1',
        scope: 'session',
        type: 'fact',
        sessionId: 's',
        content: 'Short-lived note.',
        importance: 0.4,
        freshness: 0.4,
        confidence: 0.6,
        source: 'conversation',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: '2',
        scope: 'project',
        type: 'decision',
        projectId: 'p',
        content: 'mem8 must remain local-first and avoid cloud sync dependencies.',
        importance: 0.95,
        freshness: 0.95,
        confidence: 0.8,
        source: 'conversation',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ],
    'We are designing mem8 architecture.'
  );

  assert.equal(ranked[0].id, '2');
});
