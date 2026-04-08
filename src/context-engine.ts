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
      const tokenBudget = Math.max(0, Math.floor(input.availableTokens * 0.3));
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
      } else if (selected.length > 0 && topCandidate && selected[0].id !== topCandidate.id) {
        selected.splice(0, selected.length, topCandidate);
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
          memoriesUpdated++;
        } else {
          await this.store.add(candidate);
          memoriesAdded++;
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

  private createEmbeddingProvider(config: Mem8Config): EmbeddingProvider | undefined {
    if (config.embeddingProvider === 'ollama') {
      return new OllamaEmbeddingProvider({
        model: config.embeddingModel,
        baseUrl: config.embeddingBaseUrl
      });
    }
    return undefined;
  }

  private calculateSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...aWords].filter((word) => bWords.has(word)).length;
    const union = new Set([...aWords, ...bWords]).size;
    return union > 0 ? intersection / union : 0;
  }
}
