import { EmbeddingProvider } from './embedding-provider';
import { MemoryCompactor } from './memory-compactor';
import { MemoryHygiene } from './memory-hygiene';
import { MemoryExtractor } from './memory-extractor';
import { MemoryRanker } from './memory-ranker';
import { MemoryStore } from './memory-store';
import { OllamaEmbeddingProvider } from './ollama-embedding-provider';
import {
  AssembleInput,
  AssembleOutput,
  BootstrapInput,
  BootstrapOutput,
  CompactInput,
  CompactOutput,
  IngestInput,
  IngestOutput,
  Mem8Config,
  MemoryRecord,
  OnSubagentEndedInput,
  OnSubagentEndedOutput,
  PrepareSubagentSpawnInput,
  PrepareSubagentSpawnOutput
} from './types';

type MemorySearchParams = {
  query: string;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  scope?: MemoryRecord['scope'];
  type?: MemoryRecord['type'];
  maxResults?: number;
  minScore?: number;
};

type MemorySearchResult = {
  id: string;
  path: string;
  scope: MemoryRecord['scope'];
  type: MemoryRecord['type'];
  snippet: string;
  summary?: string;
  score: number;
  updatedAt: number;
  startLine: number;
  endLine: number;
  citation: string;
};

type MemoryReadResult = {
  path: string;
  text: string;
  found: boolean;
  startLine: number;
  endLine: number;
  scope?: MemoryRecord['scope'];
  type?: MemoryRecord['type'];
  id?: string;
};

type MemoryStatus = {
  healthy: boolean;
  memoryCount: number;
  embeddedCount: number;
  pendingEmbeddingCount: number;
  scopeCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  provider: string;
  model?: string;
  embeddingAvailable: boolean;
  maxTokensPerAssemble?: number;
};

type MemoryIndexResult = {
  indexed: number;
  skipped: number;
  total: number;
  provider: string;
  model?: string;
  embeddingAvailable: boolean;
};

type MemoryRender = {
  path: string;
  text: string;
  contentStartLine: number;
  contentEndLine: number;
};

export class Mem8ContextEngine {
  private store: MemoryStore;
  private config: Mem8Config;
  private extractor: MemoryExtractor;
  private ranker: MemoryRanker;
  private compactor: MemoryCompactor;
  private hygiene: MemoryHygiene;
  private embeddingProvider?: EmbeddingProvider;

  constructor(config: Mem8Config) {
    this.config = config;
    this.store = new MemoryStore(config, config.debug);
    this.extractor = new MemoryExtractor();
    this.embeddingProvider = this.createEmbeddingProvider(config);
    this.ranker = new MemoryRanker(this.embeddingProvider);
    this.hygiene = new MemoryHygiene();
    this.compactor = new MemoryCompactor(this.ranker, this.hygiene);
    console.log('[mem8] ContextEngine initialized');
  }

  getStore(): MemoryStore {
    return this.store;
  }

  getEmbeddingProvider(): EmbeddingProvider | undefined {
    return this.embeddingProvider;
  }

