const test = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_CONFIG, normalizeConfig, validateConfig } = require('../dist/config.js');

test('normalizeConfig accepts embeddingUrl alias and preserves shared defaults', () => {
  const config = normalizeConfig({
    embeddingProvider: 'none',
    embeddingUrl: 'http://localhost:11434'
  });

  assert.equal(config.embeddingBaseUrl, 'http://localhost:11434');
  assert.equal(config.embeddingProvider, 'none');
  assert.equal(config.maxTokensPerAssemble, DEFAULT_CONFIG.maxTokensPerAssemble);
});

test('validateConfig returns canonical config with embeddingBaseUrl', () => {
  const config = validateConfig({
    dbPath: '/tmp/mem8.sqlite',
    embeddingUrl: 'http://127.0.0.1:11434',
    maxTokensPerAssemble: 320
  });

  assert.equal(config.dbPath, '/tmp/mem8.sqlite');
  assert.equal(config.embeddingBaseUrl, 'http://127.0.0.1:11434');
  assert.equal(config.maxTokensPerAssemble, 320);
});

test('validateConfig rejects invalid token budgets', () => {
  assert.throws(() => validateConfig({ maxTokensPerAssemble: 10 }), /maxTokensPerAssemble must be between 50 and 5000/);
});
