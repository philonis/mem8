import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { MemoryRepository } from './memory-repository';
import { Mem8Config, MemoryQuery, MemoryRecord, MemoryRecordInput } from './types';

export class SqliteMemoryRepository implements MemoryRepository {
  private dbPath: string;
  private debug: boolean;
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;

  constructor(config?: Mem8Config, debug = false) {
    this.dbPath = config?.dbPath || path.join(process.env.HOME || '/tmp', '.mem8', 'memories.sqlite');
    this.debug = debug;
  }

  async initialize(seed: MemoryRecord[] = []): Promise<void> {
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
      this.createSchema();
      for (const memory of seed) {
        this.insertMemory(memory);
      }
      this.persist();
    }

    this.createSchema();
    this.log('SqliteMemoryRepository initialized at:', this.dbPath);
  }

  private createSchema(): void {
    this.ensureDb().run(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        type TEXT NOT NULL,
        session_id TEXT,
        user_id TEXT,
        project_id TEXT,
        content TEXT NOT NULL,
        summary TEXT,
        importance REAL NOT NULL,
        freshness REAL NOT NULL,
        confidence REAL NOT NULL,
        source TEXT NOT NULL,
        source_turn INTEGER,
        embedding_json TEXT,
        embedding_model TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER,
        metadata_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
      CREATE INDEX IF NOT EXISTS idx_memories_session_id ON memories(session_id);
      CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
      CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at);
    `);
  }

  add(input: MemoryRecordInput): MemoryRecord {
    const now = Date.now();
    const memory: MemoryRecord = {
      id: crypto.randomUUID(),
      freshness: input.freshness ?? input.importance,
      createdAt: now,
      updatedAt: now,
      ...input
    };
    this.insertMemory(memory);
    this.persist();
    return memory;
  }

  update(id: string, patch: Partial<Omit<MemoryRecord, 'id' | 'createdAt'>>): MemoryRecord | null {
    const current = this.getById(id);
    if (!current) return null;
    const updated: MemoryRecord = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: Date.now()
    };
    this.ensureDb().run('DELETE FROM memories WHERE id = ?', [id]);
    this.insertMemory(updated);
    this.persist();
    return updated;
  }

  getById(id: string): MemoryRecord | null {
    const rows = this.queryRows('SELECT * FROM memories WHERE id = ?', [id]);
    return rows[0] || null;
  }

  query(query: MemoryQuery): MemoryRecord[] {
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params = [];
    if (query.scope) {
      sql += ' AND scope = ?';
      params.push(query.scope);
    }
    if (query.type) {
      sql += ' AND type = ?';
      params.push(query.type);
    }
    if (query.sessionId) {
      sql += ' AND session_id = ?';
      params.push(query.sessionId);
    }
    if (query.userId) {
      sql += ' AND user_id = ?';
      params.push(query.userId);
    }
    if (query.projectId) {
      sql += ' AND project_id = ?';
      params.push(query.projectId);
    }
    if (query.since) {
      sql += ' AND created_at >= ?';
      params.push(query.since);
    }
    if (query.until) {
      sql += ' AND created_at <= ?';
      params.push(query.until);
    }
    sql += ' ORDER BY updated_at DESC';
    const rows = this.queryRows(sql, params);
    let results = rows;
    if (query.search) {
      const search = query.search.toLowerCase();
      results = results.filter((memory) => [memory.content, memory.summary || ''].some((field) => field.toLowerCase().includes(search)));
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    return results;
  }

  getAllForSession(sessionId: string): MemoryRecord[] {
    return this.query({ scope: 'session', sessionId, limit: 1000 });
  }

  delete(id: string): boolean {
    this.ensureDb().run('DELETE FROM memories WHERE id = ?', [id]);
    this.persist();
    return true;
  }

  count(): number {
    const stmt = this.ensureDb().prepare('SELECT COUNT(*) as count FROM memories');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return Number(row.count || 0);
  }

  close(): void {
    this.persist();
    this.db?.close();
    this.db = null;
  }

  private insertMemory(memory: MemoryRecord): void {
    this.ensureDb().run(
      `INSERT INTO memories (
        id, scope, type, session_id, user_id, project_id, content, summary,
        importance, freshness, confidence, source, source_turn,
        embedding_json, embedding_model, created_at, updated_at, last_accessed_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memory.id,
        memory.scope,
        memory.type,
        memory.sessionId || null,
        memory.userId || null,
        memory.projectId || null,
        memory.content,
        memory.summary || null,
        memory.importance,
        memory.freshness,
        memory.confidence,
        memory.source,
        memory.sourceTurn || null,
        memory.embedding ? JSON.stringify(memory.embedding) : null,
        memory.embeddingModel || null,
        memory.createdAt,
        memory.updatedAt,
        memory.lastAccessedAt || null,
        memory.metadata ? JSON.stringify(memory.metadata) : null
      ]
    );
  }

  private queryRows(sql: string, params: SqlValue[] = []): MemoryRecord[] {
    const stmt = this.ensureDb().prepare(sql, params);
    const rows: MemoryRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: String(row.id),
        scope: row.scope as MemoryRecord['scope'],
        type: row.type as MemoryRecord['type'],
        sessionId: row.session_id ? String(row.session_id) : undefined,
        userId: row.user_id ? String(row.user_id) : undefined,
        projectId: row.project_id ? String(row.project_id) : undefined,
        content: String(row.content),
        summary: row.summary ? String(row.summary) : undefined,
        importance: Number(row.importance),
        freshness: Number(row.freshness),
        confidence: Number(row.confidence),
        source: row.source as MemoryRecord['source'],
        sourceTurn: row.source_turn ? Number(row.source_turn) : undefined,
        embedding: row.embedding_json ? JSON.parse(String(row.embedding_json)) : undefined,
        embeddingModel: row.embedding_model ? String(row.embedding_model) : undefined,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        lastAccessedAt: row.last_accessed_at ? Number(row.last_accessed_at) : undefined,
        metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : undefined
      });
    }
    stmt.free();
    return rows;
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error('SqliteMemoryRepository is not initialized');
    }
    return this.db;
  }

  private persist(): void {
    if (!this.db) return;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[mem8 SqliteMemoryRepository]', ...args);
    }
  }
}
