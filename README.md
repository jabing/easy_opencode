# Everything OpenCode

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/jabing/everything_opencode?style=social)](https://github.com/jabing/everything_opencode)

> Production-ready AI coding plugin for OpenCode with 14 specialized agents, 50+ skills, 34 commands, and automated hook workflows.

English | [简体中文](#简体中文)

## Features

### ✨ New: Token Recovery (2026-03-07)

- **Token Recovery Command** - `/token-recover` for automatic token limit handling
- **Token Management Skill** - Proactive token monitoring and smart compaction
- **Quick Reference Guide** - One-page token recovery cheat sheet

### ECC v1.8.0 Improvements (2026-03-06)

- **Hook Runtime Controls** - Environment-based hook configuration
- **Session Recovery** - Validate and recover corrupted sessions
- **5 New Commands** - harness-audit, loop-start, loop-status, quality-gate, model-route
- **Code Quality** - Prettier config and Plankton skill
- **Test Infrastructure** - Jest setup for unit testing


### 🤖 14 Specialized Agents

| Agent | Purpose |
|-------|---------|
| planner | Implementation planning for complex features |
| architect | System design and scalability decisions |
| tdd-guide | Test-driven development workflow |
| code-reviewer | Code quality and maintainability review |
| security-reviewer | Security vulnerability detection |
| build-error-resolver | Fix build and type errors |
| e2e-runner | End-to-end Playwright testing |
| refactor-cleaner | Dead code cleanup |
| doc-updater | Documentation and codemaps |
| go-reviewer | Go code review specialist |
| go-build-resolver | Go build error fixes |
| database-reviewer | PostgreSQL/Supabase optimization |

### 📚 50+ Skills

Comprehensive skills covering:
- **Coding Standards** - TypeScript, JavaScript, Python, Go, Swift
- **Backend Patterns** - API design, database optimization, caching
- **Frontend Patterns** - React, Next.js, state management
- **Security** - Input validation, authentication, secrets management
- **Testing** - TDD workflow, E2E testing, coverage analysis
- **DevOps** - Docker patterns, deployment, CI/CD

### 🛠️ 34 Commands

Quick-access slash commands including:
- `/plan` - Create implementation plan
- `/tdd` - Enforce TDD workflow
- `/code-review` - Review code changes
- `/security` - Security review
- `/build-fix` - Fix build errors
- `/e2e` - Generate E2E tests
- `/refactor-clean` - Remove dead code

### ⚡ Automated Hooks

Smart hooks that run automatically:
- **File Edited** - Auto-format with Prettier, TypeScript validation
- **Shell Execution** - Build/test result analysis
- **Session** - Start/end logging and cleanup
- **Security** - Secret scanning, input validation
### Prerequisites

First, install OpenCode:
```bash
# macOS/Linux
brew install opencode

# Or via npm
npm install -g opencode

# Verify installation
opencode --version
```

```bash
git clone https://github.com/jabing/everything_opencode.git
cd everything_opencode
node scripts/install.js
```

Choose either:
1. **Project-level** - Installs to `.opencode/` in current directory
2. **Global** - Installs to OpenCode's global config directory




## Project Structure

```
everything_opencode/
├── .opencode/           # OpenCode configuration
│   ├── hooks/           # Automated hooks
│   ├── plugins/         # Plugin definitions
│   └── tools/           # Custom tools
├── prompts/             # Agent prompts (13 agents)
│   └── agents/
├── commands/            # 33 slash commands
├── skills/              # 50+ workflow skills
└── AGENTS.md            # Agent instructions
```

## Usage Examples

### Agent Orchestration

```typescript
// Complex feature → planner agent
// Code just written → code-reviewer agent  
// Bug fix or new feature → tdd-guide agent
// Architectural decision → architect agent
// Security-sensitive code → security-reviewer agent
```

### TDD Workflow

1. Write test first (RED)
2. Implement code (GREEN)
3. Refactor (IMPROVE)
4. Verify 80%+ coverage

### Security Checklist

Before ANY commit:
- [ ] No hardcoded secrets
- [ ] All inputs validated
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection

## Configuration

Full configuration in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  "plugin": ["./.opencode/plugins"],
  "instructions": [
    "skills/tdd-workflow/SKILL.md",
    "skills/security-review/SKILL.md"
  ]
}
```

## Key Skills

| Skill | Description |
|-------|-------------|
| [tdd-workflow](skills/tdd-workflow/SKILL.md) | Test-driven development with 80%+ coverage |
| [security-review](skills/security-review/SKILL.md) | Security checklist and vulnerability detection |
| [coding-standards](skills/coding-standards/SKILL.md) | Universal coding best practices |
| [frontend-patterns](skills/frontend-patterns/SKILL.md) | React, Next.js, state management |
| [backend-patterns](skills/backend-patterns/SKILL.md) | API design, database optimization |
| [e2e-testing](skills/e2e-testing/SKILL.md) | Playwright E2E testing patterns |
| [api-design](skills/api-design/SKILL.md) | REST API design standards |

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## 简体中文

> 面向 OpenCode 的生产级 AI 编码插件，提供 13 个专业代理、50+ 技能、33 个命令和自动化钩子工作流。

### 核心特性

- **13 个专业代理** - 规划、架构、代码审查、安全审查、TDD 指导等
- **50+ 技能** - 涵盖编码规范、前后端模式、安全、测试、DevOps
- **33 个命令** - `/plan`、`/tdd`、`/code-review`、`/security` 等快捷命令
- **自动化钩子** - 文件编辑时自动格式化、类型检查、安全扫描

### 快速开始

```bash
git clone https://github.com/jabing/everything_opencode.git
cd everything_opencode
opencode
```

### 核心原则

1. **代理优先** - 将领域任务委托给专业代理
2. **测试驱动** - 先写测试再实现，覆盖率 80%+
3. **安全第一** - 永远不在安全性上妥协
4. **不可变性** - 始终创建新对象，永不修改现有对象
5. **先规划后执行** - 复杂功能先规划再编码

---

Made with ❤️ by the Everything OpenCode Team
