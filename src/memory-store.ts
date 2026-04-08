import fs from 'fs';
import { JsonMemoryRepository } from './json-memory-repository';
import { MemoryRepository } from './memory-repository';
import { SqliteMemoryRepository } from './sqlite-memory-repository';
import { Mem8Config, MemoryQuery, MemoryRecord, MemoryRecordInput } from './types';

export class MemoryStore {
  private repository: MemoryRepository;
  private ready: Promise<void>;

  constructor(config?: Mem8Config, debug = false) {
    const dbPath = config?.dbPath || '';
    const wantsSqlite = dbPath.endsWith('.sqlite') || dbPath.endsWith('.db');

    if (wantsSqlite) {
      const sqliteRepo = new SqliteMemoryRepository(config, debug);
      this.repository = sqliteRepo;
      this.ready = this.initializeSqlite(sqliteRepo, config, debug);
    } else {
      this.repository = new JsonMemoryRepository(config, debug);
      this.ready = Promise.resolve();
    }
  }

  private async initializeSqlite(sqliteRepo: SqliteMemoryRepository, config?: Mem8Config, debug = false): Promise<void> {
    const legacyJsonPath = config?.dbPath?.replace(/\.(sqlite|db)$/i, '.json');
    let seed: MemoryRecord[] = [];

    if (legacyJsonPath && fs.existsSync(legacyJsonPath)) {
      const legacyRepo = new JsonMemoryRepository({ ...config, dbPath: legacyJsonPath }, debug);
      seed = legacyRepo.exportAll();
      legacyRepo.close();
    }

    await sqliteRepo.initialize(seed);
  }

  async add(input: MemoryRecordInput): Promise<MemoryRecord> {
    await this.ready;
    return await this.repository.add(input);
  }

  async update(id: string, patch: Partial<Omit<MemoryRecord, 'id' | 'createdAt'>>): Promise<MemoryRecord | null> {
    await this.ready;
    return await this.repository.update(id, patch);
  }

  async getById(id: string): Promise<MemoryRecord | null> {
    await this.ready;
    return await this.repository.getById(id);
  }

  async query(query: MemoryQuery): Promise<MemoryRecord[]> {
    await this.ready;
    return await this.repository.query(query);
  }

  async getAllForSession(sessionId: string): Promise<MemoryRecord[]> {
    await this.ready;
    return await this.repository.getAllForSession(sessionId);
  }

  async delete(id: string): Promise<boolean> {
    await this.ready;
    return await this.repository.delete(id);
  }

  async count(): Promise<number> {
    await this.ready;
    return await this.repository.count();
  }

  async close(): Promise<void> {
    await this.ready;
    await this.repository.close();
  }
}
