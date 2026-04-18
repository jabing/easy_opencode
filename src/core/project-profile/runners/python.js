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

/** @param {string} root @param {string} blob */
function detectPackageManager(root, blob) {
  const text = String(blob || '').toLowerCase();
  if (exists(root, 'uv.lock') || text.includes('[tool.uv')) return 'uv';
  if (exists(root, 'poetry.lock') || text.includes('[tool.poetry')) return 'poetry';
  if (exists(root, 'Pipfile')) return 'pipenv';
  return 'pip';
}

/** @param {string} manager @param {string} command */
function prefixed(manager, command) {
  if (manager === 'poetry') return `poetry run ${command}`;
  if (manager === 'pipenv') return `pipenv run ${command}`;
  if (manager === 'uv') return `uv run ${command}`;
  return command;
}

/** @param {string} root @param {string} text */
function detectFramework(root, text) {
  const blob = String(text || '').toLowerCase();
  if (exists(root, 'manage.py') || blob.includes('django')) return 'django';
  if (blob.includes('fastapi')) return 'fastapi';
  if (blob.includes('flask')) return 'flask';
  return 'python';
}

/** @param {string} root @param {string} blob */
function detectTestRunner(root, blob) {
  const text = String(blob || '').toLowerCase();
  if (exists(root, 'pytest.ini') || exists(root, 'tests') || text.includes('pytest')) return 'pytest';
  if (text.includes('unittest')) return 'unittest';
  return null;
}

/** @param {string} blob */
function detectLintTool(blob) {
  const text = String(blob || '').toLowerCase();
  if (text.includes('ruff')) return 'ruff';
  if (text.includes('flake8')) return 'flake8';
  if (text.includes('pylint')) return 'pylint';
  return null;
}

/** @param {string} blob */
function detectTypecheckTool(blob) {
  const text = String(blob || '').toLowerCase();
  if (text.includes('pyright')) return 'pyright';
  if (text.includes('mypy') || text.includes('[tool.mypy')) return 'mypy';
  return null;
}

/** @param {string} blob */
function detectFormatTool(blob) {
  const text = String(blob || '').toLowerCase();
  if (text.includes('ruff format')) return 'ruff-format';
  if (text.includes('ruff')) return 'ruff-format';
  if (text.includes('black')) return 'black';
  return null;
}

/** @param {string} root */
function detectRepoShape(root) {
  if (exists(root, 'apps') || exists(root, 'services')) return 'multi-package';
  if (exists(root, 'src')) return 'src-layout';
  return 'flat-package';
}

/** @param {string} root @param {string} framework */
function listEntrypoints(root, framework) {
  /** @type {string[]} */
  const candidates = [];
  /** @param {string} rel */
  const pushIfExists = (rel) => {
    if (exists(root, rel)) candidates.push(rel);
  };
  if (framework === 'django') {
    pushIfExists('manage.py');
    pushIfExists('config/settings.py');
  }
  if (framework === 'fastapi') {
    pushIfExists('app/main.py');
    pushIfExists('main.py');
    pushIfExists('src/main.py');
  }
  if (framework === 'flask') {
    pushIfExists('app.py');
    pushIfExists('wsgi.py');
  }
  return Array.from(new Set(candidates)).slice(0, 8);
}

/** @param {string} root @param {string} manager @param {string} framework @param {string} _blob @param {string | null} testRunner @param {string | null} lintTool @param {string | null} typecheckTool @returns {ValidationCommand[]} */
function buildValidationCommands(root, manager, framework, _blob, testRunner, lintTool, typecheckTool) {
  /** @type {ValidationCommand[]} */
  const commands = [];
  if (typecheckTool === 'mypy') {
    commands.push({ kind: 'typecheck', command: prefixed(manager, 'python -m mypy .'), source: 'detected:mypy' });
  } else if (typecheckTool === 'pyright') {
    commands.push({ kind: 'typecheck', command: prefixed(manager, 'pyright'), source: 'detected:pyright' });
  }

  if (lintTool === 'ruff') {
    commands.push({ kind: 'lint', command: prefixed(manager, 'python -m ruff check .'), source: 'detected:ruff' });
  } else if (lintTool === 'flake8') {
    commands.push({ kind: 'lint', command: prefixed(manager, 'python -m flake8 .'), source: 'detected:flake8' });
  } else if (lintTool === 'pylint') {
    commands.push({ kind: 'lint', command: prefixed(manager, 'python -m pylint .'), source: 'detected:pylint' });
  }

  if (testRunner === 'pytest') {
    commands.push({ kind: 'test', command: prefixed(manager, 'python -m pytest -q'), source: 'detected:pytest' });
  } else if (testRunner === 'unittest') {
    commands.push({ kind: 'test', command: prefixed(manager, 'python -m unittest discover'), source: 'detected:unittest' });
  }

  if (framework === 'django') {
    commands.push({ kind: 'build', command: prefixed(manager, 'python manage.py check'), source: 'detected:django' });
  } else {
    commands.push({ kind: 'build', command: prefixed(manager, 'python -m compileall .'), source: 'fallback:compileall' });
  }
  return commands;
}

/** @param {string} root @returns {ProjectProfileResult | null} */
function detect(root) {
  const markers = ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'];
  const marker = markers.find((rel) => exists(root, rel));
  if (!marker) return null;
  const pyproject = readText(path.join(root, 'pyproject.toml'));
  const requirements = readText(path.join(root, 'requirements.txt'));
  const setupCfg = readText(path.join(root, 'setup.cfg'));
  const setupPy = readText(path.join(root, 'setup.py'));
  const blob = [pyproject, requirements, setupCfg, setupPy].join('\n').toLowerCase();
  const framework = detectFramework(root, blob);
  const packageManager = detectPackageManager(root, blob);
  const testRunner = detectTestRunner(root, blob);
  const lintTool = detectLintTool(blob);
  const typecheckTool = detectTypecheckTool(blob);
  const formatTool = detectFormatTool(blob);
  const validation = buildValidationCommands(root, packageManager, framework, blob, testRunner, lintTool, typecheckTool);

  return {
    runtime: 'python',
    language: 'python',
    framework,
    package_manager: packageManager,
    package_name: path.basename(root),
    validation,
    detected_by: marker,
    build_tool: framework === 'django' ? 'manage.py check' : 'compileall',
    test_runner: testRunner,
    lint_tool: lintTool,
    typecheck_tool: typecheckTool,
    format_tool: formatTool,
    app_type: framework === 'django' || framework === 'fastapi' || framework === 'flask' ? 'backend-service' : 'library-or-service',
    repo_shape: detectRepoShape(root),
    workspace: { is_workspace: exists(root, 'uv.lock') && blob.includes('[tool.uv.workspace'), tool: exists(root, 'uv.lock') && blob.includes('[tool.uv.workspace') ? 'uv-workspace' : null },
    entrypoints: listEntrypoints(root, framework),
    config_files: ['pyproject.toml', 'requirements.txt', 'setup.cfg', 'mypy.ini', 'pytest.ini'].filter((rel) => exists(root, rel)),
    signals: {
      has_manage_py: exists(root, 'manage.py'),
      has_tests_dir: exists(root, 'tests'),
      has_src_dir: exists(root, 'src'),
    },
    confidence: validation.length >= 2 ? 0.88 : 0.72,
  };
}

module.exports = {
  id: 'python',
  detect,
};
