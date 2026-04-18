const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { collectStaticScanResults, runQualityGate, summarizeCounts, validateSkillsAndWriteRegistry } = require('../src/core/quality-gate.js');

const FIXED_NOW = () => '2026-04-14T00:00:00.000Z';

test('validateSkillsAndWriteRegistry writes deterministic registry output', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'skills/alpha/SKILL.md': '---\nname: Alpha\nversion: 1.0.0\n---\n',
      'skills/beta/SKILL.md': '---\nname: Beta\norigin: generated\n---\n',
    });
  }, (dir) => {
    const result = validateSkillsAndWriteRegistry(dir, FIXED_NOW);
    const registryPath = path.join(dir, 'skills', 'registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assert.equal(result.ok, true);
    assert.equal(registry.generated_at, '2026-04-14T00:00:00.000Z');
    assert.equal(registry.counts.total_dirs, 2);
    assert.equal(registry.counts.indexed, 2);
    assert.equal(registry.counts.failures, 0);
    assert.equal(typeof registry.counts.metadata_failures, 'number');
    assert.equal(typeof registry.counts.metadata_warnings, 'number');
    assert.deepEqual(registry.skills.map((item) => item.name), ['Alpha', 'Beta']);
  });
});

test('collectStaticScanResults ignores self-scan patterns but still catches real file risks', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'scripts/quality-gate.js': ['ev', 'al("safe in self-scan fixture")\n'].join(''),
      'src/core/rules/file-risk-rules.js': ['new ', 'Function("return 1")\n'].join(''),
      'src/app.js': ['ev', 'al("real issue")\n'].join(''),
    });
  }, (dir) => {
    const findings = collectStaticScanResults(dir);
    assert.equal(findings.fail.length, 1);
    assert.match(findings.fail[0], /eval/);
    assert.equal(findings.warn.length, 0);
  });
});

test('runQualityGate core can execute with injected deps outside plugin workspace', async () => {
  await new Promise((resolve, reject) => {
    withTempDir((dir) => {
      writeFiles(dir, {
        'package.json': JSON.stringify({ name: 'plain-node-app', scripts: { lint: 'echo lint', build: 'echo build', typecheck: 'echo typecheck' } }, null, 2),
        '.gitignore': 'node_modules\n',
        'src/index.js': 'export const value = 1;\n',
      });
    }, async (dir) => {
      try {
        const report = await runQualityGate({ full: true, json: true, silent: true }, {
          root: dir,
          runCommand: async (command, args) => ({ code: 0, timedOut: false, output: `${command}:${args.join(' ')}`, durationMs: 1, truncated: false, metric: { command, argsCount: args.length, durationMs: 1, exitCode: 0, timedOut: false, truncated: false } }),
          createEvidence: (type, source, content) => ({ id: 'e1', type, source, content }),
          summarizeEvidence: () => ({ total: 1 }),
          evaluateGate: () => ({ gate_id: 'quality-gate', status: 'pass' }),
        });
        assert.equal(report.gate, 'PASS');
        assert.deepEqual(report.counts, { pass: 8, fail: 0, warn: 0, skip: 5 });
        const checks = Object.fromEntries(report.results.map((item) => [item.check, item]));
        assert.equal(checks['script:lint'].status, 'pass');
        assert.equal(checks['script:typecheck'].status, 'pass');
        assert.equal(checks['script:build'].status, 'pass');
        assert.deepEqual(checks['package.publish_hygiene'], {
          status: 'skip',
          check: 'package.publish_hygiene',
          detail: 'not applicable outside plugin workspace',
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
});

test('summarizeCounts stays stable for mixed statuses', () => {
  const counts = summarizeCounts([
    { status: 'pass', check: 'a', detail: 'ok' },
    { status: 'warn', check: 'b', detail: 'warn' },
    { status: 'fail', check: 'c', detail: 'fail' },
    { status: 'skip', check: 'd', detail: 'skip' },
    { status: 'pass', check: 'e', detail: 'ok' },
  ]);
  assert.deepEqual(counts, { pass: 2, fail: 1, warn: 1, skip: 1 });
});
