const test = require('node:test');
const assert = require('node:assert/strict');
const { withTempDir, writeFiles } = require('./test-helpers.js');
const { createPythonProvider } = require('../src/core/languages/providers/python.js');
const { normalizeFailures } = require('../src/shared/error-normalizers/index.js');

test('python provider summarizes imports, module hints, package hints, and related tests', () => {
  const provider = createPythonProvider();

  withTempDir((dir) => {
    writeFiles(dir, {
      'pyproject.toml': '[project]\nname = "sample-python"\nversion = "0.1.0"\n',
      'app/models/__init__.py': 'from .existing import Existing\n\n__all__ = ["Existing"]\n',
      'app/models/user.py': [
        'from .billing import Billing',
        'from ..shared.utils import format_name',
        'import os, typing as t',
        '',
        '__all__ = ["User", "UserProfile"]',
        '',
        'class User:',
        '    pass',
        '',
      ].join('\n'),
      'app/models/billing.py': 'class Billing:\n    pass\n',
      'app/shared/utils.py': 'def format_name(value):\n    return value.strip()\n',
      'tests/test_user.py': 'def test_user():\n    assert True\n',
      'tests/user_profile_test.py': 'def test_user_profile():\n    assert True\n',
    });
  }, (dir) => {
    assert.equal(provider.supports({ runtime: 'python' }, 'app/models/user.py'), true);
    assert.equal(provider.supports({ runtime: 'node' }, 'app/models/user.py'), true);
    assert.equal(provider.supports({ runtime: 'python' }, 'docs/readme.md'), false);

    const analysis = provider.analyzeProject({ rootDir: dir, objective: 'update user imports', targets: ['app/models/user.py'] });
    const summary = provider.summarizeTarget({ rootDir: dir, target: 'app/models/user.py', analysis });

    assert.equal(summary.provider_id, 'python');
    assert.equal(summary.module_name, 'app.models.user');
    assert.deepEqual(summary.package_roots, ['app/models']);
    assert.equal(summary.owning_package, 'app/models');
    assert.deepEqual(summary.exports, ['User', 'UserProfile']);
    assert.ok(summary.imports.includes('from .billing import Billing'));
    assert.ok(summary.imports.some((item) => item.includes('shared.utils')));
    assert.ok(summary.imports.some((item) => item.includes('import os')));
    assert.ok(summary.module_hints.includes('app.models.billing'));
    assert.ok(summary.module_hints.includes('app.shared.utils'));
    assert.ok(summary.module_hints.includes('os'));
    assert.ok(summary.module_hints.includes('typing'));
    assert.ok(summary.related_tests.includes('tests/test_user.py'));
    assert.ok(summary.related_tests.includes('tests/user_profile_test.py'));
    assert.ok(Array.isArray(analysis.module_hints));
    assert.ok(analysis.module_hints.includes('app.models.billing'));
    assert.ok(Array.isArray(analysis.package_hints));
    assert.ok(analysis.package_hints.includes('app/models'));
  });
});

test('python failure normalization routes through the provider hint without regressing node parsing', () => {
  const pythonFailure = normalizeFailures({
    runtime: 'node',
    language: 'javascript',
    provider: 'python-semantic',
    tool: 'lint',
    text: 'app/models/user.py:12:5: E302 expected 2 blank lines before class definition',
  });
  assert.equal(pythonFailure.length, 1);
  assert.deepEqual(pythonFailure[0], {
    tool: 'lint',
    category: 'lint_error',
    file: 'app/models/user.py',
    line: 12,
    col: 5,
    code: 'E302',
    message: 'expected 2 blank lines before class definition',
  });

  const tracebackFailure = normalizeFailures({
    runtime: 'node',
    language: 'javascript',
    provider: 'python-semantic',
    tool: 'test',
    text: [
      'Traceback (most recent call last):',
      '  File "app/models/user.py", line 7, in build_user',
      'ModuleNotFoundError: No module named billing',
    ].join('\n'),
  });
  assert.equal(tracebackFailure.length >= 1, true);
  assert.equal(tracebackFailure[0].category, 'runtime_error');
  assert.equal(tracebackFailure[0].file, 'app/models/user.py');

  const nodeFailure = normalizeFailures({
    runtime: 'node',
    language: 'typescript',
    tool: 'lint',
    text: 'src/auth.ts(12,4): error TS2339: Property does not exist on type.',
  });
  assert.equal(nodeFailure.length, 1);
  assert.equal(nodeFailure[0].tool, 'lint');
  assert.equal(nodeFailure[0].category, 'type_error');
  assert.equal(nodeFailure[0].file, 'src/auth.ts');
  assert.equal(nodeFailure[0].line, 12);
  assert.equal(nodeFailure[0].col, 4);
  assert.equal(nodeFailure[0].code, 'TS2339');
  assert.equal(nodeFailure[0].message, 'Property does not exist on type.');
});
