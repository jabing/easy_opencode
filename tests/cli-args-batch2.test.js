const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCliArgs } = require('../src/shared/cli/args.js');

test('shared cli arg parser collects repeated list flags and booleans', () => {
  const parsed = parseCliArgs(['node', 'tool', 'run', '--objective', 'ship feature', '--var', 'name=health', '--var', 'subject=status', 'extra', '--emit-prompt'], {
    defaultCommand: 'run',
    listFlags: ['var'],
  });
  assert.equal(parsed.cmd, 'run');
  assert.deepEqual(parsed.opts.var, ['name=health', 'subject=status']);
  assert.equal(parsed.opts.objective, 'ship feature');
  assert.equal(parsed.opts['emit-prompt'], true);
  assert.deepEqual(parsed.opts._, ['extra']);
});

test('shared cli arg parser rejects missing list values', () => {
  assert.throws(() => parseCliArgs(['node', 'tool', 'run', '--var'], { defaultCommand: 'run', listFlags: ['var'] }), /Missing value for --var/);
});
