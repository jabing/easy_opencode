const DELIVERY_LEVELS = {
  READY_TO_MERGE: 'ready_to_merge',
  MERGE_WITH_FOLLOWUPS: 'merge_with_followups',
  INTERNAL_HANDOFF_ONLY: 'internal_handoff_only',
  BLOCKED: 'blocked',
};

/**
 * @typedef {{ action?: string }} FailureStrategy
 * @typedef {{ status?: string, failure_strategy?: FailureStrategy }} CoderLoopState
 * @typedef {{ merge_posture?: string }} ReviewPolicy
 * @typedef {{ verdict?: string, blockers?: string[], followups?: string[], review_policy?: ReviewPolicy | null }} ReviewGateState
 * @typedef {{ risk_level?: string, strategy_bias?: string, validation_mode?: string }} RiskPostureState
 * @typedef {{ risk_level?: string, strategy_bias?: string, recommended_validation_mode?: string }} BenchmarkFeedbackState
 * @typedef {{ coder_loop?: CoderLoopState, review_gate?: ReviewGateState | null, risk_posture?: RiskPostureState, benchmark_feedback?: BenchmarkFeedbackState | null }} DeliveryAdviceInput
 */

/** @param {DeliveryAdviceInput} [input] */
function deriveDeliveryAdvice(input = {}) {
  const coderLoop = input.coder_loop || {};
  const reviewGate = input.review_gate || null;
  const riskPosture = input.risk_posture || {};
  const benchmarkFeedback = input.benchmark_feedback || null;

  const coderStatus = String(coderLoop.status || 'unknown');
  const reviewVerdict = reviewGate ? String(reviewGate.verdict || '') : '';
  const riskLevel = String(riskPosture.risk_level || (benchmarkFeedback && benchmarkFeedback.risk_level) || 'unknown');
  const strategyBias = String(riskPosture.strategy_bias || (benchmarkFeedback && benchmarkFeedback.strategy_bias) || 'balanced');
  const validationMode = String(riskPosture.validation_mode || (benchmarkFeedback && benchmarkFeedback.recommended_validation_mode) || 'standard');
  /** @type {string[]} */
  const blockers = reviewGate && Array.isArray(reviewGate.blockers) ? reviewGate.blockers : [];
  /** @type {string[]} */
  const followups = reviewGate && Array.isArray(reviewGate.followups) ? reviewGate.followups : [];
  const reviewPolicy = reviewGate && reviewGate.review_policy ? reviewGate.review_policy : null;
  const mergePosture = String((reviewPolicy && reviewPolicy.merge_posture) || 'balanced');

  /** @type {string[]} */
  const reasons = [];
  let level = DELIVERY_LEVELS.INTERNAL_HANDOFF_ONLY;
  let summary = 'Use a teammate handoff until validation and review evidence are complete.';
  let preferredArtifact = 'handoff';
  let mergeReady = false;
  let followupsRequired = false;
  let requiresReviewGate = false;
  let adviceTone = 'cautious';

  if (coderStatus !== 'green') {
    level = DELIVERY_LEVELS.BLOCKED;
    summary = 'Implementation is not green yet; finish the current repair loop before preparing a delivery artifact for merge.';
    reasons.push(`coder-loop status is ${coderStatus}`);
    if (coderLoop.failure_strategy && coderLoop.failure_strategy.action) {
      reasons.push(`current recovery strategy is ${coderLoop.failure_strategy.action}`);
    }
    return {
      level,
      summary,
      preferred_artifact: preferredArtifact,
      merge_ready: mergeReady,
      followups_required: followupsRequired,
      requires_review_gate: true,
      advice_tone: adviceTone,
      reasons,
      suggested_audience: 'internal',
    };
  }

  if (!reviewVerdict) {
    level = DELIVERY_LEVELS.INTERNAL_HANDOFF_ONLY;
    summary = 'Validation is green, but review-gate has not run yet; keep this as an internal handoff until merge evidence exists.';
    reasons.push('review-gate report is missing');
    requiresReviewGate = true;
    return {
      level,
      summary,
      preferred_artifact: preferredArtifact,
      merge_ready: mergeReady,
      followups_required: followupsRequired,
      requires_review_gate: requiresReviewGate,
      advice_tone: adviceTone,
      reasons,
      suggested_audience: 'internal',
    };
  }

  if (reviewVerdict === 'BLOCK' || blockers.length > 0) {
    level = DELIVERY_LEVELS.BLOCKED;
    summary = 'Merge is currently blocked; use a handoff artifact and address blockers before preparing a PR for merge.';
    reasons.push(`review-gate verdict is ${reviewVerdict || 'BLOCK'}`);
    if (blockers.length > 0) reasons.push(`${blockers.length} merge blockers remain`);
    return {
      level,
      summary,
      preferred_artifact: preferredArtifact,
      merge_ready: mergeReady,
      followups_required: followupsRequired,
      requires_review_gate: false,
      advice_tone: adviceTone,
      reasons,
      suggested_audience: 'internal',
    };
  }

  if (reviewVerdict === 'ACCEPT_WITH_FOLLOWUPS') {
    followupsRequired = true;
    reasons.push(`${followups.length} follow-up item(s) remain`);
    if (riskLevel === 'high' || strategyBias === 'conservative' || mergePosture === 'strict') {
      level = DELIVERY_LEVELS.INTERNAL_HANDOFF_ONLY;
      summary = 'This change is reviewable, but the current risk posture still favors internal handoff with explicit follow-up ownership.';
      reasons.push(`risk posture is ${riskLevel}/${strategyBias}`);
      reasons.push(`review posture is ${mergePosture}`);
      adviceTone = 'conservative';
    } else {
      level = DELIVERY_LEVELS.MERGE_WITH_FOLLOWUPS;
      summary = 'Merge is viable if follow-up items are recorded explicitly in the PR and tracked after merge.';
      preferredArtifact = 'pr-body';
      mergeReady = true;
      adviceTone = 'balanced';
    }
    return {
      level,
      summary,
      preferred_artifact: preferredArtifact,
      merge_ready: mergeReady,
      followups_required: followupsRequired,
      requires_review_gate: false,
      advice_tone: adviceTone,
      reasons,
      suggested_audience: mergeReady ? 'merge' : 'internal',
    };
  }

  if (reviewVerdict === 'ACCEPT') {
    if (riskLevel === 'high' && strategyBias === 'conservative' && validationMode !== 'full') {
      level = DELIVERY_LEVELS.INTERNAL_HANDOFF_ONLY;
      summary = 'Review is green, but the benchmark-aware posture still recommends an internal handoff until full validation is complete.';
      reasons.push('high-risk task family is still on a conservative strategy');
      reasons.push(`validation mode is ${validationMode}`);
      adviceTone = 'conservative';
      return {
        level,
        summary,
        preferred_artifact: preferredArtifact,
        merge_ready: mergeReady,
        followups_required: followupsRequired,
        requires_review_gate: false,
        advice_tone: adviceTone,
        reasons,
        suggested_audience: 'internal',
      };
    }

    level = DELIVERY_LEVELS.READY_TO_MERGE;
    summary = 'Implementation, validation, and merge gate are aligned; this change is ready for PR preparation and merge.';
    preferredArtifact = 'pr-body';
    mergeReady = true;
    adviceTone = riskLevel === 'low' && strategyBias === 'accelerated' ? 'confident' : 'balanced';
    reasons.push(`review-gate verdict is ${reviewVerdict}`);
    if (riskLevel !== 'unknown') reasons.push(`risk posture is ${riskLevel}/${strategyBias}`);
    return {
      level,
      summary,
      preferred_artifact: preferredArtifact,
      merge_ready: mergeReady,
      followups_required: followupsRequired,
      requires_review_gate: false,
      advice_tone: adviceTone,
      reasons,
      suggested_audience: 'merge',
    };
  }

  reasons.push(`review-gate verdict is ${reviewVerdict}`);
  return {
    level,
    summary,
    preferred_artifact: preferredArtifact,
    merge_ready: mergeReady,
    followups_required: followupsRequired,
    requires_review_gate: false,
    advice_tone: adviceTone,
    reasons,
    suggested_audience: 'internal',
  };
}

module.exports = {
  DELIVERY_LEVELS,
  deriveDeliveryAdvice,
};
