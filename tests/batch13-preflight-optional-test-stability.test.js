const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { withTempDir, writeFiles, runNodeJson } = require('./test-helpers.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'preflight-production.js');

function fakeNpmScript() {
  return `#!/usr/bin/env node
const args = process.argv.slice(2);
function out(obj) { console.log(JSON.stringify(obj)); }
if (args[0] === 'test') { console.log('tests ok'); process.exit(0); }
if (args[0] === 'run' && args[1] === 'lint') { console.log('lint ok'); process.exit(0); }
if (args[0] === 'run' && args[1] === 'typecheck') { console.log('typecheck ok'); process.exit(0); }
if (args[0] === 'run' && args[1] === 'build') { console.log('build ok'); process.exit(0); }
if (args[0] === 'run' && args[1] === 'quality-gate:json') { out({ decision: 'pass' }); process.exit(0); }
if (args[0] === 'run' && args[1] === 'release:check:json') {
  out({ decision: 'ready', selected_policy: { id: 'production' }, checks: [], benchmark_baseline_naming: { recommended_name: 'release.node-api.production', selected_name: 'release.node-api.production' } });
  process.exit(0);
}
if (args[0] === 'run' && args[1] === 'release:evidence:json') {
  out({ summary: { release_conclusion: { release_decision: 'ready', ready_state: 'ready', reason: 'all checks passed', release_policy: 'production', override_used: false, baseline_approved: true, benchmark_fresh_enough: true, rollback_ready: true, canonical_baseline_name: 'release.node-api.production', selected_baseline_name: 'release.node-api.production', override_pressure_status: 'none', override_pressure_last_30_days: 0 }, why_blocked_or_caution: [], benchmark_readiness: 'ready', benchmark_freshness: 'fresh', baseline_status: 'approved', approval_status: 'approved', latest_rehearsal_decision: 'ready', override_pressure: { status: 'none', last_30_days_count: 0 } } });
  process.exit(0);
}
console.error('unexpected npm args', args.join(' '));
process.exit(1);
`;
}

test('preflight can include optional test stability evidence without changing release gate', () => {
  withTempDir((root) => {
    writeFiles(root, {
      'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
      'scripts/test-stability.js': '#!/usr/bin/env node\nconsole.log(JSON.stringify({schema_name:"test_stability_summary",schema_version:"1.0",stable:true,repeat_count:1,pass_count:1,fail_count:0,workspace_mode:"temp_copy",ci_mode:"ci",iterations:[{iteration:1,code:0,timed_out:false,summary:"ok"}]}));\n',
      'bin/npm': fakeNpmScript(),
    });
    require('fs').mkdirSync(path.join(root, 'scripts'), { recursive: true });
    require('fs').chmodSync(path.join(root, 'bin', 'npm'), 0o755);
  }, (root) => {
    const envPath = `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`;
    const summary = runNodeJson(SCRIPT, ['--root', root, '--json', '--include-test-stability', '--test-stability-repeat', '1', '--test-stability-temp-copy'], {
      cwd: root,
      env: { PATH: envPath },
    });
    assert.equal(summary.decision, 'ready');
    assert.ok(summary.optional_evidence);
    assert.equal(summary.optional_evidence.name, 'test_stability');
    assert.equal(summary.optional_evidence.status, 'pass');
    assert.equal(summary.optional_evidence.summary.schema_name, 'test_stability_summary');
  });
});
