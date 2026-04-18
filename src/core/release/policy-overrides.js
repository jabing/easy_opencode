const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { appendEvent } = require('../../control-plane/observability/index.js');
const { resolveReleasePolicy } = require('./policy.js');

/** @param {string} dir */
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }
/** @param {unknown} value @param {string} [fallback] */
function sanitizeToken(value, fallback = 'item') {
  const raw = String(value || fallback).trim().toLowerCase();
  return raw.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}
/** @param {string} rootDir */
function resolveOverrideDir(rootDir) { return path.join(path.resolve(rootDir || process.cwd()), '.opencode', 'observability', 'release-overrides'); }
/** @param {string} rootDir @param {string} id */
function resolveOverrideFile(rootDir, id) { return path.join(resolveOverrideDir(rootDir), `${sanitizeToken(id, 'override')}.json`); }
/** @param {string} filePath */
function tryReadJson(filePath) { try { if (!fs.existsSync(filePath)) return null; return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; } }
/** @param {unknown} value */
function normalizeCheckList(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(items.map((item) => String(item || '').trim()).filter(Boolean))).sort();
}
/** @param {string} rootDir */
function listPolicyOverrides(rootDir) {
  const dir = resolveOverrideDir(rootDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => tryReadJson(path.join(dir, entry.name)))
    .filter(Boolean)
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
}
/** @param {string} rootDir @param {string} id */
function readPolicyOverride(rootDir, id) { if (!id) return null; return tryReadJson(resolveOverrideFile(rootDir, id)); }
/** @param {string} rootDir @param {any} record */
function writePolicyOverride(rootDir, record) {
  const filePath = resolveOverrideFile(rootDir, record.override_id);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2) + '\n', 'utf8');
  return filePath;
}
/** @param {unknown} policy */
function getOverridePolicyConfig(policy) {
  const resolved = resolveReleasePolicy(policy || 'standard');
  return {
    id: resolved.id,
    label: resolved.label,
    settings: {
      require_reason: Boolean(resolved.override && resolved.override.require_reason),
      minimum_reason_length: Number((resolved.override && resolved.override.minimum_reason_length) || 0),
      require_expiry: Boolean(resolved.override && resolved.override.require_expiry),
      max_duration_hours: Number((resolved.override && resolved.override.max_duration_hours) || 0),
      max_usage_count: Number((resolved.override && resolved.override.max_usage_count) || 0),
      disallowed_checks: normalizeCheckList(resolved.override && resolved.override.disallowed_checks),
    },
  };
}
/** @param {any} policyConfig @param {any} [options] */
function validateOverrideRequest(policyConfig, options = {}) {
  const reasons = [];
  const reason = String(options.reason || '').trim();
  const allowedChecks = normalizeCheckList(options.checks || options.allowed_checks);
  const expiryValue = options.expires_at || options.expiresAt || null;
  const now = options.now ? new Date(options.now) : new Date();
  const expiresAt = expiryValue ? new Date(expiryValue) : null;
  if (policyConfig.settings.require_reason && reason.length < policyConfig.settings.minimum_reason_length) reasons.push(`reason must be at least ${policyConfig.settings.minimum_reason_length} characters`);
  if (allowedChecks.length === 0) reasons.push('allowed checks cannot be empty');
  if (policyConfig.settings.require_expiry && !expiryValue) reasons.push('expires_at is required for this release policy');
  if (expiresAt && Number.isNaN(expiresAt.getTime())) reasons.push('expires_at must be a valid ISO timestamp');
  if (expiresAt && expiresAt.getTime() <= now.getTime()) reasons.push('expires_at must be in the future');
  if (expiresAt && policyConfig.settings.max_duration_hours > 0) {
    const maxDurationMs = policyConfig.settings.max_duration_hours * 60 * 60 * 1000;
    if ((expiresAt.getTime() - now.getTime()) > maxDurationMs) reasons.push(`expires_at exceeds max duration of ${policyConfig.settings.max_duration_hours} hours for policy=${policyConfig.id}`);
  }
  return { valid: reasons.length === 0, reasons, reason, allowed_checks: allowedChecks, expires_at: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null };
}
/** @param {string} rootDir @param {any} [options] */
function requestPolicyOverride(rootDir, options = {}) {
  const stamp = options.now ? new Date(options.now).toISOString() : nowIso();
  const overrideId = options.override_id ? sanitizeToken(options.override_id, 'override') : `ovr-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const policy = getOverridePolicyConfig(options.policy || 'standard');
  const validation = validateOverrideRequest(policy, options);
  if (!validation.valid) throw new Error(validation.reasons.join('; '));
  const record = {
    schema_version: '1.1',
    override_id: overrideId,
    status: 'pending',
    created_at: stamp,
    updated_at: stamp,
    requested_by: String(options.requested_by || options.by || 'release-manager'),
    policy: { id: policy.id, label: policy.label, override: policy.settings },
    reason: validation.reason || 'manual release override',
    allowed_checks: validation.allowed_checks,
    expires_at: validation.expires_at,
    note: options.note ? String(options.note) : null,
    approvals: [],
    usage: [],
    constraints: {
      max_usage_count: policy.settings.max_usage_count,
      minimum_reason_length: policy.settings.minimum_reason_length,
      max_duration_hours: policy.settings.max_duration_hours,
      disallowed_checks: policy.settings.disallowed_checks,
    },
  };
  writePolicyOverride(rootDir, record);
  appendEvent(rootDir, 'release.override.requested', { flow: 'release', status: record.status, override_id: overrideId, policy: policy.id, expires_at: record.expires_at, allowed_checks: record.allowed_checks });
  return record;
}
/** @param {string} rootDir @param {string} id @param {any} [options] */
function approvePolicyOverride(rootDir, id, options = {}) {
  const current = readPolicyOverride(rootDir, id);
  if (!current) throw new Error(`release override not found: ${id}`);
  const stamp = options.now ? new Date(options.now).toISOString() : (current.created_at || nowIso());
  const approval = { at: stamp, approver: String(options.approver || options.by || 'release-manager'), note: options.note ? String(options.note) : null };
  const updated = { ...current, status: 'approved', updated_at: stamp, approved_at: stamp, approvals: [...(Array.isArray(current.approvals) ? current.approvals : []), approval] };
  writePolicyOverride(rootDir, updated);
  appendEvent(rootDir, 'release.override.approved', { flow: 'release', status: updated.status, override_id: updated.override_id, policy: updated.policy && updated.policy.id });
  return updated;
}
/** @param {string} rootDir @param {string} id @param {any} [options] */
function revokePolicyOverride(rootDir, id, options = {}) {
  const current = readPolicyOverride(rootDir, id);
  if (!current) throw new Error(`release override not found: ${id}`);
  const stamp = nowIso();
  const updated = { ...current, status: 'revoked', updated_at: stamp, revoked_at: stamp, revoked_by: String(options.approver || options.by || 'release-manager'), revoke_note: options.note ? String(options.note) : null };
  writePolicyOverride(rootDir, updated);
  appendEvent(rootDir, 'release.override.revoked', { flow: 'release', status: updated.status, override_id: updated.override_id, policy: updated.policy && updated.policy.id });
  return updated;
}
/** @param {string} rootDir @param {string} id @param {any} [options] */
function resolvePolicyOverride(rootDir, id, options = {}) {
  const record = readPolicyOverride(rootDir, id);
  if (!record) return { status: 'missing', ready: false, override_id: id || null, reason: 'release override not found' };
  const policyConfig = getOverridePolicyConfig(options.policy || (record.policy && record.policy.id) || 'standard');
  const now = options.now ? new Date(options.now) : (record.approved_at ? new Date(record.approved_at) : new Date());
  const expiresAt = record.expires_at ? new Date(record.expires_at) : null;
  const usageCount = Array.isArray(record.usage) ? record.usage.length : 0;
  const maxUsageCount = Number((record.constraints && record.constraints.max_usage_count) || policyConfig.settings.max_usage_count || 0);
  if (record.status !== 'approved') return { ...record, ready: false, reason: `release override is ${record.status}`, status: record.status || 'pending' };
  if (record.policy && record.policy.id && record.policy.id !== policyConfig.id) return { ...record, ready: false, status: 'policy_mismatch', reason: `release override targets policy=${record.policy.id}, not ${policyConfig.id}` };
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime()) return { ...record, ready: false, status: 'expired', reason: `release override expired at ${record.expires_at}` };
  if (maxUsageCount > 0 && usageCount >= maxUsageCount) return { ...record, ready: false, status: 'exhausted', reason: `release override exhausted its ${maxUsageCount} allowed use(s)` };
  return { ...record, ready: true, status: 'approved', reason: 'release override is approved and active' };
}
/** @param {string} rootDir @param {string} id @param {any} [usage] */
function recordOverrideUsage(rootDir, id, usage = {}) {
  const current = readPolicyOverride(rootDir, id);
  if (!current) return null;
  const stamp = nowIso();
  const entry = {
    at: stamp,
    decision_before: usage.decision_before || null,
    decision_after: usage.decision_after || null,
    matched_checks: normalizeCheckList(usage.matched_checks),
    release_checks: normalizeCheckList(usage.release_checks),
    blocked_checks: normalizeCheckList(usage.blocked_checks),
    note: usage.note ? String(usage.note) : null,
  };
  const updated = { ...current, updated_at: stamp, last_used_at: stamp, usage: [...(Array.isArray(current.usage) ? current.usage : []), entry] };
  writePolicyOverride(rootDir, updated);
  appendEvent(rootDir, 'release.override.used', { flow: 'release', status: usage.decision_after || 'ready_with_override', override_id: id, matched_checks: entry.matched_checks, blocked_checks: entry.blocked_checks });
  return updated;
}
/** @param {any} record @param {Array<{ check: string, status: string }>} checks */
function matchOverrideToChecks(record, checks) {
  const allowed = normalizeCheckList(record && record.allowed_checks);
  const disallowed = normalizeCheckList((record && record.constraints && record.constraints.disallowed_checks) || (record && record.policy && record.policy.override && record.policy.override.disallowed_checks));
  const nonPassChecks = (checks || []).filter((item) => item.status === 'fail' || item.status === 'warn').map((item) => item.check);
  if (allowed.length === 0) return { covers_all: false, matched_checks: [], missing_checks: nonPassChecks, blocked_checks: [], allowed_checks: allowed, disallowed_checks: disallowed };
  const matchedChecks = nonPassChecks.filter((check) => allowed.includes(check));
  const missingChecks = nonPassChecks.filter((check) => !allowed.includes(check));
  const blockedChecks = matchedChecks.filter((check) => disallowed.includes(check));
  return {
    covers_all: missingChecks.length === 0 && nonPassChecks.length > 0 && blockedChecks.length === 0,
    matched_checks: matchedChecks,
    missing_checks: missingChecks,
    blocked_checks: blockedChecks,
    allowed_checks: allowed,
    disallowed_checks: disallowed,
  };
}
module.exports = { approvePolicyOverride, getOverridePolicyConfig, listPolicyOverrides, matchOverrideToChecks, readPolicyOverride, recordOverrideUsage, requestPolicyOverride, resolveOverrideDir, resolveOverrideFile, resolvePolicyOverride, revokePolicyOverride, validateOverrideRequest };
