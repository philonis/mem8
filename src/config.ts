import type { Mem8Config } from './types';

export type Mem8ConfigInput = Partial<Mem8Config> & {
  embeddingUrl?: string;
};

export const DEFAULT_CONFIG: Mem8Config = {
  dbPath: `${process.env.HOME || '/tmp'}/.mem8/memories.sqlite`,
  embeddingProvider: 'ollama',
  embeddingModel: 'nomic-embed-text:latest',
  embeddingBaseUrl: 'http://127.0.0.1:11434',
  maxTokensPerAssemble: 500,
  debug: false
};

export function normalizeConfig(config: Mem8ConfigInput = {}): Mem8Config {
  const finalConfig: Mem8Config = { ...DEFAULT_CONFIG, ...config };

  if (typeof config.embeddingUrl === 'string' && config.embeddingUrl.trim()) {
    finalConfig.embeddingBaseUrl = config.embeddingUrl.trim();
  }

  return finalConfig;
}

export function validateConfig(config: Mem8ConfigInput | undefined): Mem8Config {
  const finalConfig = normalizeConfig(config);
  const errors: string[] = [];

  if (finalConfig.dbPath !== undefined && typeof finalConfig.dbPath !== 'string') {
    errors.push('dbPath must be a string');
  }

  if (finalConfig.embeddingProvider !== undefined && !['ollama', 'none'].includes(finalConfig.embeddingProvider)) {
    errors.push('embeddingProvider must be "ollama" or "none"');
  }

  if (finalConfig.embeddingModel !== undefined && typeof finalConfig.embeddingModel !== 'string') {
    errors.push('embeddingModel must be a string');
  }

  if (finalConfig.embeddingBaseUrl !== undefined && typeof finalConfig.embeddingBaseUrl !== 'string') {
    errors.push('embeddingBaseUrl must be a string');
  }

  if (finalConfig.maxTokensPerAssemble !== undefined) {
    if (
      typeof finalConfig.maxTokensPerAssemble !== 'number' ||
      finalConfig.maxTokensPerAssemble < 50 ||
      finalConfig.maxTokensPerAssemble > 5000
    ) {
      errors.push('maxTokensPerAssemble must be between 50 and 5000');
    }
  }

  if (finalConfig.debug !== undefined && typeof finalConfig.debug !== 'boolean') {
    errors.push('debug must be a boolean');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid mem8 config: ${errors.join('; ')}`);
  }

  return finalConfig;
}
