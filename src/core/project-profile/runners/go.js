const fs = require('fs');
const path = require('path');

/** @typedef {import('../../../shared/domain.js').ProjectProfileResult} ProjectProfileResult */
/** @typedef {import('../../../shared/domain.js').ValidationCommand} ValidationCommand */

/** @param {string} root @param {string} rel */
function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

/** @param {string} filePath */
function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** @param {string} goMod */
function detectFramework(goMod) {
  const text = String(goMod || '').toLowerCase();
  if (text.includes('github.com/gin-gonic/gin')) return 'gin';
  if (text.includes('github.com/labstack/echo')) return 'echo';
  if (text.includes('github.com/gofiber/fiber')) return 'fiber';
  if (text.includes('github.com/go-chi/chi')) return 'chi';
  return 'go';
}

/** @param {string} root */
function listEntrypoints(root) {
  /** @type {string[]} */
  const candidates = [];
  /** @param {string} rel */
  const pushIfExists = (rel) => {
    if (exists(root, rel)) candidates.push(rel);
  };
  pushIfExists('main.go');
  if (exists(root, 'cmd')) {
    for (const name of fs.readdirSync(path.join(root, 'cmd'))) {
      pushIfExists(path.join('cmd', name, 'main.go'));
    }
  }
  return Array.from(new Set(candidates)).slice(0, 8).map((rel) => rel.replace(/\\/g, '/'));
}

/** @param {string} root @returns {ProjectProfileResult | null} */
function detect(root) {
  if (!exists(root, 'go.mod')) return null;
  const goMod = readText(path.join(root, 'go.mod'));
  const framework = detectFramework(goMod);
  /** @type {ValidationCommand[]} */
  const commands = [
    { kind: 'build', command: 'go build ./...', source: 'go.mod' },
    { kind: 'test', command: 'go test ./...', source: 'go.mod' },
  ];
  /** @type {string | null} */
  let lintTool = null;
  if (exists(root, '.golangci.yml') || exists(root, '.golangci.yaml') || exists(root, '.golangci.toml')) {
    commands.push({ kind: 'lint', command: 'golangci-lint run', source: 'golangci' });
    lintTool = 'golangci-lint';
  }
  const moduleMatch = goMod.match(/^module\s+(.+)$/m);
  const modulePath = moduleMatch && typeof moduleMatch[1] === 'string' ? moduleMatch[1] : null;
  return {
    runtime: 'go',
    language: 'go',
    framework,
    package_manager: 'go',
    package_name: path.basename(root),
    validation: commands,
    detected_by: exists(root, 'go.work') ? 'go.work' : 'go.mod',
    build_tool: 'go build',
    test_runner: 'go-test',
    lint_tool: lintTool,
    typecheck_tool: 'go-build',
    format_tool: 'gofmt',
    app_type: framework === 'go' ? 'library-or-service' : 'backend-service',
    repo_shape: exists(root, 'go.work') ? 'workspace' : 'single-module',
    workspace: { is_workspace: exists(root, 'go.work'), tool: exists(root, 'go.work') ? 'go-work' : null },
    entrypoints: listEntrypoints(root),
    config_files: ['go.mod', 'go.work', '.golangci.yml', '.golangci.yaml', '.golangci.toml'].filter((rel) => exists(root, rel)),
    signals: {
      has_cmd_dir: exists(root, 'cmd'),
      module_path: modulePath,
    },
    confidence: lintTool ? 0.9 : 0.8,
  };
}

module.exports = {
  id: 'go',
  detect,
};
