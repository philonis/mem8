import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { MemoryRepository } from './memory-repository';
import { Mem8Config, MemoryQuery, MemoryRecord, MemoryRecordInput } from './types';

interface MemoryDatabase {
  version: number;
  memories: MemoryRecord[];
}

interface LegacyMemoryRecord {
  id: string;
  sessionId: string;
  content: string;
  embedding?: number[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export class JsonMemoryRepository implements MemoryRepository {
  private dbPath: string;
  private debug: boolean;
  private db: MemoryDatabase;

  constructor(config?: Mem8Config, debug = false) {
    this.dbPath = config?.dbPath || path.join(process.env.HOME || '/tmp', '.mem8', 'memories.json');
    this.debug = debug;

    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = this.load();
    this.log('JsonMemoryRepository initialized at:', this.dbPath);
  }

  getPath(): string {
    return this.dbPath;
  }

  exportAll(): MemoryRecord[] {
    return [...this.db.memories];
  }

  private load(): MemoryDatabase {
    try {
      if (!fs.existsSync(this.dbPath)) {
        return { version: 2, memories: [] };
      }

      const raw = fs.readFileSync(this.dbPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<MemoryDatabase>;

      if (parsed.version === 2 && Array.isArray(parsed.memories)) {
        return { version: 2, memories: parsed.memories };
      }

      return this.migrateLegacy(parsed.memories as LegacyMemoryRecord[] | undefined);
    } catch (error) {
      console.error('[mem8] Failed to load JSON database:', error);
      return { version: 2, memories: [] };
    }
  }

  private migrateLegacy(memories: LegacyMemoryRecord[] | undefined): MemoryDatabase {
    const migrated = (memories || []).map((memory) => this.fromLegacy(memory));
    const db = { version: 2, memories: migrated };
    this.db = db;
    this.save();
    this.log(`Migrated ${migrated.length} legacy memories to v2 schema`);
    return db;
  }

  private fromLegacy(memory: LegacyMemoryRecord): MemoryRecord {
    const metadata = memory.metadata || {};
    return {
      id: memory.id,
      scope: 'session',
      type: 'fact',
      sessionId: memory.sessionId,
      content: memory.content,
      importance: 0.5,
      freshness: 0.5,
      confidence: 0.6,
      source: 'conversation',
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      metadata: {
        ...metadata,
        legacyEmbedding: memory.embedding
      }
    };
  }

  private save(): void {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2), 'utf-8');
    } catch (error) {
      console.error('[mem8] Failed to save JSON database:', error);
    }
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[mem8 JsonMemoryRepository]', ...args);
    }
  }

  add(input: MemoryRecordInput): MemoryRecord {
    const now = Date.now();
    const memory: MemoryRecord = {
      id: uuidv4(),
      freshness: input.freshness ?? input.importance,
      createdAt: now,
      updatedAt: now,
      ...input
    };

    this.db.memories.push(memory);
    this.save();
    return memory;
  }

  update(id: string, patch: Partial<Omit<MemoryRecord, 'id' | 'createdAt'>>): MemoryRecord | null {
    const index = this.db.memories.findIndex((memory) => memory.id === id);
    if (index === -1) {
      return null;
    }

    const current = this.db.memories[index];
    const updated: MemoryRecord = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: Date.now()
    };

    this.db.memories[index] = updated;
    this.save();
    return updated;
  }

  getById(id: string): MemoryRecord | null {
    return this.db.memories.find((memory) => memory.id === id) || null;
  }

  query(query: MemoryQuery): MemoryRecord[] {
    let results = [...this.db.memories];

    if (query.id) results = results.filter((memory) => memory.id === query.id);
    if (query.scope) results = results.filter((memory) => memory.scope === query.scope);
    if (query.type) results = results.filter((memory) => memory.type === query.type);
    if (query.sessionId) results = results.filter((memory) => memory.sessionId === query.sessionId);
    if (query.userId) results = results.filter((memory) => memory.userId === query.userId);
    if (query.projectId) results = results.filter((memory) => memory.projectId === query.projectId);
    if (query.since) results = results.filter((memory) => memory.createdAt >= query.since!);
    if (query.until) results = results.filter((memory) => memory.createdAt <= query.until!);
    if (query.search) {
      const search = query.search.toLowerCase();
      results = results.filter((memory) => [memory.content, memory.summary || ''].some((field) => field.toLowerCase().includes(search)));
    }

    results.sort((a, b) => b.updatedAt - a.updatedAt);
    if (query.limit) results = results.slice(0, query.limit);
    return results;
  }

  getAllForSession(sessionId: string): MemoryRecord[] {
    return this.query({ scope: 'session', sessionId, limit: 1000 });
  }

  delete(id: string): boolean {
    const index = this.db.memories.findIndex((memory) => memory.id === id);
    if (index === -1) return false;
    this.db.memories.splice(index, 1);
    this.save();
    return true;
  }

  count(): number {
    return this.db.memories.length;
  }

  close(): void {
    this.save();
  }
}
