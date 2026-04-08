export interface Mem8Config {
  dbPath?: string;
  embeddingProvider?: 'ollama' | 'none';
  embeddingModel?: string;
  embeddingUrl?: string;
  maxTokensPerAssemble?: number;
  debug?: boolean;
}

export const DEFAULT_CONFIG: Mem8Config = {
  dbPath: '~/.mem8/memories.sqlite',
  embeddingProvider: 'none',
  embeddingModel: 'nomic-embed-text:latest',
  embeddingUrl: 'http://127.0.0.1:11434',
  maxTokensPerAssemble: 500,
  debug: false
};

export function validateConfig(config: Partial<Mem8Config> | undefined): Mem8Config {
  if (!config) {
    return { ...DEFAULT_CONFIG };
  }

  const errors: string[] = [];
  
  if (config.dbPath !== undefined && typeof config.dbPath !== 'string') {
    errors.push('dbPath must be a string');
  }

  if (config.embeddingProvider !== undefined && !['ollama', 'none'].includes(config.embeddingProvider)) {
    errors.push('embeddingProvider must be "ollama" or "none"');
  }

  if (config.embeddingModel !== undefined && typeof config.embeddingModel !== 'string') {
    errors.push('embeddingModel must be a string');
  }

  if (config.embeddingUrl !== undefined && typeof config.embeddingUrl !== 'string') {
    errors.push('embeddingUrl must be a string');
  }

  if (config.maxTokensPerAssemble !== undefined) {
    if (typeof config.maxTokensPerAssemble !== 'number' || config.maxTokensPerAssemble < 50 || config.maxTokensPerAssemble > 5000) {
      errors.push('maxTokensPerAssemble must be between 50 and 5000');
    }
  }

  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
    errors.push('debug must be a boolean');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid mem8 config: ${errors.join('; ')}`);
  }

  return { ...DEFAULT_CONFIG, ...config };
}
