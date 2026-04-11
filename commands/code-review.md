---
description: Review code for quality, security, and maintainability
agent: code-reviewer
subtask: true
---

# Code Review Command

Review code changes for quality, security, and maintainability: $ARGUMENTS

## Your Task

1. **Gather full diff context**: `git diff --staged` + `git diff`
2. **Map impacted scope**: changed files and behavioral surface
3. **Analyze each file** with surrounding context
4. **Generate structured report** with severity and impact
5. **Return explicit verdict**: APPROVE / APPROVE_WITH_WARNINGS / BLOCK

## Check Categories

### Security Issues (CRITICAL)
- [ ] Hardcoded credentials, API keys, tokens
- [ ] SQL injection vulnerabilities
- [ ] XSS vulnerabilities
- [ ] Missing input validation
- [ ] Insecure dependencies
- [ ] Path traversal risks
- [ ] Authentication/authorization flaws

### Code Quality (HIGH)
- [ ] Functions > 50 lines
- [ ] Files > 800 lines
- [ ] Nesting depth > 4 levels
- [ ] Missing error handling
- [ ] console.log statements
- [ ] TODO/FIXME comments
- [ ] Missing JSDoc for public APIs

### Best Practices (MEDIUM)
- [ ] Mutation patterns (use immutable instead)
- [ ] Unnecessary complexity
- [ ] Missing tests for new code
- [ ] Accessibility issues (a11y)
- [ ] Performance concerns

### Style (LOW)
- [ ] Inconsistent naming
- [ ] Missing type annotations
- [ ] Formatting issues

## Report Format

For each issue found (high confidence only):

```
**[SEVERITY]** file.ts:123
Issue: [Description]
Impact: [Why it matters]
Fix: [How to fix]
```

## Decision Rules

- **CRITICAL or HIGH issues**: Block commit, require fixes
- **MEDIUM issues**: Recommend fixes before merge
- **LOW issues**: Optional improvements

Final output must include:

```
Verdict: APPROVE | APPROVE_WITH_WARNINGS | BLOCK
Reason: [One paragraph]
```

---

**IMPORTANT**: Never approve code with security vulnerabilities!
