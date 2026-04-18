const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { withTempDir, runNodeResult } = require('./test-helpers.js');
const { getMode, setMode, resolveModeFile } = require('../src/control-plane/product/modes.js');
const { buildMainCommandPlan } = require('../src/control-plane/product/main-commands.js');
const ROOT = path.resolve(__dirname, '..');
const EOC_BIN = path.join(ROOT, 'bin', 'eoc.js');

test('product modes persist and drive review/ship defaults', () => {
  withTempDir(() => {}, (dir) => {
    const initial = getMode(dir);
    assert.equal(initial.id, 'solo');
    const team = setMode(dir, 'team');
    assert.equal(team.id, 'team');
    assert.equal(fs.existsSync(resolveModeFile(dir)), true);
    const reviewPlan = buildMainCommandPlan('review', [], { rootDir: dir });
    assert.deepEqual(reviewPlan.runs[0], { script: 'review-gate', args: ['report', '--with-quality-gate', '--quality-mode', 'full', '--json'] });
    const shipPlan = buildMainCommandPlan('ship', [], { rootDir: dir });
    assert.deepEqual(shipPlan.runs[0], { script: 'release-check', args: ['--policy', 'production', '--strict'] });
  });
});

test('main eoc bin exposes mode get/set and commands without touching advanced surface', () => {
  withTempDir(() => {}, (dir) => {
    const commands = runNodeResult(EOC_BIN, ['commands'], { cwd: dir });
    assert.equal(commands.code, 0);
    assert.match(commands.stdout, /Main commands:/);
    assert.match(commands.stdout, /implement/);
    assert.doesNotMatch(commands.stdout, /Public managed commands:/);
    assert.doesNotMatch(commands.stdout, /benchmark-suite/);
    const publicCommands = runNodeResult(EOC_BIN, ['commands', '--public'], { cwd: dir });
    assert.equal(publicCommands.code, 0);
    assert.match(publicCommands.stdout, /Public managed commands:/);
    assert.match(publicCommands.stdout, /project-profile/);
    const allCommands = runNodeResult(EOC_BIN, ['commands', '--all'], { cwd: dir });
    assert.equal(allCommands.code, 0);
    assert.match(allCommands.stdout, /All managed commands:/);
    assert.match(allCommands.stdout, /benchmark-suite/);
    const recommendedCommands = runNodeResult(EOC_BIN, ['commands', '--recommended'], { cwd: dir });
    assert.equal(recommendedCommands.code, 0);
    assert.match(recommendedCommands.stdout, /Recommended managed commands:/);
    assert.match(recommendedCommands.stdout, /project-profile/);
    assert.doesNotMatch(recommendedCommands.stdout, /benchmark-suite/);
    const set = runNodeResult(EOC_BIN, ['mode', 'set', 'platform'], { cwd: dir });
    assert.equal(set.code, 0);
    assert.match(set.stdout, /Mode: platform/);
    const get = runNodeResult(EOC_BIN, ['mode'], { cwd: dir });
    assert.equal(get.code, 0);
    assert.match(get.stdout, /Mode: platform/);
  });
});
