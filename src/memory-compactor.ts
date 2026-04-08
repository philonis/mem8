import { MemoryHygiene } from './memory-hygiene';
import { MemoryRecord } from './types';
import { MemoryRanker } from './memory-ranker';

export class MemoryCompactor {
  private ranker: MemoryRanker;
  private hygiene: MemoryHygiene;

  constructor(ranker = new MemoryRanker(), hygiene = new MemoryHygiene()) {
    this.ranker = ranker;
    this.hygiene = hygiene;
  }

  compact(memories: MemoryRecord[], targetTokens: number): {
    kept: MemoryRecord[];
    evicted: MemoryRecord[];
    tokenCount: number;
  } {
    const estimateTokenCount = (text: string): number => Math.ceil(text.length / 4);
    const now = Date.now();
    const candidates = memories.filter((memory) => !this.hygiene.shouldPrune(memory, now));
    const ranked = this.ranker.rank(candidates).sort((a, b) => this.hygiene.scoreForCompaction(b, now) - this.hygiene.scoreForCompaction(a, now));

    const kept: MemoryRecord[] = [];
    let tokenCount = 0;

    for (const memory of ranked) {
      const memoryTokens = estimateTokenCount(memory.content);
      if (tokenCount + memoryTokens <= targetTokens) {
        kept.push(memory);
        tokenCount += memoryTokens;
      }
    }

    if (kept.length === 0 && ranked.length > 0) {
      kept.push(ranked[0]);
      tokenCount = estimateTokenCount(ranked[0].content);
    }

    const keptIds = new Set(kept.map((memory) => memory.id));
    const evicted = memories.filter((memory) => !keptIds.has(memory.id));
    return { kept, evicted, tokenCount };
  }
}
