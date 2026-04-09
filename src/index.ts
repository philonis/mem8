import { Mem8ContextEngine } from './context-engine';
import { MemoryStore } from './memory-store';
import type {
  AssembleOutput,
  BootstrapOutput,
  CompactOutput,
  IngestOutput,
  OnSubagentEndedOutput,
  PrepareSubagentSpawnOutput
} from './types';
import { Mem8Config, MemoryRecord } from './types';

const PLUGIN_NAME = 'mem8';
const PLUGIN_VERSION = '0.1.0';

let engine: Mem8ContextEngine | null = null;
let store: MemoryStore | null = null;
let activeConfig: Mem8Config | null = null;

export const slot = 'memory';

const DEFAULT_CONFIG: Mem8Config = {
  dbPath: `${process.env.HOME || '/tmp'}/.mem8/memories.sqlite`,
  debug: false,
  embeddingProvider: 'ollama',
  embeddingModel: 'nomic-embed-text:latest',
  embeddingBaseUrl: 'http://127.0.0.1:11434',
  maxTokensPerAssemble: 500
};

function normalizeConfig(config: Partial<Mem8Config> = {}): Mem8Config {
  const finalConfig: Mem8Config = { ...DEFAULT_CONFIG, ...config };
  // Accept the newer embeddingUrl spelling from plugin config.
  const pluginConfig = config as Partial<Mem8Config> & { embeddingUrl?: string };
  if (pluginConfig.embeddingUrl) {
    finalConfig.embeddingBaseUrl = pluginConfig.embeddingUrl;
  }
  return finalConfig;
}

function ensureInitialized(config: Partial<Mem8Config> = {}): Mem8ContextEngine {
  const finalConfig = normalizeConfig(config);
  const currentConfig = JSON.stringify(activeConfig || {});
  const nextConfig = JSON.stringify(finalConfig);

  if (!engine || currentConfig !== nextConfig) {
    activeConfig = finalConfig;
    engine = new Mem8ContextEngine(finalConfig);
    store = engine.getStore();
    console.log(`[mem8] Initialized v${PLUGIN_VERSION}`);
  }

  return engine;
}

export async function initialize(config: Partial<Mem8Config> = {}): Promise<void> {
  ensureInitialized(config);
}

export function getEngine(): Mem8ContextEngine | null {
  return engine;
}

export function getStore(): MemoryStore | null {
  return store;
}

export async function healthCheck(): Promise<{
  healthy: boolean;
  version: string;
  memoryCount?: number;
  error?: string;
}> {
  if (!engine) {
    return { healthy: false, version: PLUGIN_VERSION, error: 'Plugin not initialized' };
  }

  const engineHealth = await engine.healthCheck();
  return {
    healthy: engineHealth.healthy,
    version: PLUGIN_VERSION,
    memoryCount: engineHealth.memoryCount,
    error: engineHealth.error
  };
}

export { Mem8Config, MemoryRecord, MemoryStore, Mem8ContextEngine };
export { Mem8ContextEngine as ContextEngine };

export async function bootstrap(input: unknown): Promise<BootstrapOutput> {
  if (!engine) {
    return { memories: [], errors: ['Not initialized'] };
  }
  return engine.bootstrap(input as Parameters<Mem8ContextEngine['bootstrap']>[0]);
}

export async function assemble(input: unknown): Promise<AssembleOutput> {
  if (!engine) {
    return { memories: [], tokenCount: 0, errors: ['Not initialized'] };
  }
  return engine.assemble(input as Parameters<Mem8ContextEngine['assemble']>[0]);
}

export async function ingest(input: unknown): Promise<IngestOutput> {
  if (!engine) {
    return { memoriesAdded: 0, memoriesUpdated: 0, errors: ['Not initialized'] };
  }
  return engine.ingest(input as Parameters<Mem8ContextEngine['ingest']>[0]);
}

