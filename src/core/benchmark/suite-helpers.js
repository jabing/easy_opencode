// @ts-nocheck
const fs = require('fs');
const path = require('path');

function normalizeSamplePreset(value) {
  const raw = String(value || 'core').trim().toLowerCase();
  if (!raw || raw === 'core' || raw === 'default') return 'core';
  if (raw === 'production-readiness' || raw === 'release' || raw === 'release-readiness' || raw === 'prod') return 'production-readiness';
  if (raw === 'deep-task-families' || raw === 'deep' || raw === 'task-families') return 'deep-task-families';
  if (raw === 'node-api' || raw === 'node') return 'node-api';
  if (raw === 'python-service' || raw === 'python') return 'python-service';
  if (raw === 'go-service' || raw === 'go') return 'go-service';
  if (raw === 'java-service' || raw === 'java' || raw === 'spring') return 'java-service';
  if (raw === 'plugin-self-release' || raw === 'self-release' || raw === 'plugin') return 'plugin-self-release';
  if (raw === 'strong-coder' || raw === 'coder' || raw === 'repair') return 'strong-coder';
  throw new Error(`unsupported sample preset: ${value}`);
}

function benchmarkProfiles() {
  return {
    'node-api': {
      profile: 'node-api',
      schema_version: '1.1',
      name: 'node-api-profile',
      description: 'Formal benchmark profile for Node API style projects.',
      cases: [
        {
          id: 'node-health-endpoint',
          root: './fixtures/node-api',
          objective: 'add health endpoint',
          skill: 'add-express-route',
          scaffold: true,
          review_gate: true,
          var: { name: 'health-check', route_path: '/healthz' },
          expected: { runtime: 'node', skill: 'add-express-route', min_outputs: 3, review_verdict: ['ACCEPT', 'ACCEPT_WITH_FOLLOWUPS'] },
        },
        {
          id: 'node-service-module',
          root: './fixtures/node-api',
          objective: 'add user profile service module',
          skill: 'add-service-module',
          scaffold: true,
          var: { name: 'user-profile', service_name: 'UserProfileService' },
          expected: { runtime: 'node', skill: 'add-service-module', min_outputs: 2, integration_status: ['applied', 'updated_index', 'none'] },
        },
        {
          id: 'node-config-module',
          root: './fixtures/node-api',
          objective: 'add app config module',
          skill: 'add-config-module',
          scaffold: true,
          var: { name: 'app-config', module_name: 'appConfig' },
          expected: { runtime: 'node', skill: 'add-config-module', min_outputs: 2 },
        },
      ],
    },
    'python-service': {
      profile: 'python-service',
      schema_version: '1.1',
      name: 'python-service-profile',
      description: 'Formal benchmark profile for Python service style projects.',
      cases: [
        {
          id: 'python-fastapi-endpoint',
          root: './fixtures/python-service',
          objective: 'add status endpoint',
          skill: 'add-fastapi-endpoint',
          scaffold: true,
          review_gate: true,
          var: { name: 'status', route_path: '/status' },
          expected: { runtime: 'python', skill: 'add-fastapi-endpoint', min_outputs: 2 },
        },
        {
          id: 'python-unit-test',
          root: './fixtures/python-service',
          objective: 'add unit test for user service',
          skill: 'add-unit-test',
          scaffold: true,
          expected: { runtime: 'python', skill: 'add-unit-test', min_outputs: 1 },
        },
        {
          id: 'django-model',
          root: './fixtures/python-service',
          objective: 'add audit log model',
          skill: 'add-django-model',
          scaffold: true,
          review_gate: true,
          var: { name: 'audit-log', model_name: 'AuditLog' },
          expected: { runtime: 'python', skill: 'add-django-model', min_outputs: 2 },
        },
      ],
    },
    'go-service': {
      profile: 'go-service',
      schema_version: '1.1',
      name: 'go-service-profile',
      description: 'Formal benchmark profile for Go service style projects.',
      cases: [
        {
          id: 'go-handler',
          root: './fixtures/go-service',
          objective: 'add health handler',
          skill: 'add-go-handler',
          scaffold: true,
          review_gate: true,
          'no-validate': true,
          expected: { runtime: 'go', skill: 'add-go-handler', min_outputs: 2 },
        },
        {
          id: 'go-unit-test',
          root: './fixtures/go-service',
          objective: 'add repository unit test',
          skill: 'add-unit-test',
          scaffold: true,
          'no-validate': true,
          expected: { runtime: 'go', skill: 'add-unit-test', min_outputs: 1 },
        },
      ],
    },
    'java-service': {
      profile: 'java-service',
      schema_version: '1.1',
      name: 'java-service-profile',
      description: 'Formal benchmark profile for Java or Spring service style projects.',
      cases: [
        {
          id: 'java-controller',
          root: './fixtures/java-service',
          objective: 'add health controller',
          skill: 'add-spring-controller',
          scaffold: true,
          review_gate: true,
          'no-validate': true,
          expected: { runtime: 'java', skill: 'add-spring-controller', min_outputs: 2 },
        },
        {
          id: 'java-service-module',
          root: './fixtures/java-service',
          objective: 'add ledger service module',
          skill: 'add-service-module',
          scaffold: true,
          'no-validate': true,
          var: { name: 'ledger', subject: 'Ledger', package_name: 'com.example.app' },
          expected: { runtime: 'java', skill: 'add-service-module', min_outputs: 2 },
        },
      ],
    },
    'plugin-self-release': {
      profile: 'plugin-self-release',
      schema_version: '1.1',
      name: 'plugin-self-release-profile',
      description: 'Formal benchmark profile for the plugin repository release-critical path.',
      cases: [
        {
          id: 'plugin-profile',
          root: '.',
          objective: 'inspect project profile and release readiness',
          skill: 'add-config-module',
          scaffold: true,
          var: { name: 'release-observability', module_name: 'releaseObservability' },
          expected: { runtime: 'node', skill: 'add-config-module', min_outputs: 2 },
        },
        {
          id: 'plugin-review-gate',
          root: '.',
          objective: 'exercise release-critical review path',
          skill: 'add-service-module',
          scaffold: true,
          review_gate: true,
          var: { name: 'release-audit', service_name: 'ReleaseAuditService' },
          expected: { runtime: 'node', skill: 'add-service-module', min_outputs: 2, review_verdict: ['ACCEPT', 'ACCEPT_WITH_FOLLOWUPS'] },
        },
      ],
    },
    'strong-coder': {
      profile: 'strong-coder',
      schema_version: '1.2',
      name: 'strong-coder-profile',
      description: 'Benchmark profile biased toward realistic bugfix, repair, and narrow refactor loops.',
      cases: [
        {
          id: 'node-bugfix-assertion',
          root: './fixtures/node-api',
          objective: 'fix health endpoint assertion regression',
          skill: 'add-unit-test',
          scaffold: false,
          scenario: 'bugfix',
          expected: { runtime: 'node', max_rounds_to_green: 2, preferred_patch_discipline: 'tight' },
        },
        {
          id: 'node-type-repair',
          root: './fixtures/node-api',
          objective: 'repair route handler type mismatch',
          skill: 'add-express-route',
          scaffold: false,
          scenario: 'type-repair',
          expected: { runtime: 'node', max_rounds_to_green: 2, preferred_patch_discipline: 'tight' },
        },
        {
          id: 'plugin-local-refactor',
          root: '.',
          objective: 'refactor review gate patch discipline handling without widening the merge surface',
          skill: 'add-service-module',
          scaffold: false,
          scenario: 'local-refactor',
          expected: { runtime: 'node', max_rounds_to_green: 3, preferred_patch_discipline: 'mixed' },
        },
      ],
    },
  };
}

