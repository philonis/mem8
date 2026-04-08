const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('offline benchmark generates json and markdown reports', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem8-benchmark-'));
  const fixture = path.join('/Users/qihoo/mem8/benchmark/fixtures', 'local-memory-benchmark.json');
  const output = execFileSync('node', ['benchmark/run-benchmark.js', fixture, outDir], {
    cwd: '/Users/qihoo/mem8',
    encoding: 'utf8'
  });

  const lines = output.trim().split(/\n/);
  const parsed = JSON.parse(lines[lines.length - 1]);
  assert.ok(fs.existsSync(parsed.jsonPath));
  assert.ok(fs.existsSync(parsed.mdPath));

  const md = fs.readFileSync(parsed.mdPath, 'utf8');
  assert.match(md, /Comparison Table/);
  assert.match(md, /Token savings vs transcript baseline/);

  fs.rmSync(outDir, { recursive: true, force: true });
});