export async function compact(input: unknown): Promise<CompactOutput> {
  if (!engine) {
    return { kept: [], evicted: [], tokenCount: 0, errors: ['Not initialized'] };
  }
  return engine.compact(input as Parameters<Mem8ContextEngine['compact']>[0]);
}

export async function prepareSubagentSpawn(input: unknown): Promise<PrepareSubagentSpawnOutput> {
  if (!engine) {
    return { memories: [], instructions: '', errors: ['Not initialized'] };
  }
  return engine.prepareSubagentSpawn(input as Parameters<Mem8ContextEngine['prepareSubagentSpawn']>[0]);
}

export async function onSubagentEnded(input: unknown): Promise<OnSubagentEndedOutput> {
  if (!engine) {
    return { memoriesFromSubagent: [], errors: ['Not initialized'] };
  }
  return engine.onSubagentEnded(input as Parameters<Mem8ContextEngine['onSubagentEnded']>[0]);
}

export function register(api: any): void {
  const pluginConfig = api?.pluginConfig || {};
  ensureInitialized(pluginConfig);

  if (typeof api?.registerTool === 'function') {
    api.registerTool(createMemorySearchToolFactory(pluginConfig), { names: ['memory_search'] });
    api.registerTool(createMemoryGetToolFactory(pluginConfig), { names: ['memory_get'] });
  }

  if (typeof api?.registerCli === 'function') {
    api.registerCli(createMemoryCliRegistrar(pluginConfig), { commands: ['memory'] });
  }
}

export const activate = register;
export const configSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dbPath: {
      type: 'string',
      description: 'SQLite database path for mem8 storage.'
    },
    embeddingProvider: {
      type: 'string',
      enum: ['ollama', 'none'],
      description: 'Embedding provider for semantic recall.'
    },
    embeddingModel: {
      type: 'string',
      description: 'Embedding model id, usually nomic-embed-text:latest.'
    },
    embeddingUrl: {
      type: 'string',
      description: 'Base URL for the local Ollama server.'
    },
    maxTokensPerAssemble: {
      type: 'number',
      minimum: 50,
      maximum: 5000,
      description: 'Maximum token budget for assembled memory payloads.'
    },
    debug: {
      type: 'boolean',
      description: 'Enable verbose debug logging.'
    }
  }
} as const;

export const mem8 = {
  id: PLUGIN_NAME,
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  kind: 'memory' as const,
  description: 'Local-first persistent memory and context engine for OpenClaw',
  configSchema,
  slot,
  initialize,
  healthCheck,
  bootstrap,
  assemble,
  ingest,
  compact,
  prepareSubagentSpawn,
  onSubagentEnded,
  register,
  activate
};

export default mem8;

function createMemorySearchToolFactory(pluginConfig: Partial<Mem8Config>) {
  return (ctx: any) => ({
    name: 'memory_search',
    label: 'Mem8 Search',
    description: 'Searches the local mem8 store for relevant memories and returns concise snippets.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number' },
        scope: { type: 'string' },
        type: { type: 'string' },
        sessionId: { type: 'string' },
        userId: { type: 'string' },
        projectId: { type: 'string' },
        minScore: { type: 'number' }
      },
      required: ['query']
    },
    execute: async (_toolCallId: string, params: Record<string, unknown> = {}) => {
      const query = readRequiredString(params.query, 'query');
      const maxResults = readOptionalNumber(params.maxResults);
      const scope = readOptionalString(params.scope);
      const type = readOptionalString(params.type);
      const sessionId = readOptionalString(params.sessionId) || ctx?.sessionKey;
      const userId = readOptionalString(params.userId);
      const projectId = readOptionalString(params.projectId);
      const minScore = readOptionalNumber(params.minScore);
      const currentEngine = ensureInitialized(pluginConfig);
      const results = await currentEngine.searchMemories({
        query,
        maxResults,
        scope: isValidScope(scope) ? scope : undefined,
        type: isValidType(type) ? type : undefined,
        sessionId,
        userId,
        projectId,
        minScore
      });

      return {
        results: results.map((result) => ({
          id: result.id,
          path: result.path,
          scope: result.scope,
          type: result.type,
          snippet: result.snippet,
          summary: result.summary,
          score: result.score,
          updatedAt: result.updatedAt,
          startLine: result.startLine,
          endLine: result.endLine,
          citation: result.citation
        }))
      };
    }
  });
}

