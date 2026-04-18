const { runQualityGate } = require('../core/quality-gate.js');
const { assertQualityGateContract } = require('../shared/contracts.js');
const { EXIT_CODE, handleCliError, parseCliArgs, resolveIo, writeJson } = require('./lib/shared.js');

/** @typedef {{ write(chunk: string): void }} WritableLike */
/** @param {{ argv?: string[], exit?: (code: number) => void, stderr?: WritableLike, stdout?: WritableLike }} [deps] */
async function main(deps = {}) {
  const { argv, exit, stderr, stdout } = resolveIo(deps);
  try {
    const options = parseCliArgs(argv);
    const result = await runQualityGate(options);
    if (options.json) {
      writeJson(stdout, result);
    } else {
      stdout.write('=== Quality Gate ===\n');
      stdout.write(`Mode: ${result.full ? 'full' : 'fast'}${result.strict ? ' + strict' : ''}\n`);
      for (const item of result.results) {
        const tag = item.status.toUpperCase().padEnd(5);
        stdout.write(`[${tag}] ${item.check} - ${item.detail}\n`);
      }
      stdout.write('\n');
      stdout.write(`Summary: pass=${result.counts.pass} fail=${result.counts.fail} warn=${result.counts.warn} skip=${result.counts.skip}\n`);
      stdout.write(`Status: ${result.gate}\n`);
    }
    exit(result.gate === 'PASS' ? EXIT_CODE.OK : EXIT_CODE.FAILED);
  } catch (error) {
    handleCliError(stderr, 'quality-gate', error, { exitCode: EXIT_CODE.FAILED, exit });
  }
}

module.exports = { main };
