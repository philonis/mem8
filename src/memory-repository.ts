import { MemoryQuery, MemoryRecord, MemoryRecordInput } from './types';

export interface MemoryRepository {
  add(input: MemoryRecordInput): Promise<MemoryRecord> | MemoryRecord;
  update(id: string, patch: Partial<Omit<MemoryRecord, 'id' | 'createdAt'>>): Promise<MemoryRecord | null> | MemoryRecord | null;
  getById(id: string): Promise<MemoryRecord | null> | MemoryRecord | null;
  query(query: MemoryQuery): Promise<MemoryRecord[]> | MemoryRecord[];
  getAllForSession(sessionId: string): Promise<MemoryRecord[]> | MemoryRecord[];
  delete(id: string): Promise<boolean> | boolean;
  count(): Promise<number> | number;
  close(): Promise<void> | void;
}