function createMemoryGetToolFactory(pluginConfig: Partial<Mem8Config>) {
  return () => ({
    name: 'memory_get',
    label: 'Mem8 Get',
    description: 'Reads a specific mem8 memory by virtual path or record id, with optional line slicing.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        id: { type: 'string' },
        from: { type: 'number' },
        lines: { type: 'number' }
      },
      anyOf: [{ required: ['path'] }, { required: ['id'] }]
    },
    execute: async (_toolCallId: string, params: Record<string, unknown> = {}) => {
      const path = readOptionalString(params.path) || readOptionalString(params.id);
      if (!path) {
        throw new Error('path or id required');
      }
      const from = readOptionalNumber(params.from);
      const lines = readOptionalNumber(params.lines);
      const currentEngine = ensureInitialized(pluginConfig);
      return await currentEngine.getMemoryByPath(path, from, lines);
    }
  });
}

function createMemoryCliRegistrar(pluginConfig: Partial<Mem8Config>) {
  return ({ program }: any) => {
    if (!program || typeof program.command !== 'function') {
      return;
    }

    const memory = program.command('memory').description('Inspect mem8 local memory records');

    memory
      .command('status')
      .description('Show mem8 memory/index status')
      .action(async () => {
        const currentEngine = ensureInitialized(pluginConfig);
        const status = await currentEngine.getStatus();
        process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      });

    memory
      .command('index')
      .description('Backfill or refresh mem8 embeddings for semantic recall')
      .option('--force', 're-embed all memories even if an embedding already exists')
      .action(async (options: { force?: boolean }) => {
        const currentEngine = ensureInitialized(pluginConfig);
        const result = await currentEngine.indexMemories({ force: Boolean(options.force) });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      });

    memory
      .command('search [query]')
      .description('Search mem8 records with snippet-style recall output')
      .option('--query <text>', 'query text')
      .option('--max-results <n>', 'maximum number of results', '8')
      .option('--min-score <n>', 'minimum score threshold')
      .action(async (query: string | undefined, options: { query?: string; maxResults?: string; minScore?: string }) => {
        const actualQuery = (options.query || query || '').trim();
        if (!actualQuery) {
          throw new Error('query required');
        }
        const currentEngine = ensureInitialized(pluginConfig);
        const results = await currentEngine.searchMemories({
          query: actualQuery,
          maxResults: Number(options.maxResults || '8'),
          minScore: readOptionalNumber(options.minScore)
        });
        process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
      });

    memory
      .command('get')
      .description('Read one mem8 memory by virtual path or id')
      .option('--path <path>', 'memory virtual path')
      .option('--id <id>', 'legacy memory id')
      .option('--from <line>', 'start line (1-based)')
      .option('--lines <n>', 'number of lines to read')
      .action(async (options: { path?: string; id?: string; from?: string; lines?: string }) => {
        const pathOrId = options.path || options.id;
        if (!pathOrId) {
          throw new Error('path or id required');
        }
        const currentEngine = ensureInitialized(pluginConfig);
        const result = await currentEngine.getMemoryByPath(
          pathOrId,
          readOptionalNumber(options.from),
          readOptionalNumber(options.lines)
        );
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      });
  };
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isValidScope(value: string | undefined): value is MemoryRecord['scope'] {
  return value === 'session' || value === 'user' || value === 'project';
}

function isValidType(value: string | undefined): value is MemoryRecord['type'] {
  return value === 'fact' || value === 'preference' || value === 'decision' || value === 'task' || value === 'summary';
}
