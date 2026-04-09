export type MemoryScope = 'session' | 'user' | 'project';
export type MemoryType = 'fact' | 'preference' | 'decision' | 'task' | 'summary';
export type MemorySource = 'conversation' | 'subagent' | 'system';

export interface Mem8Config {
  apiUrl?: string;
  apiKey?: string;
  dbPath?: string;
  debug?: boolean;
  userId?: string;
  projectId?: string;
  embeddingProvider?: 'none' | 'ollama';
  embeddingModel?: string;
  embeddingBaseUrl?: string;
  maxTokensPerAssemble?: number;
}

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  content: string;
  summary?: string;
  importance: number;
  freshness: number;
  confidence: number;
  source: MemorySource;
  sourceTurn?: number;
  embedding?: number[];
  embeddingModel?: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryRecordInput {
  scope: MemoryScope;
  type: MemoryType;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  content: string;
  summary?: string;
  importance: number;
  freshness?: number;
  confidence: number;
  source: MemorySource;
  sourceTurn?: number;
  embedding?: number[];
  embeddingModel?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryQuery {
  id?: string;
  scope?: MemoryScope;
  type?: MemoryType;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  limit?: number;
  since?: number;
  until?: number;
  search?: string;
}

export interface BootstrapInput {
  sessionId: string;
  config: Mem8Config;
}

export interface BootstrapOutput {
  memories: MemoryRecord[];
  errors: string[];
}

export interface AssembleInput {
  sessionId: string;
  turnNumber: number;
  config: Mem8Config;
  availableTokens: number;
  currentText?: string;
}

export interface AssembleOutput {
  memories: MemoryRecord[];
  tokenCount: number;
  errors: string[];
}

export interface IngestInput {
  sessionId: string;
  turnNumber: number;
  config: Mem8Config;
  recentMessages: Array<{
    role: string;
    content: string;
  }>;
  summary?: string;
}

export interface IngestOutput {
  memoriesAdded: number;
  memoriesUpdated: number;
  errors: string[];
}

export interface CompactInput {
  sessionId: string;
  config: Mem8Config;
  currentMemories: MemoryRecord[];
  availableTokens: number;
  targetTokens: number;
}

export interface CompactOutput {
  kept: MemoryRecord[];
  evicted: MemoryRecord[];
  tokenCount: number;
  errors: string[];
}

export interface PrepareSubagentSpawnInput {
  parentSessionId: string;
  subagentSessionId: string;
  config: Mem8Config;
  task: string;
}

export interface PrepareSubagentSpawnOutput {
  memories: MemoryRecord[];
  instructions: string;
  errors: string[];
}

export interface OnSubagentEndedInput {
  parentSessionId: string;
  subagentSessionId: string;
  config: Mem8Config;
  subagentResult?: string;
}

export interface OnSubagentEndedOutput {
  memoriesFromSubagent: MemoryRecord[];
  errors: string[];
}
