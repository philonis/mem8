# mem8 Technical Design

## Goal

mem8 is a pure local-first memory engine for OpenClaw.

The short-term goal is not to clone the entire mem9 product surface. The goal is to reproduce the core memory behavior locally:

- persist important information across turns and sessions
- recall relevant memory into prompt assembly
- support memory lifecycle hooks through OpenClaw ContextEngine
- remain fully local, inspectable, and debuggable

## Non-Goals

These are explicitly out of scope for the first local MVP:

- cloud sync
- multi-device sync
- mem9 API compatibility
- multi-tenant SaaS architecture
- remote dashboard
- distributed vector infrastructure

## Product Requirements

### Required

- local persistence
- session bootstrap memory restore
- turn-by-turn memory ingest
- prompt-time memory assembly
- compact/merge strategy for memory growth
- subagent memory handoff hooks
- stable data model that can evolve without rewrite

### Nice to Have

- semantic search
- memory importance scoring
- preference/fact/decision extraction
- project-scoped memories
- memory inspection CLI

## Design Principles

- local first
- simple storage, richer retrieval later
- structured memory beats raw transcript dumping
- memory must be inspectable by humans
- every memory should have scope, type, and provenance
- retrieval quality matters more than raw volume
- ingest and assemble are separate concerns

## Architecture

```text
OpenClaw ContextEngine Hooks
        |
        v
+-----------------------+
| mem8 Context Engine   |
| - bootstrap           |
| - ingest              |
| - assemble            |
| - compact             |
| - subagent hooks      |
+-----------------------+
        |
        +-----------------------------+
        |                             |
        v                             v
+-------------------+       +----------------------+
| Memory Pipeline   |       | Retrieval Pipeline   |
| - extraction      |       | - candidate fetch    |
| - classification  |       | - ranking            |
| - scoring         |       | - budget fit         |
| - dedupe/merge    |       | - prompt render      |
+-------------------+       +----------------------+
        |
        v
+-----------------------+
| Local Storage Layer   |
| - SQLite              |
| - optional embeddings |
| - metadata indexes    |
+-----------------------+
```

## Core Concepts

### 1. Transcript vs Memory

Transcript is raw conversation history.
Memory is distilled information worth reusing later.

mem8 should never treat the full transcript as the memory system.
Instead, mem8 extracts durable pieces from transcript and stores them as separate records.

### 2. Memory Scope

Each memory belongs to a scope.

- `session`: relevant only to one conversation/session
- `user`: stable user preferences or long-term facts
- `project`: facts/decisions tied to one project

This is important because retrieval strategy changes by scope.
A user preference should survive across sessions.
A session-specific detail should not pollute all future prompts.

### 3. Memory Type

Each memory should be typed.

- `fact`
- `preference`
- `decision`
- `task`
- `summary`

This makes future ranking, compaction, and UI inspection much easier.

## Data Model

## MemoryRecord

```ts
export type MemoryScope = 'session' | 'user' | 'project';
export type MemoryType = 'fact' | 'preference' | 'decision' | 'task' | 'summary';

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  type: MemoryType;

  sessionId?: string;
  userId?: string;
  projectId?: string;

  content: string;
  summary?: string;

  importance: number;     // 0-1
  freshness: number;      // derived or cached score
  confidence: number;     // extraction confidence, 0-1

  source: 'conversation' | 'subagent' | 'system';
  sourceTurn?: number;

  embedding?: number[];
  embeddingModel?: string;

  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;

  metadata?: Record<string, unknown>;
}
```

## Why This Schema

This schema keeps the MVP extensible.

- `scope` enables local long-term memory strategy
- `type` enables better extraction and ranking
- `importance` prevents flat memory piles
- `confidence` helps control noisy ingest
- `embedding` is optional so we can ship before semantic retrieval is finished
- `metadata` keeps experimentation flexible

## Storage Design

## Phase 1

Use SQLite as the primary store.

Reason:

- better than JSON for filtering and migration
- simple local deployment
- easy debugging with standard tools
- enough for MVP scale

### Tables

#### `memories`

```sql
CREATE TABLE memories (
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
```

#### Indexes

```sql
CREATE INDEX idx_memories_scope ON memories(scope);
CREATE INDEX idx_memories_session_id ON memories(session_id);
CREATE INDEX idx_memories_user_id ON memories(user_id);
CREATE INDEX idx_memories_project_id ON memories(project_id);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_updated_at ON memories(updated_at);
```

## Embedding Storage

For MVP, embeddings can be stored as JSON arrays in SQLite.
This is not ideal for large scale, but it keeps the local architecture simple.

Later options:

- sqlite-vec / sqlite-vss
- LanceDB local
- sidecar vector index

## Memory Lifecycle

## 1. Ingest

Input: recent messages after a turn.

Steps:

1. normalize raw text
2. split candidate statements
3. classify candidate type
4. estimate importance/confidence
5. dedupe against recent memories
6. upsert to store

### MVP Ingest Strategy

Start heuristic-first, then improve.

Heuristics:

- ignore very short sentences
- prefer declarative statements
- detect preference phrases like "prefer", "always", "usually", "不要", "喜欢", "默认"
- detect decisions like "决定", "用这个", "我们改成"
- detect tasks like "记得", "待会", "下次", "todo"

### Future Ingest Strategy

Replace heuristic extraction with local LLM-assisted extraction.

