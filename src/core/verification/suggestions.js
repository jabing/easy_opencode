const DEFAULT_KIND_ORDER = ['typecheck', 'lint', 'test', 'build'];

/** @typedef {'typecheck' | 'lint' | 'test' | 'build'} VerifyKind */
/** @typedef {{ runtime?: string, validation_by_kind?: Partial<Record<VerifyKind, string>> | null }} VerifyProfile */

/** @param {unknown} value @returns {string[]} */
function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

/** @param {unknown} command @param {string} runtime */
function matchesRuntime(command, runtime) {
  const text = String(command || '').trim().toLowerCase();
  if (!text || !runtime || runtime === 'unknown') return true;
  if (runtime === 'node') return /(^|\s)(npm|pnpm|yarn|bun|npx|node)\b/.test(text);
  if (runtime === 'python') return /(python|pytest|pyright|mypy|ruff|flake8|pylint|manage\.py|poetry|pipenv|uv)\b/.test(text);
  if (runtime === 'go') return /(^|\s)(go|golangci-lint)\b/.test(text);
  if (runtime === 'java') return /(gradle|gradlew|mvn|mvnw|java|javac)\b/.test(text);
  return true;
}

/** @param {unknown} command @returns {VerifyKind | null} */
function inferKind(command) {
  const text = String(command || '').trim().toLowerCase();
  if (!text) return null;
  if (/(^|\s)(tsc|vue-tsc|mypy|pyright)\b|\btypecheck\b/.test(text)) return 'typecheck';
  if (/golangci-lint|ruff check|flake8|pylint|eslint|biome check|\blint\b|\bxo\b/.test(text)) return 'lint';
  if (/pytest|unittest|vitest|jest|playwright|mocha|ava|\bgo test\b|\b test\b/.test(text)) return 'test';
  if (/next build|nuxi build|manage\.py check|compileall|compilejava|\bbuild\b|\bcheck\b/.test(text)) return 'build';
  return null;
}

/** @param {unknown} values */
function unique(values) {
  return Array.from(new Set(normalizeList(values)));
}

/** @param {unknown} verify @param {VerifyProfile | null | undefined} profile @param {string} [runtime] */
function buildVerifySuggestions(verify, profile, runtime) {
  const selectedRuntime = String(runtime || profile?.runtime || 'unknown');
  const validationByKind = profile && profile.validation_by_kind ? profile.validation_by_kind : {};
  /** @type {string[]} */
  const bucket = [];
  /** @type {Set<VerifyKind>} */
  const seenKinds = new Set();

  for (const step of normalizeList(verify)) {
    if (!matchesRuntime(step, selectedRuntime)) continue;
    const kind = inferKind(step);
    const replacement = kind && validationByKind[kind] ? String(validationByKind[kind]).trim() : String(step).trim();
    if (!replacement) continue;
    if (kind) {
      if (seenKinds.has(kind)) continue;
      seenKinds.add(kind);
    }
    bucket.push(replacement);
  }

  for (const kind of DEFAULT_KIND_ORDER) {
    if (seenKinds.has(/** @type {VerifyKind} */ (kind))) continue;
    const command = validationByKind[/** @type {VerifyKind} */ (kind)];
    if (!command) continue;
    bucket.push(String(command).trim());
  }

  return unique(bucket);
}

module.exports = {
  DEFAULT_KIND_ORDER,
  buildVerifySuggestions,
  inferKind,
  matchesRuntime,
};