  async bootstrap(input: BootstrapInput): Promise<BootstrapOutput> {
    try {
      console.log('[mem8] Bootstrap for session:', input.sessionId);

      const memories = [
        ...(await this.store.query({ scope: 'session', sessionId: input.sessionId, limit: 20 })),
        ...(await this.store.query({ scope: 'user', userId: input.config.userId, limit: 10 })),
        ...(await this.store.query({ scope: 'project', projectId: input.config.projectId, limit: 10 }))
      ];

      return { memories: await this.ranker.rankSemantic(memories), errors: [] };
    } catch (error) {
      console.error('[mem8] Bootstrap error:', error);
      return { memories: [], errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async assemble(input: AssembleInput): Promise<AssembleOutput> {
    try {
      const candidates = await this.ranker.rankSemantic(
        [
          ...(await this.store.query({ scope: 'session', sessionId: input.sessionId, limit: 30 })),
          ...(await this.store.query({ scope: 'user', userId: input.config.userId, limit: 20 })),
          ...(await this.store.query({ scope: 'project', projectId: input.config.projectId, limit: 20 }))
        ],
        input.currentText || ''
      );

      const estimateTokenCount = (text: string): number => Math.ceil(text.length / 4);
      const configuredBudget = this.config.maxTokensPerAssemble;
      const proportionalBudget = Math.max(0, Math.floor(input.availableTokens * 0.3));
      const tokenBudget =
        typeof configuredBudget === 'number'
          ? Math.max(0, Math.min(proportionalBudget, configuredBudget))
          : proportionalBudget;
      const selected: MemoryRecord[] = [];
      let totalTokens = 0;

      for (const memory of candidates) {
        const memoryTokens = estimateTokenCount(memory.content);
        if (totalTokens + memoryTokens <= tokenBudget) {
          selected.push(memory);
          totalTokens += memoryTokens;
        }
      }

      const topCandidate = candidates[0];
      if (selected.length === 0 && topCandidate) {
        selected.push(topCandidate);
        totalTokens = estimateTokenCount(topCandidate.content);
      }

      for (const memory of selected) {
        await this.store.update(memory.id, { lastAccessedAt: Date.now() });
      }

      console.log(`[mem8] Assemble: selected ${selected.length} memories (${totalTokens} tokens)`);
      return { memories: selected, tokenCount: totalTokens, errors: [] };
    } catch (error) {
      console.error('[mem8] Assemble error:', error);
      return { memories: [], tokenCount: 0, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async ingest(input: IngestInput): Promise<IngestOutput> {
    try {
      let memoriesAdded = 0;
      let memoriesUpdated = 0;
      const candidates = this.extractor.extract(input);

      for (const candidate of candidates) {
        if (this.embeddingProvider && (await this.embeddingProvider.isAvailable())) {
          candidate.embedding = await this.embeddingProvider.embed(candidate.content);
          candidate.embeddingModel = this.embeddingProvider.modelName();
        }

        const existingCandidates = await this.store.query({
          scope: candidate.scope,
          sessionId: candidate.sessionId,
          userId: candidate.userId,
          projectId: candidate.projectId,
          limit: 20
        });
        const existing = existingCandidates
          .map((memory) => ({ memory, similarity: this.calculateSimilarity(memory.content, candidate.content) }))
          .sort((a, b) => b.similarity - a.similarity)[0];

        if (existing && this.hygiene.shouldMerge(existing.memory, candidate, existing.similarity)) {
          await this.store.update(existing.memory.id, this.hygiene.mergePatch(existing.memory, candidate));
          memoriesUpdated += 1;
        } else {
          await this.store.add(candidate);
          memoriesAdded += 1;
        }
      }

      console.log(`[mem8] Ingest: ${memoriesAdded} added, ${memoriesUpdated} updated`);
      return { memoriesAdded, memoriesUpdated, errors: [] };
    } catch (error) {
      console.error('[mem8] Ingest error:', error);
      return { memoriesAdded: 0, memoriesUpdated: 0, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async compact(input: CompactInput): Promise<CompactOutput> {
    try {
      const result = this.compactor.compact(input.currentMemories, input.targetTokens);
      return { ...result, errors: [] };
    } catch (error) {
      console.error('[mem8] Compact error:', error);
      return {
        kept: input.currentMemories,
        evicted: [],
        tokenCount: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  async prepareSubagentSpawn(input: PrepareSubagentSpawnInput): Promise<PrepareSubagentSpawnOutput> {
    try {
      const relevant = (await this.ranker.rankSemantic(
        [
          ...(await this.store.query({ scope: 'session', sessionId: input.parentSessionId, limit: 20 })),
          ...(await this.store.query({ scope: 'project', projectId: input.config.projectId, limit: 10 }))
        ],
        input.task
      )).slice(0, 12);

      return {
        memories: relevant,
        instructions: `You are a subagent for session ${input.parentSessionId}. Use the supplied memories as high-priority context.`,
        errors: []
      };
    } catch (error) {
      console.error('[mem8] prepareSubagentSpawn error:', error);
      return { memories: [], instructions: '', errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async onSubagentEnded(input: OnSubagentEndedInput): Promise<OnSubagentEndedOutput> {
    try {
      const subagentMemories = await this.store.query({ scope: 'session', sessionId: input.subagentSessionId, limit: 20 });

      if (input.subagentResult && subagentMemories.length === 0) {
        for (const sentence of input.subagentResult.split(/[.!?]+/).filter((s) => s.trim().length > 30).slice(0, 3)) {
          const newMemory: Parameters<MemoryStore['add']>[0] = {
            scope: 'session',
            type: 'summary',
            sessionId: input.parentSessionId,
            projectId: input.config.projectId,
            userId: input.config.userId,
            content: sentence.trim(),
            importance: 0.7,
            confidence: 0.7,
            freshness: 0.7,
            source: 'subagent',
            metadata: { subagentId: input.subagentSessionId }
          };

          if (this.embeddingProvider && (await this.embeddingProvider.isAvailable())) {
            newMemory.embedding = await this.embeddingProvider.embed(newMemory.content);
            newMemory.embeddingModel = this.embeddingProvider.modelName();
          }

          await this.store.add(newMemory);
        }
      }

      return { memoriesFromSubagent: subagentMemories, errors: [] };
    } catch (error) {
      console.error('[mem8] onSubagentEnded error:', error);
      return { memoriesFromSubagent: [], errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; memoryCount: number; error?: string }> {
    try {
      return { healthy: true, memoryCount: await this.store.count() };
    } catch (error) {
      return { healthy: false, memoryCount: 0, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async searchMemories(params: MemorySearchParams): Promise<MemorySearchResult[]> {
    const limit = Math.max(params.maxResults ?? 8, 1);
    const pool = await this.store.query({
      scope: params.scope,
      type: params.type,
      sessionId: params.sessionId,
      userId: params.userId,
      projectId: params.projectId,
      limit: Math.max(limit * 5, 25)
    });
    const ranked = await this.ranker.rankSemantic(pool, params.query);
    const threshold = typeof params.minScore === 'number' ? params.minScore : 0;
    const results: MemorySearchResult[] = [];

    for (let index = 0; index < ranked.length && results.length < limit; index += 1) {
      const memory = ranked[index];
      const score = this.estimateSearchScore(memory, params.query, index, ranked.length);
      if (score < threshold) {
        continue;
      }
      const render = this.renderMemory(memory);
      const snippet = this.buildSnippet(memory, params.query);
      results.push({
        id: memory.id,
        path: render.path,
        scope: memory.scope,
        type: memory.type,
        snippet,
        summary: memory.summary,
        score,
        updatedAt: memory.updatedAt,
        startLine: render.contentStartLine,
        endLine: render.contentEndLine,
        citation: `${render.path}#L${render.contentStartLine}-L${render.contentEndLine}`
      });
    }

    return results;
  }

  async getMemoryById(id: string): Promise<MemoryRecord | null> {
    return await this.store.getById(id);
  }

  async getMemoryByPath(path: string, from?: number, lines?: number): Promise<MemoryReadResult> {
    const memory = await this.resolveMemoryFromPath(path);
    if (!memory) {
      return {
        path,
        text: '',
        found: false,
        startLine: from ?? 1,
        endLine: from ?? 1
      };
    }

    const render = this.renderMemory(memory);
    const allLines = render.text.split('\n');
    const startLine = Math.max(from ?? 1, 1);
    const requestedLineCount = Math.max(lines ?? allLines.length, 1);
    const endLine = Math.min(allLines.length, startLine + requestedLineCount - 1);
    const text = allLines.slice(startLine - 1, endLine).join('\n');

    return {
      path: render.path,
      text,
      found: true,
      startLine,
      endLine,
      scope: memory.scope,
      type: memory.type,
      id: memory.id
    };
  }

  async getStatus(): Promise<MemoryStatus> {
    const rows = await this.store.query({ limit: 100000 });
    const embeddingAvailable = this.embeddingProvider ? await this.embeddingProvider.isAvailable() : false;
    const scopeCounts = this.countBy(rows, (memory) => memory.scope);
    const typeCounts = this.countBy(rows, (memory) => memory.type);
    const embeddedCount = rows.filter((memory) => Array.isArray(memory.embedding) && memory.embedding.length > 0).length;

    return {
      healthy: true,
      memoryCount: rows.length,
      embeddedCount,
      pendingEmbeddingCount: rows.length - embeddedCount,
      scopeCounts,
      typeCounts,
      provider: this.config.embeddingProvider ?? 'none',
      model: this.embeddingProvider?.modelName(),
      embeddingAvailable,
      maxTokensPerAssemble: this.config.maxTokensPerAssemble
    };
  }

  async indexMemories(options: { force?: boolean } = {}): Promise<MemoryIndexResult> {
    const rows = await this.store.query({ limit: 100000 });
    const providerName = this.config.embeddingProvider ?? 'none';
    const model = this.embeddingProvider?.modelName();

    if (!this.embeddingProvider) {
      return {
        indexed: 0,
        skipped: rows.length,
        total: rows.length,
        provider: providerName,
        model,
        embeddingAvailable: false
      };
    }

    const embeddingAvailable = await this.embeddingProvider.isAvailable();
    if (!embeddingAvailable) {
      return {
        indexed: 0,
        skipped: rows.length,
        total: rows.length,
        provider: providerName,
        model,
        embeddingAvailable
      };
    }

    const pending = rows.filter((memory) => {
      if (options.force) {
        return true;
      }
      return !memory.embedding || memory.embedding.length === 0 || memory.embeddingModel !== model;
    });

    const batchSize = 8;
    let indexed = 0;
    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const batch = pending.slice(offset, offset + batchSize);
      const vectors = await this.embeddingProvider.embedBatch(batch.map((memory) => memory.content));
      for (let i = 0; i < batch.length; i += 1) {
        await this.store.update(batch[i].id, {
          embedding: vectors[i] || [],
          embeddingModel: model
        });
        indexed += 1;
      }
    }

    return {
      indexed,
      skipped: rows.length - pending.length,
      total: rows.length,
      provider: providerName,
      model,
      embeddingAvailable
    };
  }

  private createEmbeddingProvider(config: Mem8Config): EmbeddingProvider | undefined {
    if (config.embeddingProvider === 'ollama') {
      return new OllamaEmbeddingProvider({
        model: config.embeddingModel,
        baseUrl: config.embeddingBaseUrl
      });
    }
    return undefined;
  }

  private buildSnippet(memory: MemoryRecord, query: string): string {
    const source = memory.summary?.trim() || memory.content.trim();
    const normalized = source.replace(/\s+/g, ' ').trim();
    if (!query) {
      return normalized.slice(0, 280);
    }

    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const lower = normalized.toLowerCase();
    const hit = queryWords.find((token) => lower.includes(token));
    if (!hit) {
      return normalized.slice(0, 280);
    }

    const center = lower.indexOf(hit);
    const start = Math.max(0, center - 80);
    const end = Math.min(normalized.length, center + 180);
    const snippet = normalized.slice(start, end).trim();
    const prefix = start > 0 ? '...' : '';
    const suffix = end < normalized.length ? '...' : '';
    return `${prefix}${snippet}${suffix}`;
  }

  private estimateSearchScore(memory: MemoryRecord, query: string, index: number, total: number): number {
    const lexical = query ? this.calculateSimilarity(memory.content, query) : 0;
    const semanticHint = 1 - index / Math.max(total, 1);
    const raw = memory.importance * 0.45 + memory.confidence * 0.2 + lexical * 0.2 + semanticHint * 0.15;
    return Number(Math.max(0, Math.min(1, raw)).toFixed(4));
  }

  private async resolveMemoryFromPath(path: string): Promise<MemoryRecord | null> {
    const normalized = path.trim();
    if (!normalized) {
      return null;
    }

    const byId = await this.store.getById(normalized);
    if (byId) {
      return byId;
    }

    const matchedId = normalized.match(/\/([0-9a-fA-F-]{16,})\.md$/)?.[1];
    if (matchedId) {
      return await this.store.getById(matchedId);
    }

    const rows = await this.store.query({ limit: 100000 });
    return rows.find((memory) => this.renderMemory(memory).path === normalized) || null;
  }

  private renderMemory(memory: MemoryRecord): MemoryRender {
    const path = this.toVirtualPath(memory);
    const lines = [
      `# mem8 memory ${memory.id}`,
      '',
      `- scope: ${memory.scope}`,
      `- type: ${memory.type}`,
      `- source: ${memory.source}`,
      `- importance: ${memory.importance.toFixed(2)}`,
      `- confidence: ${memory.confidence.toFixed(2)}`,
      memory.sessionId ? `- sessionId: ${memory.sessionId}` : '- sessionId:',
      memory.userId ? `- userId: ${memory.userId}` : '- userId:',
      memory.projectId ? `- projectId: ${memory.projectId}` : '- projectId:',
      `- updatedAt: ${new Date(memory.updatedAt).toISOString()}`,
      ''
    ];

    if (memory.summary) {
      lines.push('## Summary', '', memory.summary, '');
    }

    const contentLines = memory.content.split('\n');
    const contentStartLine = lines.length + 3;
    lines.push('## Content', '', memory.content);
    const contentEndLine = contentStartLine + contentLines.length - 1;

    return {
      path,
      text: lines.join('\n'),
      contentStartLine,
      contentEndLine
    };
  }

  private toVirtualPath(memory: MemoryRecord): string {
    const owner = this.sanitizePathSegment(this.memoryOwner(memory));
    return `memory/${memory.scope}/${owner}/${memory.id}.md`;
  }

  private memoryOwner(memory: MemoryRecord): string {
    if (memory.scope === 'session') {
      return memory.sessionId || 'unknown-session';
    }
    if (memory.scope === 'user') {
      return memory.userId || 'unknown-user';
    }
    return memory.projectId || 'unknown-project';
  }

  private sanitizePathSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private countBy(rows: MemoryRecord[], pick: (memory: MemoryRecord) => string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const row of rows) {
      const key = pick(row);
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }

  private calculateSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...aWords].filter((word) => bWords.has(word)).length;
    const union = new Set([...aWords, ...bWords]).size;
    return union > 0 ? intersection / union : 0;
  }
}
