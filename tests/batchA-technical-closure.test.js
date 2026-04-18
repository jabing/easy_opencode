const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles, runNodeJson } = require('./test-helpers.js');
const {
  assertReleaseEvidenceContract,
  assertReleaseRehearsalContract,
  assertTestStabilityContract,
  assertObservabilityReportContract,
  assertPlatformSnapshotContract,
} = require('../src/shared/contracts.js');

const observabilityScript = path.join(__dirname, '..', 'scripts', 'observability-report.js');
const { generateReleaseEvidence } = require('../src/core/release/evidence.js');
const { buildSnapshot } = require('../scripts/platform-report.js');
const scriptsRunnerIndex = require('../scripts/runners/index.js');
const srcRunnerIndex = require('../src/core/project-profile/runners/index.js');

test('script runner index delegates to src runner registry', () => {
  assert.equal(scriptsRunnerIndex.detectProjectRuntime, srcRunnerIndex.detectProjectRuntime);
  assert.equal(scriptsRunnerIndex.RUNNERS, srcRunnerIndex.RUNNERS);
});

test('release-evidence payload satisfies stable contract', () => {
  const payload = generateReleaseEvidence(process.cwd(), { policy: 'standard', baselineName: 'release', strict: false, eventLimit: 5, overrideId: null, now: null });
  assert.doesNotThrow(() => assertReleaseEvidenceContract(payload));
});

test('observability report JSON satisfies stable contract', () => {
  const payload = runNodeJson(observabilityScript, ['report', '--json']);
  assert.doesNotThrow(() => assertObservabilityReportContract(payload));
});

test('platform snapshot satisfies stable contract', () => {
  const snapshot = buildSnapshot(process.cwd());
  assert.doesNotThrow(() => assertPlatformSnapshotContract(snapshot));
});

test('test-stability summary contract accepts structured result', () => {
  assert.doesNotThrow(() => assertTestStabilityContract({
    schema_name: 'test_stability_summary',
    stable: true,
    repeat_count: 2,
    pass_count: 2,
    fail_count: 0,
    iterations: [],
  }));
});

test('release-rehearsal contract accepts minimal valid payload', () => {
  assert.doesNotThrow(() => assertReleaseRehearsalContract({
    decision: 'ready',
    rehearsal_root: '/tmp/rehearsal',
    release_report: { decision: 'approved' },
  }));
});

