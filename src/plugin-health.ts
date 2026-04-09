import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateConfig } from './config';
import type { Mem8Config } from './types';

export interface HealthStatus {
  healthy: boolean;
  checks: CheckResult[];
  timestamp: string;
}

export interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export function checkHealth(config: Mem8Config): HealthStatus {
  const checks: CheckResult[] = [];
  const now = new Date().toISOString();

  // Check database directory
  const dbDir = path.dirname(config.dbPath || '~/.mem8/memories.sqlite').replace(/^~/, process.env.HOME || '');
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      checks.push({ name: 'dbDir', status: 'pass', message: `Created directory: ${dbDir}` });
    } else {
      checks.push({ name: 'dbDir', status: 'pass', message: `Directory exists: ${dbDir}` });
    }
  } catch (err) {
    checks.push({ name: 'dbDir', status: 'fail', message: `Cannot access directory: ${dbDir}` });
  }

  // Check embedding provider connectivity
  if (config.embeddingProvider === 'ollama') {
    checks.push({ name: 'ollama', status: 'warn', message: 'Ollama connectivity not checked (requires runtime)' });
  }

  // Config validation
  try {
    validateConfig(config);
    checks.push({ name: 'config', status: 'pass', message: 'Config validation passed' });
  } catch (err) {
    checks.push({ name: 'config', status: 'fail', message: (err as Error).message });
  }

  const healthy = !checks.some((c) => c.status === 'fail');
  
  return { healthy, checks, timestamp: now };
}
