const path = require('node:path');

const { Mem8ContextEngine } = require('../dist/context-engine.js');
const { MemoryStore } = require('../dist/memory-store.js');
const { MemoryRanker } = require('../dist/memory-ranker.js');
const { OllamaEmbeddingProvider } = require('../dist/ollama-embedding-provider.js');
const { DEFAULT_CONFIG } = require('../dist/config.js');
const { checkHealth } = require('../dist/plugin-health.js');

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
      options[key] = value;
    }
  }
  return { command, options };
}

function resolveDbPath(inputPath) {
  if (inputPath) return inputPath;
  return path.join(process.env.HOME || '/tmp', '.mem8', 'memories.sqlite');
}

function makeConfig(options = {}) {
  const embeddingProvider = options.embeddingProvider || (options.semantic === 'true' ? 'ollama' : 'none');
  return {
    ...DEFAULT_CONFIG,
    dbPath: resolveDbPath(options.db),
    embeddingProvider,
    embeddingModel: options.model || DEFAULT_CONFIG.embeddingModel,
    embeddingBaseUrl: options.baseUrl || DEFAULT_CONFIG.embeddingBaseUrl
  };
}

function makeStore(options) {
  return new MemoryStore({ dbPath: resolveDbPath(options.db) }, false);
}

function makeEngine(options = {}) {
  return new Mem8ContextEngine(makeConfig(options));
}

function printTable(rows) {
  if (rows.length === 0) {
    console.log('(no memories)');
    return;
  }
  for (const row of rows) {
    const preview = row.content.length > 100 ? `${row.content.slice(0, 97)}...` : row.content;
    console.log(`${row.id} | ${row.scope}/${row.type} | imp=${row.importance.toFixed(2)} conf=${row.confidence.toFixed(2)} emb=${row.embedding && row.embedding.length ? 'yes' : 'no'}`);
    console.log(`  ${preview}`);
  }
}

