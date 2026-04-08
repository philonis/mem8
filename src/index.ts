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

export const slot = 'memory';

const DEFAULT_CONFIG: Mem8Config = {
  apiUrl: 'https://api.mem9.ai',
  dbPath: `${process.env.HOME || '/tmp'}/.mem8/memories.sqlite`,
  debug: false,
  embeddingProvider: 'ollama',
  embeddingModel: 'nomic-embed-text:latest',
  embeddingBaseUrl: 'http://127.0.0.1:11434'
};

export async function initialize(config: Partial<Mem8Config> = {}): Promise<void> {
  const finalConfig: Mem8Config = { ...DEFAULT_CONFIG, ...config };

  console.log(`[mem8] Initializing v${PLUGIN_VERSION}`);
  console.log(
    '[mem8] Config:',
    JSON.stringify({
      apiUrl: finalConfig.apiUrl,
      dbPath: finalConfig.dbPath,
      debug: finalConfig.debug,
      embeddingProvider: finalConfig.embeddingProvider,
      embeddingModel: finalConfig.embeddingModel,
      embeddingBaseUrl: finalConfig.embeddingBaseUrl
    })
  );

  engine = new Mem8ContextEngine(finalConfig);
  store = engine.getStore();

  console.log('[mem8] Plugin initialized successfully');
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

export default {
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  slot,
  initialize,
  healthCheck,
  bootstrap,
  assemble,
  ingest,
  compact,
  prepareSubagentSpawn,
  onSubagentEnded
};
