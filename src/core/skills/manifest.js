const fs = require('fs');
const path = require('path');

/** @typedef {{ scripts: boolean, data: boolean, templates: boolean }} SkillAssets */
/** @typedef {{ when?: { runtime?: string | string[] }, type?: string }} SkillAction */
/** @typedef {{
 * level?: string,
 * actions?: SkillAction[],
 * verify?: string | string[],
 * triggers?: string | string[],
 * languages?: string | string[],
 * frameworks?: string | string[],
 * support_tier?: string,
 * supportTier?: string,
 * task_family?: string,
 * taskFamily?: string,
 * name?: string,
 * description?: string,
 * origin?: string,
 * version?: string,
 * [key: string]: unknown,
 * }} SkillManifest
 */
/** @typedef {{ repository: string, commit: string, license: string, sync_date: string }} UpstreamMetadata */
/** @typedef {{
 * dir: string,
 * name: string,
 * description: string,
 * origin: string,
 * version: string,
 * level: string,
 * executable: boolean,
 * support_tier: string,
 * support_scope: { runtimes: string[], languages: string[], frameworks: string[] },
 * runtimes: string[],
 * languages: string[],
 * frameworks: string[],
 * triggers: string[],
 * task_family: string | null,
 * actions: SkillAction[],
 * verify: string[],
 * assets: SkillAssets,
 * upstream: UpstreamMetadata | null,
 * files: { skill: string, manifest: string | null },
 * manifest: SkillManifest,
 * base: string,
 * }} SkillRecord
 */

/** @param {unknown} content @returns {Record<string, string>} */
function parseFrontmatter(content) {
  const normalized = String(content || '').replace(/^\uFEFF/, '');
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*/);
  if (!match) return {};
  /** @type {Record<string, string>} */
  const out = {};
  const frontmatter = match[1] || '';
  for (const line of frontmatter.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.+)\s*$/);
    if (!kv || !kv[1] || !kv[2]) continue;
    out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/** @param {string} filePath @returns {SkillManifest | Record<string, unknown> | null} */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {string} upstreamPath @returns {UpstreamMetadata | null} */
function parseUpstream(upstreamPath) {
  if (!fs.existsSync(upstreamPath)) return null;
  const text = fs.readFileSync(upstreamPath, 'utf8');
  const repo = (text.match(/Repository:\s*`?([^\r\n`]+)`?/i) || [])[1] || '';
  const commit = (text.match(/(Synced Commit|Commit):\s*`?([0-9a-f]{7,40})`?/i) || [])[2] || '';
  const license = (text.match(/License:\s*`?([^\r\n`]+)`?/i) || [])[1] || '';
  const syncDate = (text.match(/(Sync Date|Date):\s*`?([0-9-]{8,})`?/i) || [])[2] || '';
  return { repository: repo, commit, license, sync_date: syncDate };
}

/** @param {SkillManifest | null | undefined} manifest @param {SkillAssets} assets */
function inferLevel(manifest, assets) {
  if (manifest && manifest.level) return String(manifest.level).trim();
  if (manifest && Array.isArray(manifest.actions) && manifest.actions.length > 0) return 'L3';
  if (assets.scripts || assets.templates || assets.data) return 'L2';
  return 'L1';
}


/** @param {SkillAction[] | null | undefined} actions */
function extractSupportedRuntimes(actions) {
  if (!Array.isArray(actions)) return [];
  /** @type {string[]} */
  const runtimes = [];
  for (const action of actions) {
    const when = action && action.when && action.when.runtime;
    const values = Array.isArray(when) ? when : (when ? [when] : []);
    for (const value of values) {
      const normalized = String(value || '').trim();
      if (normalized && !runtimes.includes(normalized)) runtimes.push(normalized);
    }
  }
  return runtimes;
}

