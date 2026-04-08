const test = require('node:test');
const assert = require('node:assert/strict');

const { OllamaEmbeddingProvider } = require('../dist/ollama-embedding-provider.js');

test('Ollama embedding provider works with local nomic model when available', { skip: process.env.MEM8_SKIP_OLLAMA === '1' }, async () => {
  const provider = new OllamaEmbeddingProvider({
    baseUrl: 'http://127.0.0.1:11434',
    model: 'nomic-embed-text:latest'
  });

  const available = await provider.isAvailable();
  assert.equal(available, true);

  const vector = await provider.embed('mem8 should remain a local-first memory engine');
  assert.ok(Array.isArray(vector));
  assert.ok(vector.length > 0);
});