Output example:

```json
{
  "type": "preference",
  "scope": "user",
  "content": "高老师 prefers concise answers with minimal filler.",
  "importance": 0.88,
  "confidence": 0.91
}
```

## 2. Bootstrap

Input: session start.

Goal:

- restore session-scoped memories
- restore high-value user/project memories relevant to this context

MVP behavior:

- load recent session memories
- load top user-level preferences if available
- no semantic search required for first cut

## 3. Assemble

Input: current turn + token budget.

Goal:

Select the smallest set of memories that gives the model the most useful context.

### Candidate Sources

- current session memories
- user-scoped memories
- project-scoped memories

### Ranking Inputs

- scope priority
- type priority
- importance
- freshness
- lexical/semantic relevance to current turn
- whether recently used already

### Output

A ranked set of memories rendered into prompt context.

Example rendering:

```text
Relevant memory:
- User preference: prefers concise answers.
- Project decision: mem8 should be local-first and not depend on cloud sync.
- Session context: current goal is a technical design to avoid losing implementation direction.
```

## 4. Compact

Compaction is not deletion only.
It is memory governance.

Possible actions:

- drop low-value session noise
- merge similar memories
- rewrite multiple records into one summary memory
- reduce repeated task-like records

MVP behavior:

- remove stale low-importance session memories
- merge exact or near-exact duplicates
- keep user preferences and project decisions longer

## 5. Subagent Hooks

### prepareSubagentSpawn

Purpose:

- pass only relevant memory to child agents
- avoid flooding child context with full history

MVP:

- pass current session summary
- pass high-importance project decisions
- pass current task-related memories

### onSubagentEnded

Purpose:

- ingest useful findings from child agents back into parent context

MVP:

- extract key decisions / findings from subagent result
- store them as `decision` or `summary` memories

## Retrieval Strategy

## MVP Retrieval

Before embeddings:

- fetch by scope
- rank by importance + recency + lexical overlap
- fit within token budget

This gets the architecture working before semantic search is introduced.

## Phase 2 Retrieval

After embeddings:

- embed the current user turn
- search nearest memories locally
- blend semantic score with rule-based score

Suggested ranking formula:

```text
final_score =
  0.35 * semantic_similarity +
  0.25 * importance +
  0.20 * freshness +
  0.10 * scope_priority +
  0.10 * type_priority
```

## Components To Build

## 1. `MemoryRepository`

Responsibilities:

- CRUD for memory records
- query by scope/type/session
- migrations
- serialization/deserialization

## 2. `MemoryExtractor`

Responsibilities:

- convert recent conversation into candidate memory records
- classify type/scope
- estimate importance/confidence

## 3. `MemoryRanker`

Responsibilities:

- score candidate memories for retrieval
- budget-fit top memories
- later combine semantic + heuristic signals

## 4. `MemoryCompactor`

Responsibilities:

- dedupe
- merge
- prune stale noise
- emit summary memory when needed

## 5. `EmbeddingProvider`

Responsibilities:

- optional local embeddings
- abstract provider so implementation can be swapped later

Suggested interface:

```ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  modelName(): string;
}
```

## Implementation Plan

## Milestone 1: Stable Local Memory Kernel

- upgrade schema from `Memory` to `MemoryRecord`
- replace JSON store with SQLite
- add repository abstraction
- keep heuristic ingest
- keep lexical assemble
- support migration from old JSON if present

Definition of done:

- local persistence works
- all tests pass
- session/user/project scopes exist
- prompt assembly uses ranked retrieval

## Milestone 2: Better Recall Quality

- add type-aware extraction
n- add importance/confidence scoring
- improve compaction rules
- add inspection/debug command output

Definition of done:

- memories are typed
- preferences/decisions survive better than noise
- duplicate records are reduced

## Milestone 3: Local Semantic Memory

- add local embedding provider
- add semantic retrieval path
- blend semantic ranking with heuristic ranking

Definition of done:

- similar phrasing can recall the same memory
- retrieval quality beats lexical-only baseline

## Testing Strategy

### Unit Tests

- repository CRUD
- ingest extraction rules
- ranking logic
- compaction logic
- scope filtering

### Integration Tests

- ingest -> persist -> bootstrap
- ingest -> assemble under small budget
- subagent return -> memory store update
- migration from JSON store to SQLite

### Golden Tests

Use stable fixtures for:

- user preferences
- project decisions
- noisy conversational input
- repeated facts

These tests should verify which memories are selected and in what order.

## Open Questions

- what local embedding runtime should be the default?
- should user/project identity come from OpenClaw session metadata or plugin config?
- how aggressive should compaction be for session memories?
- should memory rendering be natural-language bullets or hidden system context blocks?

## Immediate Next Steps

1. refactor current `Memory` model into `MemoryRecord`
2. add SQLite-backed repository
3. implement migration from JSON store
4. split current context engine logic into extractor/repository/ranker responsibilities
5. add tests around scope/type/importance behavior

## Summary

mem8 should be built as a local memory kernel first, and an OpenClaw plugin second.

The core challenge is not plugin wiring.
The core challenge is building a memory lifecycle that:

- extracts the right information
- stores it with enough structure
- retrieves it at the right moment
- stays clean over time

If this design is followed, mem8 can evolve from a local MVP into a serious local-first memory system without throwing away the first implementation.
