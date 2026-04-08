import { IngestInput, MemoryRecordInput } from './types';

interface ExtractionRule {
  type: MemoryRecordInput['type'];
  scope: MemoryRecordInput['scope'] | 'auto-project';
  importance: number;
  confidence: number;
  patterns: RegExp[];
}

const EXTRACTION_RULES: ExtractionRule[] = [
  {
    type: 'preference',
    scope: 'user',
    importance: 0.85,
    confidence: 0.82,
    patterns: [
      /\b(i prefer|prefer|usually|always|default to|tend to)\b/i,
      /(喜欢|偏好|默认|习惯|通常|尽量|不要|别用)/
    ]
  },
  {
    type: 'decision',
    scope: 'auto-project',
    importance: 0.92,
    confidence: 0.84,
    patterns: [
      /\b(decided to|we decided|use this|settled on|we will use|chose to)\b/i,
      /(决定|定了|采用|改成|就用|选用|方案是)/
    ]
  },
  {
    type: 'task',
    scope: 'session',
    importance: 0.74,
    confidence: 0.78,
    patterns: [
      /\b(todo|follow up|need to|remember to|next step|next we should)\b/i,
      /(待会|下次|记得|需要|下一步|后面要|跟进)/
    ]
  }
];

export class MemoryExtractor {
  extract(input: IngestInput): MemoryRecordInput[] {
    const candidates = this.collectCandidates(input.recentMessages.map((message) => message.content).join('\n'));
    const extracted = candidates.map((sentence) => this.classifySentence(sentence, input));
    return this.dedupeCandidates(extracted);
  }

  private collectCandidates(text: string): string[] {
    return text
      .split(/[\n.!?。！？]/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 18)
      .filter((sentence) => !this.isNoise(sentence))
      .slice(0, 12);
  }

  private isNoise(sentence: string): boolean {
    const noisePatterns = [
      /^(ok|okay|thanks|thank you|sure|got it|hello|hi)$/i,
      /^(好的|收到|知道了|谢谢|你好|嗯|好)$/
    ];
    return noisePatterns.some((pattern) => pattern.test(sentence));
  }

  private classifySentence(sentence: string, input: IngestInput): MemoryRecordInput {
    let matched = EXTRACTION_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(sentence)));

    let type: MemoryRecordInput['type'] = matched?.type || 'fact';
    let scope: MemoryRecordInput['scope'] = 'session';
    let importance = matched?.importance || 0.52;
    let confidence = matched?.confidence || 0.6;

    if (matched) {
      scope = matched.scope === 'auto-project' ? (input.config.projectId ? 'project' : 'session') : matched.scope;
    }

    const lower = sentence.toLowerCase();
    const mentionsProject = /(mem8|project|architecture|plugin|contextengine|repo|roadmap)/i.test(sentence);
    if (mentionsProject && input.config.projectId) {
      scope = scope === 'user' ? scope : 'project';
      importance = Math.max(importance, 0.78);
    }

    if (type === 'fact' && /(must|should|critical|important|原则|必须|关键|核心)/i.test(sentence)) {
      importance = Math.max(importance, 0.75);
      confidence = Math.max(confidence, 0.7);
    }

    const normalized = this.normalizeSentence(sentence);
    const summary = normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;

    return {
      scope,
      type,
      sessionId: input.sessionId,
      userId: input.config.userId,
      projectId: input.config.projectId,
      content: normalized,
      summary,
      importance,
      freshness: importance,
      confidence,
      source: 'conversation',
      sourceTurn: input.turnNumber,
      metadata: {
        roles: input.recentMessages.map((message) => message.role),
        extractedBy: 'rule-based-v2',
        mentionsProject,
        matchedType: type,
        containsEnglish: /[A-Za-z]/.test(sentence),
        containsChinese: /[\u4e00-\u9fff]/.test(sentence),
        lexicalHints: lower.split(/\s+/).slice(0, 8)
      }
    };
  }

  private normalizeSentence(sentence: string): string {
    return sentence.replace(/\s+/g, ' ').trim();
  }

  private dedupeCandidates(records: MemoryRecordInput[]): MemoryRecordInput[] {
    const seen = new Set<string>();
    const results: MemoryRecordInput[] = [];

    for (const record of records) {
      const key = `${record.scope}:${record.type}:${record.content.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(record);
      }
    }

    return results;
  }
}
