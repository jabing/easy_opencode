#!/usr/bin/env node
const { runAnalyzeProjectStructure } = require('./analyze-project-structure.js');
const prepareImplementationContext = require('./prepare-implementation-context.js');
const enrichImplementationContext = require('./enrich-implementation-context.js');
const syncProjectMemory = require('./sync-project-memory.js');
const debugFixLoop = require('./debug-fix-loop.js');
const modelRoute = require('./model-route.js');
const orchestratorState = require('./orchestrator-state.js');
const benchmarkFeedback = require('./benchmark-feedback.js');
const capabilityRegistry = require('./capability-registry.js');
const skillRunner = require('./skill-runner.js');
const releaseOverride = require('./release-override.js');
const safeApply = require('./safe-apply.js');

const LEGACY_SUBCOMMAND_MAP = {
  'analyze-project-structure': ['project', 'analyze-structure'],
  'prepare-implementation-context': ['context', 'prepare'],
  'enrich-implementation-context': ['context', 'enrich'],
  'sync-project-memory': ['project', 'sync-memory'],
  'debug-fix-loop': ['debug', 'fix-loop'],
  'model-route': ['routing', 'model-route'],
  'orchestrator-state': ['orchestrator', 'state'],
  'benchmark-feedback': ['benchmark', 'feedback'],
  'capability-registry': ['skills', 'capability-registry'],
  'skill-runner': ['skills', 'skill-runner'],
  'release-override': ['release', 'override'],
  'safe-apply': ['release', 'safe-apply'],
};

function usage() {
  console.log('Usage: node scripts/internal-tools.js <domain> <command> [options]');
  console.log('Domains:');
  console.log('  project       analyze-structure | sync-memory');
  console.log('  context       prepare | enrich');
  console.log('  debug         fix-loop');
  console.log('  routing       model-route');
  console.log('  orchestrator  state');
  console.log('  benchmark     feedback');
  console.log('  skills        capability-registry | skill-runner');
  console.log('  release       override | safe-apply');
  console.log('');
  console.log('Compatibility aliases remain available for older wrapper names.');
}

function normalizeInvocation(argv) {
  const tokens = argv.slice(2);
  if (tokens.length === 0) return { domain: 'help', command: 'help', forwarded: [argv[0], argv[1]] };
  if (LEGACY_SUBCOMMAND_MAP[tokens[0]]) {
    const [domain, command] = LEGACY_SUBCOMMAND_MAP[tokens[0]];
    return { domain, command, forwarded: [argv[0], argv[1], ...tokens.slice(1)] };
  }
  return {
    domain: tokens[0],
    command: tokens[1] || 'help',
    forwarded: [argv[0], argv[1], ...tokens.slice(2)],
  };
}

function runProject(command, forwarded) {
  if (command === 'analyze-structure') {
    const opts = { root: process.cwd() };
    for (let i = 2; i < forwarded.length; i += 1) {
      const token = forwarded[i];
      if (token === '--root') opts.root = forwarded[++i] || process.cwd();
      else if (token === '--json') opts.json = true;
    }
    const payload = runAnalyzeProjectStructure(opts.root, opts);
    process.stdout.write(opts.json ? `${JSON.stringify(payload, null, 2)}
` : `[analyze-project-structure] wrote ${payload.output_path}
`);
    return;
  }
  if (command === 'sync-memory') {
    const payload = syncProjectMemory.runSyncProjectMemory(forwarded[2] || process.cwd());
    process.stdout.write(`${JSON.stringify(payload, null, 2)}
`);
    return;
  }
  throw new Error(`unknown project command: ${command}`);
}

function runContext(command, forwarded) {
  if (command === 'prepare') {
    const context = prepareImplementationContext.buildPreparedContext(prepareImplementationContext.parseArgs(forwarded));
    process.stdout.write(`${JSON.stringify(context, null, 2)}
`);
    return;
  }
  if (command === 'enrich') {
    const payload = enrichImplementationContext.runEnrichImplementationContext(forwarded[2] || process.cwd());
    process.stdout.write(`${JSON.stringify(payload, null, 2)}
`);
    return;
  }
  throw new Error(`unknown context command: ${command}`);
}

function runDebug(command, forwarded) {
  if (command !== 'fix-loop') throw new Error(`unknown debug command: ${command}`);
  const result = debugFixLoop.runDebugLoopCommand(debugFixLoop.parseArgs(forwarded));
  process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
  if (!result.ok) process.exit(1);
}

function runRouting(command, forwarded) {
  if (command !== 'model-route') throw new Error(`unknown routing command: ${command}`);
  modelRoute.main([forwarded[0], forwarded[1], ...forwarded.slice(2)]);
}

function runOrchestrator(command, forwarded) {
  if (command !== 'state') throw new Error(`unknown orchestrator command: ${command}`);
  orchestratorState.main([forwarded[0], forwarded[1], ...forwarded.slice(2)]);
}

function runBenchmark(command, forwarded) {
  if (command !== 'feedback') throw new Error(`unknown benchmark command: ${command}`);
  benchmarkFeedback.main([forwarded[0], forwarded[1], ...forwarded.slice(2)]);
}

function runSkills(command, forwarded) {
  if (command === 'capability-registry') {
    capabilityRegistry.main([forwarded[0], forwarded[1], ...forwarded.slice(2)]);
    return;
  }
  if (command === 'skill-runner') {
    skillRunner.main([forwarded[0], forwarded[1], ...forwarded.slice(2)]);
    return;
  }
  throw new Error(`unknown skills command: ${command}`);
}

function runRelease(command, forwarded) {
  if (command === 'override') {
    releaseOverride.main([forwarded[0], forwarded[1], ...forwarded.slice(2)]);
    return;
  }
  if (command === 'safe-apply') {
    safeApply.main([forwarded[0], forwarded[1], ...forwarded.slice(2)]);
    return;
  }
  throw new Error(`unknown release command: ${command}`);
}

function main(argv = process.argv) {
  const { domain, command, forwarded } = normalizeInvocation(argv);
  if (['help', '--help', '-h'].includes(domain) || ['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }
  if (domain === 'project') return runProject(command, forwarded);
  if (domain === 'context') return runContext(command, forwarded);
  if (domain === 'debug') return runDebug(command, forwarded);
  if (domain === 'routing') return runRouting(command, forwarded);
  if (domain === 'orchestrator') return runOrchestrator(command, forwarded);
  if (domain === 'benchmark') return runBenchmark(command, forwarded);
  if (domain === 'skills') return runSkills(command, forwarded);
  if (domain === 'release') return runRelease(command, forwarded);
  throw new Error(`unknown internal-tools domain: ${domain}`);
}

module.exports = { main, normalizeInvocation, LEGACY_SUBCOMMAND_MAP };

try {
  if (require.main === module) main();
} catch (error) {
  console.error(`[internal-tools] ${error.message}`);
  usage();
  process.exit(1);
}
