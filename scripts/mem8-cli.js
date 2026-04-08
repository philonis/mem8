const fs = require('node:fs');
const path = require('node:path');

const { MemoryStore } = require('../dist/memory-store.js');
const { MemoryRanker } = require('../dist/memory-ranker.js');
const { OllamaEmbeddingProvider } = require('../dist/ollama-embedding-provider.js');

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

function makeStore(options) {
  return new MemoryStore({ dbPath: resolveDbPath(options.db) }, false);
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
  const ranked = await ranker.rank(rows, queryText);
  printTable(ranked.slice(0, options.top ? Number(options.top) : 20));
  await store.close();
}

async function showCommand(options) {
  if (!options.id) {
    throw new Error('show requires --id');
  }
  const store = makeStore(options);
  const rows = await store.query({ id: options.id, limit: 1 });
  if (rows.length === 0) {
    console.log('(not found)');
  } else {
    console.log(JSON.stringify(rows[0], null, 2));
  }
  await store.close();
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
  const { Mem8Config, DEFAULT_CONFIG } = require('../dist/config.js');
  const { checkHealth } = require('../dist/plugin-health.js');
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
  recall [--db <path>] --query <text> [--semantic true] [--model <ollama-model>] [--baseUrl <url>]
         [--scope <scope>] [--type <type>] [--session <id>] [--user <id>] [--project <id>] [--top <n>]
  show   [--db <path>] --id <memory-id>
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
    recall: recallCommand,
    show: showCommand,
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
