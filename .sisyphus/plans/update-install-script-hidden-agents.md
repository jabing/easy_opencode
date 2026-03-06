# 更新安装脚本 - 添加隐藏 Agents 支持

## TL;DR

> **目标**: 更新 `scripts/install.js`，添加所有隐藏 agent 的注册，使其通过 `hidden: true` 不显示在 `/Agents` 列表中，只能通过 `/tdd`、`/e2e` 等命令调用。

## 问题分析

当前 `install.js` 只注册了 3 个 agent：
- `eoc_build`
- `eoc_planner`
- `eoc_code-reviewer`

但命令引用了 10+ 个未注册的 agent，导致 `/refactor-clean`、`/tdd` 等命令报错 "Agent not found"。

## 解决方案

在 `installGlobal()` 函数中添加所有隐藏 agent 定义，使用 `hidden: true` 属性。

## 修改内容

### 文件: `scripts/install.js`

**位置**: 第 256-280 行 (agent 配置部分)

**替换为**:

```javascript
  // Update global opencode.json with agent definitions
  // Primary agents (visible in /Agents)
  // Hidden agents (only accessible via commands, use hidden: true)
  const config = {
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'eoc_build',
    agent: {
      // === PRIMARY AGENTS (visible) ===
      eoc_build: {
        description: 'EOC - Primary coding agent for development work',
        mode: 'primary',
        tools: { write: true, edit: true, bash: true, read: true }
      },
      eoc_planner: {
        description: 'EOC - Expert planning specialist for complex features',
        mode: 'primary',
        prompt: '{file:prompts/agents/planner.txt}',
        tools: { read: true, bash: true, write: false, edit: false }
      },
      eoc_code_reviewer: {
        description: 'EOC - Expert code review specialist',
        mode: 'primary',
        prompt: '{file:prompts/agents/code-reviewer.txt}',
        tools: { read: true, bash: true, write: false, edit: false }
      },
      // === HIDDEN AGENTS (command-only) ===
      'tdd-guide': {
        description: 'TDD specialist - write tests first, 80%+ coverage',
        hidden: true,
        prompt: '{file:prompts/agents/tdd-guide.txt}',
        tools: { read: true, write: true, edit: true, bash: true }
      },
      'security-reviewer': {
        description: 'Security vulnerability detection and audit',
        hidden: true,
        prompt: '{file:prompts/agents/security-reviewer.txt}',
        tools: { read: true, bash: true, write: false, edit: false }
      },
      'build-error-resolver': {
        description: 'Fix build and TypeScript errors',
        hidden: true,
        prompt: '{file:prompts/agents/build-error-resolver.txt}',
        tools: { read: true, write: true, edit: true, bash: true }
      },
      'e2e-runner': {
        description: 'End-to-end Playwright testing',
        hidden: true,
        prompt: '{file:prompts/agents/e2e-runner.txt}',
        tools: { read: true, write: true, edit: true, bash: true }
      },
      'refactor-cleaner': {
        description: 'Remove dead code and consolidate duplicates',
        hidden: true,
        prompt: '{file:prompts/agents/refactor-cleaner.txt}',
        tools: { read: true, write: true, edit: true, bash: true }
      },
      'doc-updater': {
        description: 'Documentation and codemap updates',
        hidden: true,
        prompt: '{file:prompts/agents/doc-updater.txt}',
        tools: { read: true, write: true, edit: true, bash: true }
      },
      'go-reviewer': {
        description: 'Go code review specialist',
        hidden: true,
        prompt: '{file:prompts/agents/go-reviewer.txt}',
        tools: { read: true, bash: true, write: false, edit: false }
      },
      'go-build-resolver': {
        description: 'Fix Go build errors',
        hidden: true,
        prompt: '{file:prompts/agents/go-build-resolver.txt}',
        tools: { read: true, write: true, edit: true, bash: true }
      },
      'database-reviewer': {
        description: 'PostgreSQL/Supabase schema and query optimization',
        hidden: true,
        prompt: '{file:prompts/agents/database-reviewer.txt}',
        tools: { read: true, bash: true, write: false, edit: false }
      },
      'architect': {
        description: 'System design and scalability decisions',
        hidden: true,
        prompt: '{file:prompts/agents/architect.txt}',
        tools: { read: true, bash: true, write: false, edit: false }
      },
      'python-reviewer': {
        description: 'Python code review specialist',
        hidden: true,
        prompt: '{file:prompts/agents/python-reviewer.txt}',
        tools: { read: true, bash: true, write: false, edit: false }
      }
    },
    plugin: ['.opencode']
  }
```

## Agent 分类

### 可见 Agents (mode: 'primary')
| Agent | 用途 | 命令 |
|-------|------|------|
| `eoc_build` | 主要编码 | 默认 |
| `eoc_planner` | 规划 | `/plan`, `/orchestrate` |
| `eoc_code_reviewer` | 代码审查 | `/code-review` |

### 隐藏 Agents (hidden: true)
| Agent | 用途 | 命令 |
|-------|------|------|
| `tdd-guide` | TDD 工作流 | `/tdd`, `/go-test`, `/test-coverage` |
| `security-reviewer` | 安全审查 | `/security` |
| `build-error-resolver` | 构建错误 | `/build-fix` |
| `e2e-runner` | E2E 测试 | `/e2e` |
| `refactor-cleaner` | 死代码清理 | `/refactor-clean` |
| `doc-updater` | 文档更新 | `/update-docs`, `/update-codemaps` |
| `go-reviewer` | Go 审查 | `/go-review` |
| `go-build-resolver` | Go 构建 | `/go-build` |
| `database-reviewer` | 数据库 | - |
| `architect` | 架构设计 | - |
| `python-reviewer` | Python 审查 | `/python-review` |

## 安装后步骤

修改完成后，用户需要：

1. 重新运行安装脚本: `node scripts/install.js` 选择选项 2 (全局安装)
2. 或手动更新 `C:\Users\<user>\.opencode\opencode.json`

## 验证

安装后验证：
- `/Agents` 只显示 3 个可见 agent
- `/tdd`, `/refactor-clean` 等命令正常工作

---

## Completion Status

**Status**: ✅ COMPLETED  
**Completed At**: 2026-02-26T16:10:00Z  
**Changes Made**: Updated `scripts/install.js` with 13 agents (3 visible, 10 hidden)
