const fs = require('node:fs');
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

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripMarkdown(value) {
  return normalizeWhitespace(
    String(value || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
  );
}

function inferLegacyRecordShape(line, sectionPath, options = {}) {
  const text = stripMarkdown(line.replace(/^-+\s*/, ''));
  const section = sectionPath.join(' / ');
  const userSection = /高老师相关|高老师个人喜好|使用偏好/.test(section);
  const projectSection = /项目知识|项目概述|技术架构|API 端点|服务管理/.test(section);
  const taskLike = /(每天|定时|cron|需要|待办|跟进|下一步)/.test(text);
  const preferenceLike = /(喜欢|偏好|习惯|默认|尽量|不要|别用|格式[:：]|咖啡[:：]|爱好[:：])/.test(text);

  let scope = 'session';
  let type = 'fact';
  let importance = 0.72;
  let confidence = 0.82;

  if (userSection) {
    scope = 'user';
    type = preferenceLike ? 'preference' : taskLike ? 'task' : 'fact';
    importance = type === 'preference' ? 0.92 : type === 'task' ? 0.84 : 0.8;
  } else if (projectSection) {
    scope = options.projectId ? 'project' : 'session';
    type = taskLike ? 'task' : 'fact';
    importance = type === 'task' ? 0.82 : 0.78;
  } else if (/定时任务/.test(section)) {
    scope = options.projectId ? 'project' : 'session';
    type = 'task';
    importance = 0.86;
  } else if (/个人喜好/.test(section) || preferenceLike) {
    scope = 'user';
    type = 'preference';
    importance = 0.9;
  }

  return {
    scope,
    type,
    content: text,
    summary: text.length > 72 ? `${text.slice(0, 69)}...` : text,
    importance,
    confidence
  };
}

function parseMemoryMdFile(filePath, options = {}) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const sectionPath = [];
  const records = [];

  for (const line of lines) {
    const heading = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      sectionPath[level - 2] = stripMarkdown(heading[2]);
      sectionPath.length = Math.max(0, level - 1);
      continue;
    }

    if (!/^\s*-\s+/.test(line) || /^\s*---+\s*$/.test(line)) {
      continue;
    }

    const shape = inferLegacyRecordShape(line, sectionPath.filter(Boolean), options);
    records.push({
      ...shape,
      sessionId: options.sessionId,
      userId: shape.scope === 'user' ? options.userId : undefined,
      projectId: shape.scope === 'project' ? options.projectId : undefined,
      source: 'system',
      metadata: {
        importedFrom: filePath,
        legacyKind: 'workspace-memory-md',
        legacySectionPath: sectionPath.filter(Boolean)
      }
    });
  }

  return records;
}

function parseLegacySessionFile(filePath, options = {}) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const sessionKey = raw.match(/^\-\s+\*\*Session Key\*\*:\s+(.+)$/m)?.[1]?.trim();
  const sessionId = raw.match(/^\-\s+\*\*Session ID\*\*:\s+(.+)$/m)?.[1]?.trim();
  const senderId = raw.match(/"sender_id":\s*"([^"]+)"/)?.[1]?.trim();
  const title = path.basename(filePath, path.extname(filePath)).replace(/-/g, ' ');
  const summaryBody = raw.split(/## Conversation Summary/i)[1] || raw;
  const content = normalizeWhitespace(
    `Legacy conversation summary (${title}): ${stripMarkdown(summaryBody).slice(0, options.maxChars || 1800)}`
  );

  if (!content) {
    return null;
  }

  return {
    scope: 'session',
    type: 'summary',
    sessionId: sessionId || options.sessionId,
    userId: senderId || options.userId,
    projectId: options.projectId,
    content,
    summary: content.length > 96 ? `${content.slice(0, 93)}...` : content,
    importance: 0.42,
    freshness: 0.35,
    confidence: 0.65,
    source: 'system',
    metadata: {
      importedFrom: filePath,
      legacyKind: 'workspace-memory-file',
      legacySessionKey: sessionKey,
      legacySessionId: sessionId,
      legacySenderId: senderId
    }
  };
}

async function detectPreferredUserId(store, explicitUserId) {
  if (explicitUserId) {
    return explicitUserId;
  }

  const rows = await store.query({ limit: 100000 });
  const counts = new Map();
  for (const row of rows) {
    if (!row.userId) continue;
    counts.set(row.userId, (counts.get(row.userId) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

async function importLegacyOpenClawCommand(options) {
  const store = makeStore(options);
  const existing = await store.query({ limit: 100000 });
  const existingContent = new Set(existing.map((row) => normalizeWhitespace(row.content).toLowerCase()));
  const userId = await detectPreferredUserId(store, options.user);
  const memoryMdPath = options.memoryMd;
  const memoryDirPath = options.memoryDir;
  const records = [];

  if (memoryMdPath) {
    records.push(...parseMemoryMdFile(memoryMdPath, { userId, projectId: options.project }));
  }

  if (memoryDirPath && fs.existsSync(memoryDirPath)) {
    const files = fs.readdirSync(memoryDirPath)
      .filter((name) => name.endsWith('.md'))
      .sort();
    for (const file of files) {
      const record = parseLegacySessionFile(path.join(memoryDirPath, file), { userId, projectId: options.project });
      if (record) {
        records.push(record);
      }
    }
  }

  let imported = 0;
  let skipped = 0;
  for (const record of records) {
    const key = normalizeWhitespace(record.content).toLowerCase();
    if (!key || existingContent.has(key)) {
      skipped += 1;
      continue;
    }
    if (options.dryRun === 'true') {
      imported += 1;
      existingContent.add(key);
      continue;
    }
    await store.add(record);
    imported += 1;
    existingContent.add(key);
  }

  console.log(
    JSON.stringify(
      {
        dbPath: resolveDbPath(options.db),
        userId: userId || null,
        imported,
        skipped,
        sources: {
          memoryMd: memoryMdPath || null,
          memoryDir: memoryDirPath || null
        }
      },
      null,
      2
    )
  );
  await store.close();
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
  import-openclaw [--db <path>] [--memoryMd <path>] [--memoryDir <path>] [--user <id>] [--project <id>] [--dryRun true]
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
    'import-openclaw': importLegacyOpenClawCommand,
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
