import { cosineSimilarity, EmbeddingProvider } from './embedding-provider';
import { MemoryRecord } from './types';

export class MemoryRanker {
  constructor(private embeddingProvider?: EmbeddingProvider) {}

  rank(memories: MemoryRecord[], currentText = ''): MemoryRecord[] {
    const unique = this.dedupeById(memories);
    const now = Date.now();
    return unique.sort((a, b) => this.scoreMemorySync(b, currentText, now) - this.scoreMemorySync(a, currentText, now));
  }

  async rankSemantic(memories: MemoryRecord[], currentText = ''): Promise<MemoryRecord[]> {
    const unique = this.dedupeById(memories);
    if (!currentText || !this.embeddingProvider || !(await this.embeddingProvider.isAvailable())) {
      return this.rank(unique, currentText);
    }

    const queryEmbedding = await this.embeddingProvider.embed(currentText);
    const now = Date.now();

    return unique.sort((a, b) => {
      const aScore = this.scoreMemorySemantic(a, currentText, queryEmbedding, now);
      const bScore = this.scoreMemorySemantic(b, currentText, queryEmbedding, now);
      return bScore - aScore;
    });
  }

  scoreMemorySync(memory: MemoryRecord, currentText: string, now: number): number {
    const recency = Math.max(0, 1 - (now - memory.updatedAt) / (1000 * 60 * 60 * 24 * 30));
    const lexical = currentText ? this.calculateSimilarity(memory.content, currentText) : 0;
    const scopeBonus = memory.scope === 'user' ? 0.2 : memory.scope === 'project' ? 0.18 : 0.05;
    const typeBonus = memory.type === 'preference' || memory.type === 'decision' ? 0.18 : 0.04;
    return memory.importance * 0.45 + memory.freshness * 0.15 + recency * 0.1 + lexical * 0.12 + scopeBonus + typeBonus;
  }

  private scoreMemorySemantic(memory: MemoryRecord, currentText: string, queryEmbedding: number[], now: number): number {
    const baseScore = this.scoreMemorySync(memory, currentText, now);
    const semantic = memory.embedding ? cosineSimilarity(memory.embedding, queryEmbedding) : 0;
    return baseScore * 0.8 + semantic * 0.2;
  }

  private dedupeById(memories: MemoryRecord[]): MemoryRecord[] {
    const seen = new Set<string>();
    const results: MemoryRecord[] = [];
    for (const memory of memories) {
      if (!seen.has(memory.id)) {
        seen.add(memory.id);
        results.push(memory);
      }
    }
    return results;
  }

  private calculateSimilarity(a: string, b: string): number {
    const aWords = new Set(tokenizeForSimilarity(a));
    const bWords = new Set(tokenizeForSimilarity(b));
    const intersection = [...aWords].filter((word) => bWords.has(word)).length;
    const union = new Set([...aWords, ...bWords]).size;
    return union > 0 ? intersection / union : 0;
  }
}

function tokenizeForSimilarity(text: string): string[] {
  const normalized = text.toLowerCase().trim();
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const compact = normalized.replace(/\s+/g, '');

  for (let index = 0; index < compact.length; index += 1) {
    tokens.push(compact[index]);
    if (index < compact.length - 1) {
      tokens.push(compact.slice(index, index + 2));
    }
  }

  return tokens;
}
