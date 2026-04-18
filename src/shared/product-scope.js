const CORE_INSTRUCTION_SKILLS = [
  'tdd-workflow',
  'security-review',
  'coding-standards',
  'verification-loop',
];

const REQUIRED_KERNEL_PATHS = [
  'README.md',
  'AGENTS.md',
  'package.json',
  'commands',
  'skills',
  'prompts',
  '.opencode/instructions/INSTRUCTIONS.md',
  '.opencode/plugins/index.ts',
  '.opencode/plugins/eoc-hooks.ts',
  '.opencode/hooks-config.json',
  '.opencode/command-policy.json',
  'bin/eoc-script.js',
  'scripts/install.js',
  'scripts/run-tests.js',
  'scripts/build-check.js',
  'scripts/quality-gate.js',
  'scripts/release-check.js',
  'scripts/release-evidence.js',
  'scripts/review-gate.js',
  'scripts/preflight-production.js',
  'scripts/project-profile.js',
  'scripts/implement-task.js',
  'scripts/skill-runner.js',
  'scripts/command-registry.js',
  'scripts/internal-tools.js',
  'scripts/package-hygiene.js',
  'src/core/checks/metadata-shared.js',
  'src/shared/opencode-config.js',
  'src/shared/product-scope.js',
  'opencode.json',
];

const PRUNED_COMMANDS = [
  'claw','evolve','instinct-export','instinct-import','instinct-status','learn','learn-eval','multi-backend','multi-execute','multi-frontend','multi-plan','multi-workflow','plankton','pm2','session-recover','sessions','superpowers-brainstorm','superpowers-execute','superpowers-plan','token-recover','ui-ux-review','vue-bigscreen','vue-bigscreen-init',
];

const PRUNED_SKILLS = [
  'clickhouse-io','configure-ecc','continuous-learning-v2','foundation-models-on-device','iterative-retrieval','nutrient-document-processing','plankton-code-quality','regex-vs-llm-structured-text','skill-stocktake','superpowers-workflow','swift-actor-persistence','swift-concurrency-6-2','swift-protocol-di-testing','swiftui-patterns','ui-ux-pro-max',
];

module.exports = {
  CORE_INSTRUCTION_SKILLS,
  REQUIRED_KERNEL_PATHS,
  PRUNED_COMMANDS,
  PRUNED_SKILLS,
};

const EXCLUDED_COMMAND_DOCS = [
  'benchmark-feedback',
  'benchmark-suite',
  'coder-context',
  'eoc-bridge',
  'eoc-metrics',
  'eoc-start',
  'failure-strategy',
  'harness-audit',
  'hook-config',
  'loop-start',
  'loop-status',
  'model-route',
  'observability-report',
  'orchestrator-state',
  'platform-report',
  'release-override',
  'runtime-detect',
  'safe-apply',
  'skill-registry',
  'skill-runner',
];

module.exports.EXCLUDED_COMMAND_DOCS = EXCLUDED_COMMAND_DOCS;
