/** @typedef {'created' | 'planning' | 'executing' | 'verifying' | 'reviewing' | 'blocked' | 'failed' | 'succeeded' | 'cancelled'} RunStatus */

const RUN_STATUS = Object.freeze({
  CREATED: 'created',
  PLANNING: 'planning',
  EXECUTING: 'executing',
  VERIFYING: 'verifying',
  REVIEWING: 'reviewing',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  SUCCEEDED: 'succeeded',
  CANCELLED: 'cancelled',
});

const STEP_STATUS = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  RUNNING: 'running',
  RETRYING: 'retrying',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
});

/** @type {Readonly<Record<RunStatus, RunStatus[]>>} */
const ALLOWED_RUN_TRANSITIONS = Object.freeze({
  [RUN_STATUS.CREATED]: [RUN_STATUS.PLANNING, RUN_STATUS.EXECUTING, RUN_STATUS.VERIFYING, RUN_STATUS.REVIEWING, RUN_STATUS.BLOCKED, RUN_STATUS.FAILED, RUN_STATUS.SUCCEEDED, RUN_STATUS.CANCELLED],
  [RUN_STATUS.PLANNING]: [RUN_STATUS.EXECUTING, RUN_STATUS.BLOCKED, RUN_STATUS.FAILED, RUN_STATUS.CANCELLED],
  [RUN_STATUS.EXECUTING]: [RUN_STATUS.VERIFYING, RUN_STATUS.REVIEWING, RUN_STATUS.BLOCKED, RUN_STATUS.FAILED, RUN_STATUS.SUCCEEDED, RUN_STATUS.CANCELLED],
  [RUN_STATUS.VERIFYING]: [RUN_STATUS.REVIEWING, RUN_STATUS.BLOCKED, RUN_STATUS.FAILED, RUN_STATUS.SUCCEEDED, RUN_STATUS.CANCELLED],
  [RUN_STATUS.REVIEWING]: [RUN_STATUS.BLOCKED, RUN_STATUS.FAILED, RUN_STATUS.SUCCEEDED, RUN_STATUS.CANCELLED],
  [RUN_STATUS.BLOCKED]: [RUN_STATUS.PLANNING, RUN_STATUS.EXECUTING, RUN_STATUS.VERIFYING, RUN_STATUS.REVIEWING, RUN_STATUS.FAILED, RUN_STATUS.CANCELLED],
  [RUN_STATUS.FAILED]: [],
  [RUN_STATUS.SUCCEEDED]: [],
  [RUN_STATUS.CANCELLED]: [],
});

/** @param {RunStatus | string | null | undefined} from @param {RunStatus | string | null | undefined} to */
function canTransitionRunStatus(from, to) {
  if (!from || from === to) return true;
  const allowed = ALLOWED_RUN_TRANSITIONS[/** @type {RunStatus} */ (from)] || [];
  return allowed.includes(/** @type {RunStatus} */ (to));
}

/** @param {RunStatus | string | null | undefined} from @param {RunStatus | string | null | undefined} to */
function assertRunTransition(from, to) {
  if (!canTransitionRunStatus(from, to)) {
    throw new Error(`invalid run status transition: ${from || '<none>'} -> ${to}`);
  }
}

/** @param {RunStatus | string | null | undefined} status @returns {RunStatus} */
function mapImplementationStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'initialized':
      return RUN_STATUS.CREATED;
    case 'running':
    case 'in_progress':
    case 'yellow':
      return RUN_STATUS.EXECUTING;
    case 'green':
    case 'success':
      return RUN_STATUS.SUCCEEDED;
    case 'red':
    case 'failed':
      return RUN_STATUS.FAILED;
    case 'blocked':
      return RUN_STATUS.BLOCKED;
    default:
      return RUN_STATUS.EXECUTING;
  }
}

/** @param {RunStatus | string | null | undefined} status @returns {RunStatus} */
function mapGateStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'initialized':
      return RUN_STATUS.CREATED;
    case 'collecting':
    case 'running':
    case 'executing':
      return RUN_STATUS.EXECUTING;
    case 'verifying':
      return RUN_STATUS.VERIFYING;
    case 'reviewing':
      return RUN_STATUS.REVIEWING;
    case 'passed':
    case 'success':
      return RUN_STATUS.SUCCEEDED;
    case 'blocked':
      return RUN_STATUS.BLOCKED;
    case 'failed':
      return RUN_STATUS.FAILED;
    default:
      return RUN_STATUS.EXECUTING;
  }
}

module.exports = {
  RUN_STATUS,
  STEP_STATUS,
  canTransitionRunStatus,
  assertRunTransition,
  mapImplementationStatus,
  mapGateStatus,
};
