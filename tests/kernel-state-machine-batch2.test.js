const test = require('node:test');
const assert = require('node:assert/strict');
const { canTransitionRunStatus, RUN_STATUS } = require('../src/control-plane/kernel/state-machine.js');

test('kernel run state machine allows direct completion from created for short-lived runs', () => {
  assert.equal(canTransitionRunStatus(RUN_STATUS.CREATED, RUN_STATUS.SUCCEEDED), true);
  assert.equal(canTransitionRunStatus(RUN_STATUS.CREATED, RUN_STATUS.FAILED), true);
  assert.equal(canTransitionRunStatus(RUN_STATUS.CREATED, RUN_STATUS.BLOCKED), true);
});