function toNumber(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function listCommand(options) {
  const store = makeStore(options);
  const limit = options.limit ? Number(options.limit) : 20;
  const query = {
    scope: options.scope,
    type: options.type,
    sessionId: options.session,
    userId: options.user,
    projectId: options.project,
    search: options.search,
    limit
  };
  const rows = await store.query(query);
  printTable(rows);
  await store.close();
}

async function statsCommand(options) {
  const store = makeStore(options);
  const rows = await store.query({ limit: 100000 });
  const stats = {
    dbPath: resolveDbPath(options.db),
    total: rows.length,
    withEmbedding: rows.filter((row) => row.embedding && row.embedding.length).length,
    byScope: {},
    byType: {}
  };
  for (const row of rows) {
    stats.byScope[row.scope] = (stats.byScope[row.scope] || 0) + 1;
    stats.byType[row.type] = (stats.byType[row.type] || 0) + 1;
  }
  console.log(JSON.stringify(stats, null, 2));
  await store.close();
}

async function statusCommand(options) {
  const engine = makeEngine(options);
  const status = await engine.getStatus();
  console.log(JSON.stringify(status, null, 2));
  await engine.getStore().close();
}

async function indexCommand(options) {
  const engine = makeEngine(options);
  const result = await engine.indexMemories({ force: options.force === 'true' });
  console.log(JSON.stringify(result, null, 2));
  await engine.getStore().close();
}

async function recallCommand(options) {
  const queryText = options.query || options.q;
  if (!queryText) {
    throw new Error('recall requires --query');
  }
  const store = makeStore(options);
  const provider = options.semantic === 'true'
    ? new OllamaEmbeddingProvider({
        baseUrl: options.baseUrl || 'http://127.0.0.1:11434',
        model: options.model || 'nomic-embed-text:latest'
      })
    : undefined;
  const ranker = new MemoryRanker(provider);
  const rows = await store.query({
    sessionId: options.session,
    userId: options.user,
    projectId: options.project,
    scope: options.scope,
    type: options.type,
    limit: options.top ? Number(options.top) : 20
  });
  if (rows.length === 0) {
    console.log('(no results)');
    await store.close();
    return;
  }
  const ranked = options.semantic === 'true'
    ? await ranker.rankSemantic(rows, queryText)
    : ranker.rank(rows, queryText);
  printTable(ranked.slice(0, options.top ? Number(options.top) : 20));
  await store.close();
}

async function searchCommand(options) {
  const queryText = options.query || options.q;
  if (!queryText) {
    throw new Error('search requires --query');
  }
  const engine = makeEngine(options);
  const results = await engine.searchMemories({
    query: queryText,
    scope: options.scope,
    type: options.type,
    sessionId: options.session,
    userId: options.user,
    projectId: options.project,
    maxResults: toNumber(options.top || options.maxResults, 8),
    minScore: options.minScore === undefined ? undefined : toNumber(options.minScore, 0)
  });
  console.log(JSON.stringify({ results }, null, 2));
  await engine.getStore().close();
}

async function showCommand(options) {
  if (!options.id) {
    throw new Error('show requires --id');
  }
  const store = makeStore(options);
  const row = await store.getById(options.id);
  if (!row) {
    console.log('(not found)');
  } else {
    console.log(JSON.stringify(row, null, 2));
  }
  await store.close();
}

async function getCommand(options) {
  const pathOrId = options.path || options.id;
  if (!pathOrId) {
    throw new Error('get requires --path or --id');
  }
  const engine = makeEngine(options);
  const result = await engine.getMemoryByPath(pathOrId, toNumber(options.from, undefined), toNumber(options.lines, undefined));
  console.log(JSON.stringify(result, null, 2));
  await engine.getStore().close();
}

async function deleteCommand(options) {
  if (!options.id) {
    throw new Error('delete requires --id');
  }
  const store = makeStore(options);
  await store.delete(options.id);
  console.log('deleted');
  await store.close();
}

async function dumpCommand(options) {
  const store = makeStore(options);
  const query = {
    scope: options.scope,
    type: options.type,
    sessionId: options.session,
    userId: options.user,
    projectId: options.project,
    limit: 100000
  };
  const rows = await store.query(query);
  console.log(JSON.stringify(rows, null, 2));
  await store.close();
}

async function healthCommand(options) {
  const config = { ...DEFAULT_CONFIG, dbPath: resolveDbPath(options.db) };
  const health = checkHealth(config);
  console.log(JSON.stringify(health, null, 2));
}

function help() {
  console.log(`mem8 CLI

Commands:
  list   [--db <path>] [--scope session|user|project] [--type fact|preference|decision|task|summary]
         [--session <id>] [--user <id>] [--project <id>] [--search <text>] [--limit <n>]
  stats  [--db <path>]
  status [--db <path>] [--embeddingProvider ollama|none] [--model <ollama-model>] [--baseUrl <url>]
  index  [--db <path>] [--force true] [--embeddingProvider ollama|none] [--model <ollama-model>] [--baseUrl <url>]
  recall [--db <path>] --query <text> [--semantic true] [--model <ollama-model>] [--baseUrl <url>]
         [--scope <scope>] [--type <type>] [--session <id>] [--user <id>] [--project <id>] [--top <n>]
  search [--db <path>] --query <text> [--scope <scope>] [--type <type>] [--session <id>] [--user <id>]
         [--project <id>] [--top <n>] [--minScore <n>] [--embeddingProvider ollama|none] [--model <ollama-model>] [--baseUrl <url>]
  show   [--db <path>] --id <memory-id>
  get    [--db <path>] (--path <virtual-path> | --id <memory-id>) [--from <line>] [--lines <n>]
  delete [--db <path>] --id <memory-id>
  dump   [--db <path>] [--scope <scope>] [--type <type>] [--session <id>] [--user <id>] [--project <id>]
  health [--db <path>]
`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help' || command === '-h') {
    help();
    return;
  }
  const commands = {
    list: listCommand,
    stats: statsCommand,
    status: statusCommand,
    index: indexCommand,
    recall: recallCommand,
    search: searchCommand,
    show: showCommand,
    get: getCommand,
    delete: deleteCommand,
    dump: dumpCommand,
    health: healthCommand
  };
  const fn = commands[command];
  if (!fn) {
    help();
    process.exitCode = 1;
    return;
  }
  try {
    await fn(options);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
