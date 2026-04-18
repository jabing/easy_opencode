const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { selectSkill } = require('../src/core/implementation/skill-selection.js');
const { writeFiles } = require('./test-helpers.js');

const ROOT = path.resolve(__dirname, '..');

function withTempRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-skill-reporting-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function nodeExpressFixture() {
  return {
    'package.json': JSON.stringify({
      name: 'selection-node-fixture',
      scripts: { test: 'node --test', build: 'node -e "process.exit(0)"' },
      dependencies: { express: '^4.19.0' },
    }, null, 2) + '\n',
    'src/index.ts': 'export const ok = true;\n',
    'docs/api/index.md': '# API\n',
  };
}

test('selection reports expose structured basis, rejection counters, and selected candidate details', () => {
  withTempRoot((root) => {
    writeFiles(root, nodeExpressFixture());
    const profile = detectProjectProfile(root);
    const result = selectSkill(ROOT, { objective: 'add health endpoint', limit: 10, 'rejected-limit': 10 }, profile);

    assert.equal(result.report.report_version, '2.0');
    assert.equal(result.report.selection_basis, 'constraints_then_ranking');
    assert.equal(result.report.selected.dir, 'add-express-route');
    assert.equal(result.report.rejected_by_reason.runtime_mismatch >= 1, true);
    assert.equal(result.report.rejected_by_reason.framework_mismatch >= 1, true);

    const accepted = result.report.accepted_candidates.find((item) => item.dir === 'add-express-route');
    assert.ok(accepted);
    assert.equal(Array.isArray(accepted.decision.score_breakdown), true);
  });
});

test('skill selection implementation is split into focused modules with a tighter file budget', () => {
  const files = [
    ['src/core/implementation/skill-selection.js', 140],
    ['src/core/implementation/skill-selection-shared.js', 120],
    ['src/core/implementation/skill-selection-constraints.js', 120],
    ['src/core/implementation/skill-selection-ranking.js', 180],
    ['src/core/implementation/skill-selection-reporting.js', 160],
  ];
  for (const [rel, maxLines] of files) {
    const lineCount = fs.readFileSync(path.join(ROOT, rel), 'utf8').trimEnd().split(/\n/).length;
    assert.ok(lineCount <= maxLines, `${rel} expected <= ${maxLines} lines, got ${lineCount}`);
  }

  const orchestrator = fs.readFileSync(path.join(ROOT, 'src/core/implementation/skill-selection.js'), 'utf8');
  assert.match(orchestrator, /skill-selection-shared/);
  assert.match(orchestrator, /skill-selection-ranking/);
  assert.match(orchestrator, /skill-selection-reporting/);
  assert.doesNotMatch(orchestrator, /function buildConstraintOutcome\(/);
});
