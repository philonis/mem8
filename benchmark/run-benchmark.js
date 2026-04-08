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
  lines.push(`# ${datasetName} 评测报告`);
  lines.push('');
  lines.push('## 核心指标摘要');
  lines.push('');
  lines.push(`- 提取准确率: ${formatPct(overall.extractionPrecision)}`);
  lines.push(`- 提取召回率: ${formatPct(overall.extractionRecall)}`);
  lines.push(`- 召回命中率: ${formatPct(overall.retrievalHitRate)}`);
  lines.push(`- 平均 Token 消耗 (原始对话): ${overall.avgTranscriptTokens.toFixed(1)}`);
  lines.push(`- 平均 Token 消耗 (规则基线): ${overall.avgBaselineTokens.toFixed(1)}`);
  lines.push(`- 平均 Token 消耗 (mem8): ${overall.avgMem8Tokens.toFixed(1)}`);
  lines.push(`- Token 节省 (vs 原始对话): ${formatPct(overall.savingsVsTranscript)}`);
  lines.push(`- Token 节省 (vs 规则基线): ${formatPct(overall.savingsVsBaseline)}`);
  lines.push('');
  lines.push('## 对比表格');
  lines.push('');
  lines.push('| 测试用例 | 提取召回率 | 召回命中率 | 原始对话 Token | 规则基线 Token | mem8 Token | Token 节省 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const result of results) {
    lines.push(`| ${result.id} | ${formatPct(result.extraction.recall)} | ${formatPct(result.retrieval.hitRate)} | ${result.tokens.avgTranscriptTokens.toFixed(1)} | ${result.tokens.avgBaselineTokens.toFixed(1)} | ${result.tokens.avgMem8Tokens.toFixed(1)} | ${formatPct(result.tokens.savingsVsTranscript)} |`);
  }
  lines.push('');
  lines.push('## 核心价值');
  lines.push('');
  lines.push('- **记忆提纯**: 将多轮噪声对话转化为结构化紧凑 memory');
  lines.push('- **Token 节省**: 保留关键用户偏好/项目决策的同时，大幅降低上下文 payload 大小');
  lines.push('- **更强上下文**: 比传统 transcript 重放方式拥有更低 token 开销的记忆层');
  lines.push('');
  lines.push('## 各用例详细结果');
  lines.push('');
  for (const result of results) {
    lines.push(`### ${result.id}`);
    lines.push(`- ${result.description}`);
    lines.push(`- 提取结果: ${result.extraction.hits}/${result.extraction.expected} 条匹配预期 memory`);
    lines.push(`- 召回命中率: ${formatPct(result.retrieval.hitRate)}`);
    for (const detail of result.retrieval.details) {
      lines.push(`- 查询: ${detail.query}`);
      lines.push(`  - 命中: ${detail.hit ? '是' : '否'}`);
      lines.push(`  - 最高结果: ${detail.topHit ? detail.topHit.scope + '/' + detail.topHit.type + ' - ' + detail.topHit.content : '(无)'}`);
      lines.push(`  - Token: 原始=${detail.transcriptTokens}, 规则=${detail.baselineTokens}, mem8=${detail.mem8Tokens}`);
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
