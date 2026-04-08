const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Mem8ContextEngine } = require('../dist/context-engine.js');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem8-demo-'));
  const dbPath = path.join(dir, 'memories.sqlite');
  const config = {
    dbPath,
    debug: false,
    userId: 'gaolei',
    projectId: 'mem8',
    embeddingProvider: 'ollama',
    embeddingModel: 'nomic-embed-text:latest',
    embeddingBaseUrl: 'http://127.0.0.1:11434'
  };

  const engine = new Mem8ContextEngine(config);

  await engine.ingest({
    sessionId: 'demo-session',
    turnNumber: 1,
    config,
    recentMessages: [
      {
        role: 'user',
        content: 'mem8 must remain local-first and should not depend on cloud sync for its core memory architecture.'
      },
      {
        role: 'user',
        content: 'I prefer concise answers with short bullet points instead of long narrative reports.'
      },
      {
        role: 'user',
        content: 'We decided to use Ollama with nomic-embed-text as the first local embedding model.'
      }
    ]
  });

  const bootstrap = await engine.bootstrap({
    sessionId: 'demo-session',
    config
  });

  const assembled = await engine.assemble({
    sessionId: 'demo-session',
    turnNumber: 2,
    config,
    availableTokens: 120,
    currentText: 'How should mem8 handle local embedding and recall architecture?'
  });

  console.log(JSON.stringify({
    dbPath,
    bootstrapMemories: bootstrap.memories.map((m) => ({
      id: m.id,
      scope: m.scope,
      type: m.type,
      content: m.content,
      embeddingModel: m.embeddingModel,
      hasEmbedding: Array.isArray(m.embedding) && m.embedding.length > 0
    })),
    assembledMemories: assembled.memories.map((m) => ({
      id: m.id,
      scope: m.scope,
      type: m.type,
      content: m.content,
      embeddingModel: m.embeddingModel,
      hasEmbedding: Array.isArray(m.embedding) && m.embedding.length > 0
    })),
    tokenCount: assembled.tokenCount
  }, null, 2));

  await engine.getStore().close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
