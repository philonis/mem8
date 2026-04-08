import { EmbeddingProvider } from './embedding-provider';

interface OllamaEmbeddingProviderOptions {
  baseUrl?: string;
  model?: string;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private model: string;

  constructor(options: OllamaEmbeddingProviderOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://127.0.0.1:11434';
    this.model = options.model || 'bge-m3';
  }

  modelName(): string {
    return this.model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  async embed(text: string): Promise<number[]> {
    const vectors = await this.embedBatch([text]);
    return vectors[0] || [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text })
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding request failed: ${response.status}`);
      }

      const json = (await response.json()) as { embedding?: number[] };
      results.push(json.embedding || []);
    }
    return results;
  }
}
