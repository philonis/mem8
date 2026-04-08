import { MemoryRecord, MemoryRecordInput } from './types';

export class MemoryHygiene {
  mergePatch(existing: MemoryRecord, incoming: MemoryRecordInput): Partial<Omit<MemoryRecord, 'id' | 'createdAt'>> {
    return {
      content: this.mergeContent(existing.content, incoming.content),
      summary: this.pickSummary(existing.summary, incoming.summary, existing.content, incoming.content),
      importance: Math.max(existing.importance, incoming.importance),
      confidence: Math.max(existing.confidence, incoming.confidence),
      freshness: Math.max(existing.freshness, incoming.freshness ?? incoming.importance),
      metadata: { ...existing.metadata, ...incoming.metadata },
      embedding: incoming.embedding || existing.embedding,
      embeddingModel: incoming.embeddingModel || existing.embeddingModel
    };
  }

  shouldPrune(memory: MemoryRecord, now = Date.now()): boolean {
    const ageDays = (now - memory.updatedAt) / (1000 * 60 * 60 * 24);

    if (memory.scope === 'user' || memory.scope === 'project') {
      return false;
    }

    if (memory.type === 'task') {
      return ageDays > 14 && memory.importance < 0.8;
    }

    return ageDays > 7 && memory.importance < 0.45;
  }

  shouldMerge(existing: MemoryRecord, incoming: MemoryRecordInput, similarity: number): boolean {
    if (existing.scope !== incoming.scope || existing.type !== incoming.type) {
      return false;
    }

    const existingText = existing.content.toLowerCase();
    const incomingText = incoming.content.toLowerCase();
    if (existingText.includes(incomingText) || incomingText.includes(existingText)) {
      return true;
    }

    if (similarity >= 0.9) {
      return true;
    }

    if (existing.type === 'preference' || existing.type === 'decision') {
      return similarity >= 0.6;
    }

    return similarity >= 0.85;
  }

  scoreForCompaction(memory: MemoryRecord, now = Date.now()): number {
    const recency = Math.max(0, 1 - (now - memory.updatedAt) / (1000 * 60 * 60 * 24 * 30));
    const scopeWeight = memory.scope === 'user' ? 0.25 : memory.scope === 'project' ? 0.2 : 0.05;
    const typeWeight = memory.type === 'preference' || memory.type === 'decision' ? 0.2 : memory.type === 'task' ? 0.08 : 0.04;
    return memory.importance * 0.4 + memory.freshness * 0.2 + recency * 0.15 + scopeWeight + typeWeight;
  }

  private mergeContent(existing: string, incoming: string): string {
    if (existing.includes(incoming)) {
      return existing;
    }
    if (incoming.includes(existing)) {
      return incoming;
    }
    return `${existing}\n${incoming}`;
  }

  private pickSummary(
    existingSummary: string | undefined,
    incomingSummary: string | undefined,
    existingContent: string,
    incomingContent: string
  ): string | undefined {
    if (incomingSummary && incomingSummary.length >= (existingSummary || '').length) {
      return incomingSummary;
    }
    if (existingSummary) {
      return existingSummary;
    }
    const preferred = incomingContent.length >= existingContent.length ? incomingContent : existingContent;
    return preferred.length > 72 ? `${preferred.slice(0, 69)}...` : preferred;
  }
}
