#!/usr/bin/env node
const { resolveOpencodeConfig, readJsonSafe, writeJson } = require('../src/cli/config-paths.js');
const { formatManagedInvocation } = require('../src/cli/runtime-paths.js');
const { recommendTaskRoute } = require('../src/core/implementation/task-routing.js');
const { detectProjectProfile } = require('../src/core/project-profile.js');
const { assertNamedContract } = require('../src/shared/contracts.js');

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) {
      opts._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith('--')) opts[key] = true;
    else {
      opts[key] = next;
      i += 1;
    }
  }
  return opts;
}

function loadConfig(startDir = process.cwd()) {
  const configPath = resolveOpencodeConfig(startDir);
  if (!configPath) throw new Error('opencode.json not found');
  const cfg = readJsonSafe(configPath);
  if (!cfg) throw new Error(`invalid JSON at ${configPath}`);
  return { configPath, cfg };
}

function resetModels(cfg) {
  cfg.model = 'zhipuai-coding-plan/glm-5';
  cfg.small_model = 'zhipuai-coding-plan/glm-4.5-flash';
  return cfg;
}

function planRoute({ objective = '', rootDir = process.cwd(), targets = [] } = {}) {
  const profile = detectProjectProfile(rootDir);
  return recommendTaskRoute({ objective, profile, targets });
}

function usage() {
  console.log(`Usage: ${formatManagedInvocation('model-route', ['[--show|--reset|coding <model>|plan --objective "fix auth bug" --json]'])}`);
}

function main(argv = process.argv) {
  try {
    const opts = parseArgs(argv);
    const { configPath, cfg } = loadConfig(process.cwd());
    const command = opts._[0] || '--show';
    if (command === '--reset') {
      resetModels(cfg);
      writeJson(configPath, cfg);
      console.log('Reset to defaults');
      console.log(`Config: ${configPath}`);
      return;
    }
    if (command === '--show' || command === 'show') {
      const payload = {
        model: cfg.model || 'default',
        small_model: cfg.small_model || 'default',
        config: configPath,
      };
      if (opts.json) {
        assertNamedContract('model-route-view', payload);
        process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      } else {
        console.log('Current model:', payload.model);
        console.log('Small model:', payload.small_model);
        console.log(`Config: ${configPath}`);
      }
      return;
    }
    if (command === 'coding' && opts._[1]) {
      cfg.model = opts._[1];
      writeJson(configPath, cfg);
      console.log('Set coding model:', cfg.model);
      console.log(`Config: ${configPath}`);
      return;
    }
    if (command === 'plan') {
      const objective = String(opts.objective || opts._[1] || '').trim();
      if (!objective) throw new Error('missing --objective for plan');
      const targets = String(opts.targets || '').split(',').map((item) => item.trim()).filter(Boolean);
      const route = planRoute({ objective, rootDir: process.cwd(), targets });
      const payload = { config: configPath, route, model: cfg.model || 'default', small_model: cfg.small_model || 'default' };
      if (opts.json) {
        assertNamedContract('model-route-plan', payload);
        process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      } else {
        console.log(`Task kind: ${route.task_kind}`);
        console.log(`Risk: ${route.risk_level}`);
        console.log(`Coding model: ${route.coding_model === 'primary' ? (cfg.model || 'default') : (cfg.small_model || 'default')}`);
        console.log(`Repair model: ${route.repair_model === 'primary' ? (cfg.model || 'default') : (cfg.small_model || 'default')}`);
        console.log(`Edit mode: ${route.edit_mode}`);
      }
      return;
    }
    usage();
    process.exit(1);
  } catch (error) {
    console.log(`Error loading config: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  planRoute,
  resetModels,
  main,
};

if (require.main === module) {
  if (process.env.EOC_LEGACY_WRAPPER !== '1') require('./internal-tools.js').main([process.argv[0], process.argv[1], 'routing', 'model-route', ...process.argv.slice(2)]);
  else main();
}
