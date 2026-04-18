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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eoc-skill-selection-'));
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

test('automatic skill selection rejects runtime/framework mismatches by default', () => {
  withTempRoot((root) => {
    writeFiles(root, nodeExpressFixture());
    const profile = detectProjectProfile(root);
    const result = selectSkill(ROOT, { objective: 'add health endpoint' }, profile);

    assert.equal(profile.runtime, 'node');
    assert.equal(profile.framework, 'express');
    assert.equal(result.selected.dir, 'add-express-route');
    assert.ok(!result.candidates.some((item) => item.dir === 'add-fastapi-endpoint'));

    const rejectedFastApi = result.report.rejected_candidates.find((item) => item.dir === 'add-fastapi-endpoint');
    assert.ok(rejectedFastApi);
    assert.match(rejectedFastApi.summary, /runtime mismatch/i);
    assert.equal(rejectedFastApi.constraints.some((item) => item.kind === 'runtime' && item.status === 'failed'), true);
  });
});

test('allow-cross-runtime keeps mismatched skills in the ranking report but marks the waiver', () => {
  withTempRoot((root) => {
    writeFiles(root, nodeExpressFixture());
    const profile = detectProjectProfile(root);
    const result = selectSkill(ROOT, { objective: 'add health endpoint', 'allow-cross-runtime': true, limit: 10 }, profile);

    assert.equal(result.selected.dir, 'add-express-route');
    const acceptedFastApi = result.report.accepted_candidates.find((item) => item.dir === 'add-fastapi-endpoint');
    assert.ok(acceptedFastApi);
    assert.equal(acceptedFastApi.decision.constraints.some((item) => item.kind === 'runtime' && item.status === 'waived'), true);
  });
});