function readFailureReplayCases(rootDir, options = {}, readJson) {
  const limit = Math.max(1, Number(options.limit || 10));
  const dir = path.join(String(rootDir || process.cwd()), '.opencode', 'coder-loop');
  if (!fs.existsSync(dir)) {
    return {
      profile: 'failure-replay',
      schema_version: '1.0',
      name: 'failure-replay-suite',
      description: 'Replay suite synthesized from recent coder-loop runs.',
      cases: [],
      source: { kind: 'coder-loop', run_count: 0 },
    };
  }
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'latest.json')
    .map((name) => ({ name, abs: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
  const cases = [];
  for (const file of files) {
    let run = null;
    try { run = readJson(file.abs); } catch (error) { run = null; }
    if (!run || !run.run_id) continue;
    const profile = run.context && run.context.profile ? run.context.profile : {};
    const failures = Array.isArray(run.latest_failures) ? run.latest_failures : [];
    const failureKinds = Array.from(new Set(failures.map((item) => String(item.kind || item.category || '')).filter(Boolean)));
    const objectiveText = String(run.objective || '').toLowerCase();
    let scenario = 'bugfix';
    if (failureKinds.includes('typecheck') || /type/.test(objectiveText)) scenario = 'type-repair';
    else if (/refactor/.test(objectiveText)) scenario = 'local-refactor';
    else if (failureKinds.includes('import_resolve')) scenario = 'import-repair';
    const patch = run.current_patch_evaluation || {};
    const patchDiscipline = patch.verdict === 'reject' ? 'tight' : (Number(patch.unrelated_edit_ratio || 0) > 0.2 ? 'mixed' : 'tight');
    const roundsToGreen = String(run.status || '') === 'green'
      ? Math.max(1, Array.isArray(run.rounds) ? run.rounds.length : 1)
      : Math.max(2, Math.min(5, (Array.isArray(run.rounds) ? run.rounds.length : 1) + 1));
    cases.push({
      id: `replay-${run.run_id}`,
      root: run.root_dir || '.',
      objective: run.objective || 'repair recent failure',
      scaffold: false,
      scenario,
      source_run_id: run.run_id,
      replay_failure_kinds: failureKinds,
      expected: {
        runtime: profile.runtime || 'unknown',
        max_rounds_to_green: roundsToGreen,
        preferred_patch_discipline: patchDiscipline,
      },
    });
  }
  return {
    profile: 'failure-replay',
    schema_version: '1.0',
    name: 'failure-replay-suite',
    description: 'Replay suite synthesized from recent coder-loop runs.',
    cases,
    source: { kind: 'coder-loop', run_count: cases.length },
  };
}


function materializeSuiteRoots(suite, baseDir = process.cwd()) {
  const resolvedBase = path.resolve(String(baseDir || process.cwd()));
  const next = {
    ...suite,
    cases: Array.isArray(suite.cases)
      ? suite.cases.map((caseDef) => ({
          ...caseDef,
          root: typeof caseDef.root === 'string' && caseDef.root.trim()
            ? path.resolve(resolvedBase, caseDef.root)
            : caseDef.root,
        }))
      : [],
  };
  if (next.source && next.source.kind === 'coder-loop') return next;
  next.generated_from = resolvedBase;
  return next;
}

function sampleSuite(preset = 'core') {
  const selected = normalizeSamplePreset(preset);
  const profiles = benchmarkProfiles();
  if (profiles[selected]) return profiles[selected];
  const suites = {
    core: {
      schema_version: '1.1',
      name: 'sample-multilang-task-success',
      description: 'Sample benchmark suite for runtime detection, task scaffolding, validation, and merge-gate readiness.',
      cases: [
        {
          id: 'node-health-endpoint',
          root: './path/to/node-project',
          objective: 'add health endpoint',
          skill: 'add-express-route',
          scaffold: true,
          review_gate: true,
          var: { name: 'health-check', route_path: '/healthz' },
          expected: { runtime: 'node', skill: 'add-express-route', min_outputs: 3, review_verdict: ['ACCEPT', 'ACCEPT_WITH_FOLLOWUPS'] },
        },
        {
          id: 'python-unit-test',
          root: './path/to/python-project',
          objective: 'add unit test for user service',
          skill: 'add-unit-test',
          scaffold: true,
          expected: { runtime: 'python', skill: 'add-unit-test', min_outputs: 1 },
        },
        {
          id: 'go-handler',
          root: './path/to/go-project',
          objective: 'add health handler',
          skill: 'add-go-handler',
          scaffold: true,
          review_gate: true,
          'no-validate': true,
          expected: { runtime: 'go', skill: 'add-go-handler', min_outputs: 2 },
        },
      ],
    },
    'production-readiness': {
      schema_version: '1.2',
      name: 'production-readiness-multilang',
      description: 'Expanded suite covering service, config, test, and release-sensitive tasks across runtimes.',
      cases: [
        ...benchmarkProfiles()['node-api'].cases,
        ...benchmarkProfiles()['python-service'].cases,
        ...benchmarkProfiles()['go-service'].cases,
        ...benchmarkProfiles()['java-service'].cases,
      ],
    },
    'deep-task-families': {
      schema_version: '1.2',
      name: 'deep-task-families',
      description: 'Focused suite emphasizing newer task bundle families for richer regression checks.',
      cases: [
        { id: 'node-service-module', root: './fixtures/node-api', objective: 'add service module', skill: 'add-service-module', scaffold: true, expected: { runtime: 'node' } },
        { id: 'node-config-module', root: './fixtures/node-api', objective: 'add config module', skill: 'add-config-module', scaffold: true, expected: { runtime: 'node' } },
        { id: 'python-unit-test', root: './fixtures/python-service', objective: 'add unit test', skill: 'add-unit-test', scaffold: true, expected: { runtime: 'python' } },
        { id: 'django-model', root: './fixtures/python-service', objective: 'add django model', skill: 'add-django-model', scaffold: true, expected: { runtime: 'python' } },
      ],
    },
  };
  return suites[selected] || suites.core;
}

function printSummary(run, summarizeCodingCapability) {
  const coding = summarizeCodingCapability(run);
  printLine(`Benchmark run: ${run.run_id}`);
  printLine(`Suite: ${run.suite_name}`);
  printLine(`Cases: ${run.summary.total} total / ${run.summary.passed} passed / ${run.summary.failed} failed`);
  printLine(`Pass rate: ${run.summary.pass_rate}%`);
  printLine(`Task success rate: ${run.summary.task_success_rate === null ? 'n/a' : `${run.summary.task_success_rate}%`}`);
  printLine(`Coding first-pass success: ${coding.first_pass_success_rate === null ? 'n/a' : `${coding.first_pass_success_rate}%`} avg rounds=${coding.average_rounds_to_green === null ? 'n/a' : coding.average_rounds_to_green}`);
  for (const item of run.results) {
    printLine(`- ${item.case_id}: ${item.passed ? 'PASS' : 'FAIL'} runtime=${item.detected.runtime} skill=${item.task.selected_skill || 'n/a'} family=${item.task.task_family || 'other'} status=${item.plan ? item.plan.coder_loop.status : 'n/a'} task_success=${item.task.task_success ? 'yes' : 'no'}`);
    if (item.task.review_verdict) printLine(`  review: ${item.task.review_verdict}`);
    if (item.error) printLine(`  error: ${item.error}`);
    for (const check of item.checks.filter((entry) => !entry.passed)) {
      printLine(`  mismatch: ${check.field} expected=${JSON.stringify(check.expected)} actual=${JSON.stringify(check.actual)}`);
    }
  }
}

function printBaselineSummary(report) {
  if (Array.isArray(report.baselines)) {
    printLine(`Benchmark baselines: ${report.baselines.length}`);
    for (const item of report.baselines) {
      printLine(`- ${item.name}: run=${item.baseline_summary ? item.baseline_summary.run_id : 'n/a'} pass=${item.baseline_summary ? item.baseline_summary.pass_rate : 'n/a'} task=${item.baseline_summary ? item.baseline_summary.task_success_rate : 'n/a'}`);
    }
    return;
  }
  printLine(`Benchmark baseline saved: ${report.name}`);
  printLine(`Source run: ${report.baseline_summary ? report.baseline_summary.run_id : 'n/a'}`);
  printLine(`Pass rate: ${report.baseline_summary ? report.baseline_summary.pass_rate : 'n/a'}%`);
  printLine(`Task success rate: ${report.baseline_summary ? report.baseline_summary.task_success_rate : 'n/a'}%`);
}

function printComparison(report) {
  printLine(`Benchmark comparison: ${report.baseline_run_id} -> ${report.current_run_id}`);
  printLine(`Cases: ${report.summary.case_total}`);
  printLine(`Improved: ${report.summary.improved}`);
  printLine(`Regressed: ${report.summary.regressed}`);
  printLine(`Unchanged: ${report.summary.unchanged}`);
  printLine(`Pass rate delta: ${report.summary.pass_rate_delta}%`);
  printLine(`Task success delta: ${report.summary.task_success_rate_delta}%`);
  printLine(`Avg failed-count delta: ${report.summary.avg_failed_count_delta}`);
  for (const item of report.cases) {
    if (item.status === 'unchanged') continue;
    printLine(`- ${item.case_id}: ${item.status}`);
    printLine(`  baseline: pass=${item.baseline ? item.baseline.passed : 'n/a'} task=${item.baseline ? item.baseline.task_success : 'n/a'} failed=${item.baseline ? item.baseline.failed_count : 'n/a'}`);
    printLine(`  current : pass=${item.current ? item.current.passed : 'n/a'} task=${item.current ? item.current.task_success : 'n/a'} failed=${item.current ? item.current.failed_count : 'n/a'}`);
  }
}

function printTrendReport(report) {
  printLine(`Benchmark trends grouped by ${report.group_by}`);
  printLine(`Runs: ${report.run_count}`);
  printLine(`Buckets: ${report.bucket_count}`);
  printLine(`Latest benchmark: ${report.latest_completed_at || 'none'}`);
  printLine(`Avg latest pass rate: ${report.summary.avg_latest_pass_rate === null ? 'n/a' : `${report.summary.avg_latest_pass_rate}%`}`);
  printLine(`Avg latest task success rate: ${report.summary.avg_latest_task_success_rate === null ? 'n/a' : `${report.summary.avg_latest_task_success_rate}%`}`);
  if (Array.isArray(report.windows) && report.windows.length > 0) {
    printLine('Windows:');
    for (const window of report.windows) {
      printLine(`- last ${window.window_runs} runs (observed=${window.observed_runs}): improving=${window.summary.directions.improving} regressing=${window.summary.directions.regressing} stable=${window.summary.directions.stable} mixed=${window.summary.directions.mixed}`);
    }
  }
  printLine('Directions:');
  for (const [key, value] of Object.entries(report.summary.directions || {})) {
    printLine(`- ${key}: ${value}`);
  }
  for (const bucket of report.buckets) {
    const latest = bucket.latest || {};
    const deltas = bucket.deltas || {};
    printLine(`- ${bucket.label}: ${bucket.direction}`);
    printLine(`  latest: pass=${latest.pass_rate ?? 'n/a'} task=${latest.task_success_rate ?? 'n/a'} failed=${latest.avg_failed_count ?? 'n/a'} outputs=${latest.avg_output_count ?? 'n/a'}`);
    if (bucket.deltas) printLine(`  deltas: pass=${deltas.pass_rate} task=${deltas.task_success_rate} failed=${deltas.avg_failed_count} outputs=${deltas.avg_output_count}`);
  }
}

function printApprovalReport(report) {
  if (Array.isArray(report.approvals)) {
    printLine(`Baseline approvals: ${report.approvals.length}`);
    for (const item of report.approvals) {
      printLine(`- ${item.baseline_name}: status=${item.status} run=${item.baseline_run_id || 'n/a'} updated=${item.updated_at || item.approved_at || item.revoked_at || 'n/a'}`);
    }
    return;
  }
  printLine(`Baseline approval: ${report.baseline_name}`);
  printLine(`Status: ${report.status}`);
  printLine(`Run: ${report.baseline_run_id || 'n/a'}`);
  printLine(`Ready: ${report.ready ? 'yes' : 'no'}`);
}

function printArchiveReport(report) {
  printLine(`Benchmark archive candidates: ${report.archive_candidates.length}`);
  printLine(`Keep latest: ${report.keep_latest}`);
  printLine(`Archived: ${report.archived_count || 0}`);
  for (const item of (report.archived && report.archived.length > 0 ? report.archived : report.archive_candidates)) {
    printLine(`- ${item.run_id}: freshness=${item.freshness_status} age=${item.age_days ?? 'n/a'}`);
  }
}

function printFreshnessReport(report) {
  printLine(`Benchmark freshness: ${report.latest_status} (${report.latest_age_days !== null && report.latest_age_days !== undefined ? `${report.latest_age_days} days` : 'n/a'})`);
  printLine(`Policy: ${report.policy ? report.policy.id : 'standard'}`);
  printLine(`Runs: ${report.run_count}`);
  printLine(`Status buckets: fresh=${report.by_status.fresh || 0} aging=${report.by_status.aging || 0} stale=${report.by_status.stale || 0} expired=${report.by_status.expired || 0}`);
}

module.exports = {
  benchmarkProfiles,
  normalizeSamplePreset,
  printApprovalReport,
  printArchiveReport,
  printBaselineSummary,
  printComparison,
  printFreshnessReport,
  printSummary,
  printTrendReport,
  readFailureReplayCases,
  materializeSuiteRoots,
  sampleSuite,
};
