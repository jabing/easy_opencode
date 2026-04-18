const { createFinding, evaluateRules } = require('./engine.js');

/** @typedef {{ rel: string, content: string, isTest: boolean, isAppCode: boolean }} FileRiskInput */
const ALLOW_SHELL_TRUE = new Set(['scripts/check-environment.js', 'src/core/repair/debug-fix-loop.js']);
const TS_EXT_RE = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i;

/** @type {any | null} */
let ts = null;
try {
  ts = require('typescript');
} catch {
  ts = null;
}

/** @param {FileRiskInput} input */
function hasDebuggerStatement(input) {
  if (!TS_EXT_RE.test(input.rel) || !ts) return /\bdebugger\b/.test(input.content);
  const sourceFile = ts.createSourceFile(input.rel, input.content, ts.ScriptTarget.Latest, true);
  let found = false;
  /** @param {any} node */
  function visit(node) {
    if (found) return;
    if (ts.isDebuggerStatement(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/** @type {Array<{ id: string, evaluate(input: FileRiskInput): import('./engine.js').RuleFinding[] }>} */
const FILE_RISK_RULES = [
  {
    id: 'risk.debug.console-log',
    evaluate(input) {
      return input.isAppCode && /\bconsole\.log\s*\(/.test(input.content)
        ? [createFinding({ ruleId: 'risk.debug.console-log', severity: 'warn', message: '[debug] console.log found', location: input.rel })]
        : [];
    },
  },
  {
    id: 'risk.debug.debugger',
    evaluate(input) {
      return hasDebuggerStatement(input)
        ? [createFinding({ ruleId: 'risk.debug.debugger', severity: 'error', message: '[debugger] debugger statement found', location: input.rel })]
        : [];
    },
  },
  {
    id: 'risk.tests.only',
    evaluate(input) {
      return input.isTest && /\b(it|describe|test)\.only\s*\(/.test(input.content)
        ? [createFinding({ ruleId: 'risk.tests.only', severity: 'error', message: '[test-only] .only detected', location: input.rel })]
        : [];
    },
  },
  {
    id: 'risk.dynamic.eval',
    evaluate(input) {
      return /\beval\s*\(/.test(input.content)
        ? [createFinding({ ruleId: 'risk.dynamic.eval', severity: 'error', message: '[dynamic-code] eval(...) detected', location: input.rel })]
        : [];
    },
  },
  {
    id: 'risk.dynamic.new-function',
    evaluate(input) {
      return /\bnew Function\s*\(/.test(input.content)
        ? [createFinding({ ruleId: 'risk.dynamic.new-function', severity: 'error', message: '[dynamic-code] new Function(...) detected', location: input.rel })]
        : [];
    },
  },
  {
    id: 'risk.command.exec',
    evaluate(input) {
      return !input.isTest && /(^|[^\w$.])(exec|execSync)\s*\(/.test(input.content)
        ? [createFinding({ ruleId: 'risk.command.exec', severity: 'error', message: '[command-exec] exec/execSync detected', location: input.rel })]
        : [];
    },
  },
  {
    id: 'risk.command.shell-true',
    evaluate(input) {
      return /\bshell\s*:\s*true/.test(input.content) && !ALLOW_SHELL_TRUE.has(input.rel)
        ? [createFinding({ ruleId: 'risk.command.shell-true', severity: 'warn', message: '[shell-true] shell:true detected', location: input.rel })]
        : [];
    },
  },
  {
    id: 'risk.todo',
    evaluate(input) {
      return input.isAppCode && /\b(TODO|FIXME)\b/.test(input.content)
        ? [createFinding({ ruleId: 'risk.todo', severity: 'warn', message: '[todo] TODO/FIXME found', location: input.rel })]
        : [];
    },
  },
  {
    id: 'risk.secret.pattern',
    evaluate(input) {
      const secretLike = /\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["'`][^"'`\r\n]{8,}["'`]/i;
      return secretLike.test(input.content)
        ? [createFinding({ ruleId: 'risk.secret.pattern', severity: 'error', message: '[secret] possible hardcoded credential', location: input.rel })]
        : [];
    },
  },
];

/** @param {FileRiskInput} input */
function evaluateFileRiskRules(input) {
  return evaluateRules(input, FILE_RISK_RULES);
}

module.exports = {
  FILE_RISK_RULES,
  evaluateFileRiskRules,
  hasDebuggerStatement,
};
