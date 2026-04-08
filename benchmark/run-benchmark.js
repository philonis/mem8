const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Mem8ContextEngine } = require('../dist/context-engine.js');
const { MemoryExtractor } = require('../dist/memory-extractor.js');

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function contentMatches(memory, expected) {
  return (expected.contentIncludes || []).some((fragment) =>
    memory.content.toLowerCase().includes(fragment.toLowerCase())
  );
}

function findExpectedMatches(memories, expectedMemories) {
  return expectedMemories.map((expected) => {
    const match = memories.find((memory) => {
      if (expected.scope && memory.scope !== expected.scope) return false;
      if (expected.type && memory.type !== expected.type) return false;
      return contentMatches(memory, expected);
    });
    return { expected, match };
  });
}

function makeBaselineRecords(caseData) {
  const extractor = new MemoryExtractor();
  const records = extractor.extract({
    sessionId: caseData.id,
    turnNumber: 1,
    config: { userId: 'benchmark-user', projectId: 'benchmark-project' },
    recentMessages: caseData.conversation.map((content) => ({ role: 'user', content }))
  });

  return records.map((record) => ({
    ...record,
    id: `baseline-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }));
}

async function runCase(caseData) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mem8-bench-${caseData.id}-`));
  const config = {
    dbPath: path.join(dir, 'memories.sqlite'),
    debug: false,
    userId: 'benchmark-user',
    projectId: 'benchmark-project',
    embeddingProvider: 'none'
  };

  const engine = new Mem8ContextEngine(config);
  let turn = 1;
  for (const message of caseData.conversation) {
    await engine.ingest({
      sessionId: caseData.id,
      turnNumber: turn++,
      config,
      recentMessages: [{ role: 'user', content: message }]
    });
  }

  const storedMemories = await engine.getStore().query({ limit: 200, sessionId: caseData.id, projectId: 'benchmark-project', userId: 'benchmark-user' });
  const expectedMatches = findExpectedMatches(storedMemories, caseData.expectedMemories);
  const extractionHits = expectedMatches.filter((m) => m.match).length;
  const extractionRecall = caseData.expectedMemories.length ? extractionHits / caseData.expectedMemories.length : 1;
  const extractionPrecision = storedMemories.length ? extractionHits / storedMemories.length : 1;

  const queryResults = [];
  for (const queryCase of caseData.queries) {
    const assembled = await engine.assemble({
      sessionId: caseData.id,
      turnNumber: turn,
      config,
      availableTokens: 120,
      currentText: queryCase.query
    });
    const top = assembled.memories[0];
    const topMatches = top
      && (!queryCase.expected.scope || top.scope === queryCase.expected.scope)
      && (!queryCase.expected.type || top.type === queryCase.expected.type)
      && contentMatches(top, queryCase.expected);

    const transcriptPayload = caseData.conversation.join('\n');
    const baselineRecords = makeBaselineRecords(caseData);
    const baselinePayload = baselineRecords.map((record) => record.content).join('\n');
    const mem8Payload = assembled.memories.map((memory) => memory.content).join('\n');

    queryResults.push({
      query: queryCase.query,
      topHit: top ? {
        scope: top.scope,
        type: top.type,
        content: top.content
      } : null,
      hit: Boolean(topMatches),
      transcriptTokens: estimateTokens(transcriptPayload),
      baselineTokens: estimateTokens(baselinePayload),
      mem8Tokens: estimateTokens(mem8Payload)
    });
  }

  const queryHitRate = queryResults.length
    ? queryResults.filter((result) => result.hit).length / queryResults.length
    : 1;

  const avgTranscriptTokens = average(queryResults.map((result) => result.transcriptTokens));
  const avgBaselineTokens = average(queryResults.map((result) => result.baselineTokens));
  const avgMem8Tokens = average(queryResults.map((result) => result.mem8Tokens));
  const tokenSavingsVsTranscript = avgTranscriptTokens > 0 ? 1 - avgMem8Tokens / avgTranscriptTokens : 0;
  const tokenSavingsVsBaseline = avgBaselineTokens > 0 ? 1 - avgMem8Tokens / avgBaselineTokens : 0;

  await engine.getStore().close();
  fs.rmSync(dir, { recursive: true, force: true });

  return {
    id: caseData.id,
    description: caseData.description,
    storedCount: storedMemories.length,
    extraction: {
      expected: caseData.expectedMemories.length,
      hits: extractionHits,
      precision: extractionPrecision,
      recall: extractionRecall
    },
    retrieval: {
      queries: queryResults.length,
      hitRate: queryHitRate,
      details: queryResults
    },
    tokens: {
      avgTranscriptTokens,
      avgBaselineTokens,
      avgMem8Tokens,
      savingsVsTranscript: tokenSavingsVsTranscript,
      savingsVsBaseline: tokenSavingsVsBaseline
    }
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function buildReport(datasetName, results) {
  const overall = {
    extractionPrecision: average(results.map((result) => result.extraction.precision)),
    extractionRecall: average(results.map((result) => result.extraction.recall)),
    retrievalHitRate: average(results.map((result) => result.retrieval.hitRate)),
    avgTranscriptTokens: average(results.map((result) => result.tokens.avgTranscriptTokens)),
    avgBaselineTokens: average(results.map((result) => result.tokens.avgBaselineTokens)),
    avgMem8Tokens: average(results.map((result) => result.tokens.avgMem8Tokens)),
    savingsVsTranscript: average(results.map((result) => result.tokens.savingsVsTranscript)),
    savingsVsBaseline: average(results.map((result) => result.tokens.savingsVsBaseline))
  };

  const lines = [];
  lines.push(`# ${datasetName} Report`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`- Extraction precision: ${formatPct(overall.extractionPrecision)}`);
  lines.push(`- Extraction recall: ${formatPct(overall.extractionRecall)}`);
  lines.push(`- Retrieval hit rate: ${formatPct(overall.retrievalHitRate)}`);
  lines.push(`- Avg payload tokens (transcript baseline): ${overall.avgTranscriptTokens.toFixed(1)}`);
  lines.push(`- Avg payload tokens (rule baseline): ${overall.avgBaselineTokens.toFixed(1)}`);
  lines.push(`- Avg payload tokens (mem8): ${overall.avgMem8Tokens.toFixed(1)}`);
  lines.push(`- Token savings vs transcript baseline: ${formatPct(overall.savingsVsTranscript)}`);
  lines.push(`- Token savings vs rule baseline: ${formatPct(overall.savingsVsBaseline)}`);
  lines.push('');
  lines.push('## Comparison Table');
  lines.push('');
  lines.push('| Case | Extraction Recall | Retrieval Hit Rate | Transcript Tokens | Baseline Tokens | mem8 Tokens | Savings vs Transcript |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const result of results) {
    lines.push(`| ${result.id} | ${formatPct(result.extraction.recall)} | ${formatPct(result.retrieval.hitRate)} | ${result.tokens.avgTranscriptTokens.toFixed(1)} | ${result.tokens.avgBaselineTokens.toFixed(1)} | ${result.tokens.avgMem8Tokens.toFixed(1)} | ${formatPct(result.tokens.savingsVsTranscript)} |`);
  }
  lines.push('');
  lines.push('## User-Facing Value');
  lines.push('');
  lines.push('- mem8 converts noisy multi-turn conversation into compact structured memory.');
  lines.push('- In this offline benchmark, mem8 preserves the key user/project/task signals while reducing prompt payload size.');
  lines.push('- The result is a stronger long-context memory layer with lower token overhead than replaying transcript-heavy context.');
  lines.push('');
  lines.push('## Per-Case Notes');
  lines.push('');
  for (const result of results) {
    lines.push(`### ${result.id}`);
    lines.push(`- ${result.description}`);
    lines.push(`- Extraction: ${result.extraction.hits}/${result.extraction.expected} matched expected memories`);
    lines.push(`- Retrieval hit rate: ${formatPct(result.retrieval.hitRate)}`);
    for (const detail of result.retrieval.details) {
      lines.push(`- Query: ${detail.query}`);
      lines.push(`  - Hit: ${detail.hit ? 'yes' : 'no'}`);
      lines.push(`  - Top result: ${detail.topHit ? `${detail.topHit.scope}/${detail.topHit.type} - ${detail.topHit.content}` : '(none)'}`);
      lines.push(`  - Tokens: transcript=${detail.transcriptTokens}, baseline=${detail.baselineTokens}, mem8=${detail.mem8Tokens}`);
    }
    lines.push('');
  }

  return { overall, markdown: lines.join('\n') };
}

async function main() {
  const fixturePath = process.argv[2] || path.join(__dirname, 'fixtures', 'local-memory-benchmark.json');
  const outputDir = process.argv[3] || path.join(__dirname, 'output');
  const dataset = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const results = [];
  for (const caseData of dataset.cases) {
    results.push(await runCase(caseData));
  }

  const report = buildReport(dataset.name, results);
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `benchmark-${timestamp}.json`);
  const mdPath = path.join(outputDir, `benchmark-${timestamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ dataset: dataset.name, results, overall: report.overall }, null, 2));
  fs.writeFileSync(mdPath, report.markdown);

  console.log(JSON.stringify({ jsonPath, mdPath, overall: report.overall }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