/** @param {SkillManifest | null | undefined} manifest @param {SkillAssets} assets @param {SkillAction[] | null | undefined} actions */
function inferSupportTier(manifest, assets, actions) {
  const explicit = String((manifest && (manifest.support_tier || manifest.supportTier)) || '').trim().toLowerCase();
  if (['tier1', 'tier2', 'tier3', 'tier4'].includes(explicit)) return explicit;
  const actionList = Array.isArray(actions) ? actions : [];
  if (actionList.some((action) => String(action && action.type || '').trim() === 'feature_bundle')) return 'tier1';
  if (actionList.length > 0) return 'tier2';
  if (assets && (assets.scripts || assets.templates || assets.data)) return 'tier3';
  return 'tier4';
}

/** @param {SkillAction[] | null | undefined} actions @param {string | string[] | null | undefined} languages @param {string | string[] | null | undefined} frameworks */
function buildSupportScope(actions, languages, frameworks) {
  return {
    runtimes: extractSupportedRuntimes(actions),
    languages: normalizeList(languages),
    frameworks: normalizeList(frameworks),
  };
}

/** @param {string | string[] | null | undefined} value @returns {string[]} */
function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** @param {string} skillsDir */
function listSkillDirs(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

/** @param {string} root @param {string} dir @returns {SkillRecord | null} */
function readSkill(root, dir) {
  const base = path.join(root, 'skills', dir);
  const skillPath = path.join(base, 'SKILL.md');
  const manifestPath = path.join(base, 'manifest.json');
  if (!fs.existsSync(skillPath)) return null;

  const skillText = fs.readFileSync(skillPath, 'utf8');
  const fm = parseFrontmatter(skillText);
  const manifest = /** @type {SkillManifest} */ (readJson(manifestPath) || {});
  const assets = {
    scripts: fs.existsSync(path.join(base, 'scripts')),
    data: fs.existsSync(path.join(base, 'data')),
    templates: fs.existsSync(path.join(base, 'templates')),
  };
  const level = inferLevel(manifest, assets);
  const actions = Array.isArray(manifest.actions) ? manifest.actions : [];
  const verify = normalizeList(manifest.verify);
  const triggers = normalizeList(manifest.triggers);
  const languages = normalizeList(manifest.languages);
  const frameworks = normalizeList(manifest.frameworks);
  const runtimes = extractSupportedRuntimes(actions);
  const supportTier = inferSupportTier(manifest, assets, actions);
  const supportScope = buildSupportScope(actions, languages, frameworks);
  const executable = level === 'L3' || actions.length > 0;
  const upstream = parseUpstream(path.join(base, 'UPSTREAM.md'));
  const taskFamily = String(manifest.task_family || manifest.taskFamily || '').trim();

  return {
    dir,
    name: String(manifest.name || fm.name || dir).trim(),
    description: String(manifest.description || fm.description || '').trim(),
    origin: String(manifest.origin || fm.origin || '').trim(),
    version: String(manifest.version || fm.version || '').trim(),
    level,
    executable,
    support_tier: supportTier,
    support_scope: supportScope,
    runtimes,
    languages,
    frameworks,
    triggers,
    task_family: taskFamily || null,
    actions,
    verify,
    assets,
    upstream,
    files: {
      skill: path.relative(root, skillPath).replace(/\\/g, '/'),
      manifest: fs.existsSync(manifestPath) ? path.relative(root, manifestPath).replace(/\\/g, '/') : null,
    },
    manifest,
    base,
  };
}

/** @param {string} root @returns {SkillRecord[]} */
function readAllSkills(root) {
  const skillsDir = path.join(root, 'skills');
  return listSkillDirs(skillsDir)
    .map((dir) => readSkill(root, dir))
    .filter((skill) => skill !== null);
}

/** @param {string} root @param {string} name @returns {SkillRecord | null} */
function resolveSkill(root, name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return null;
  const skills = readAllSkills(root);
  return (
    skills.find((skill) => skill.name.toLowerCase() === normalized) ||
    skills.find((skill) => skill.dir.toLowerCase() === normalized) ||
    null
  );
}

module.exports = {
  buildSupportScope,
  extractSupportedRuntimes,
  inferLevel,
  inferSupportTier,
  listSkillDirs,
  normalizeList,
  parseFrontmatter,
  parseUpstream,
  readAllSkills,
  readJson,
  readSkill,
  resolveSkill,
};
