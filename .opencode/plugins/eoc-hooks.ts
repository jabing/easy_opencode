/**
 * Easy OpenCode (EOC) Plugin Hooks for OpenCode
 *
 * This plugin translates Claude Code hooks to OpenCode's plugin system.
 * OpenCode's plugin system is MORE sophisticated than Claude Code with 20+ events
 * compared to Claude Code's 3 phases (PreToolUse, PostToolUse, Stop).
 *
 * Hook Event Mapping:
 * - PreToolUse 鈫?tool.execute.before
 * - PostToolUse 鈫?tool.execute.after
 * - Stop 鈫?session.idle / session.status
 * - SessionStart 鈫?session.created
 * - SessionEnd 鈫?session.deleted
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { spawnSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

export const EOCHooksPlugin = async ({
  client,
  $,
  directory,
  worktree,
}: PluginInput) => {
  // Track files edited in current session for console.log audit
  const editedFiles = new Set<string>()

  // Helper to call the SDK's log API with correct signature
  const log = (level: "debug" | "info" | "warn" | "error", message: string) => {
    try {
      const logPath = path.join(process.cwd(), ".opencode", "eoc.log")
      const logDir = path.dirname(logPath)
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
      fs.appendFileSync(logPath, `[${new Date().toISOString().slice(0, 19)}] [${level.toUpperCase().padEnd(5)}] ${message}\n`)
    } catch {}
  }

  /**
   * Cross-platform helper to find console.log occurrences in a file.
   * Replaces `grep -n "console\.log"` which doesn't work on Windows.
   */
  const findConsoleLogs = (filePath: string): { line: number; content: string }[] => {
    try {
      const content = fs.readFileSync(filePath, "utf-8")
      const lines = content.split("\n")
      const results: { line: number; content: string }[] = []
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("console.log")) {
          results.push({ line: i + 1, content: lines[i].trim() })
        }
      }
      return results
    } catch {
      return []
    }
  }

  /**
   * Cross-platform helper to count console.log occurrences.
   * Replaces `grep -c "console\.log"` which doesn't work on Windows.
   */
  const countConsoleLogs = (filePath: string): number => {
    return findConsoleLogs(filePath).length
  }

  /**
   * Cross-platform helper to run a command and capture output.
   * Prevents TUI corruption by capturing all stdout/stderr.
   */
  const runCommand = (cmd: string, args: string[]): { success: boolean; stdout: string; stderr: string } => {
    try {
      const result = spawnSync(cmd, args, {
        cwd: process.cwd(),
        stdio: 'pipe',  // Capture all output to prevent TUI corruption
        shell: false,
        windowsHide: true,
      })
      
      return {
        success: result.status === 0,
        stdout: result.stdout?.toString() || '',
        stderr: result.stderr?.toString() || '',
      }
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: (error as Error).message,
      }
    }
  }

  return {
    /**
     * Prettier Auto-Format Hook
     * Equivalent to Claude Code PostToolUse hook for prettier
     *
     * Triggers: After any JS/TS/JSX/TSX file is edited
     * Action: Runs prettier --write on the file
     */
    "file.edited": async (event: { path: string }) => {
      // Track edited files for console.log audit
      editedFiles.add(event.path)

      // Auto-format JS/TS files using cross-platform runCommand
      if (event.path.match(/\.(ts|tsx|js|jsx)$/)) {
        const result = runCommand("npx", ["prettier", "--write", event.path])
        if (result.success) {
          log("info", `[EOC] Formatted: ${event.path}`)
        }
        // Silently continue if prettier fails
      }

      // Console.log warning check using cross-platform file reading
      if (event.path.match(/\.(ts|tsx|js|jsx)$/)) {
        const consoleLogs = findConsoleLogs(event.path)
        if (consoleLogs.length > 0) {
          log(
            "warn",
            `[EOC] console.log found in ${event.path} (${consoleLogs.length} occurrence${consoleLogs.length > 1 ? "s" : ""})`
          )
        }
      }
    },

    /**
     * TypeScript Check Hook
     * Equivalent to Claude Code PostToolUse hook for tsc
     *
     * Triggers: After edit tool completes on .ts/.tsx files
     * Action: Runs tsc --noEmit to check for type errors
     */
    "tool.execute.after": async (
      input: { tool: string; args?: { filePath?: string; command?: string } },
      output: unknown
    ) => {
      // Check if a TypeScript file was edited
      if (
        input.tool === "edit" &&
        input.args?.filePath?.match(/\.tsx?$/)
      ) {
        // Use cross-platform runCommand to capture all output
        const result = runCommand("npx", ["tsc", "--noEmit"])
        
        if (result.success) {
          log("info", "[EOC] TypeScript check passed")
        } else {
          log("warn", "[EOC] TypeScript errors detected:")
          // Log first few errors from stdout or stderr
          const errorOutput = result.stdout || result.stderr
          if (errorOutput) {
            const errors = errorOutput.split("\n").slice(0, 5).filter(e => e.trim())
            errors.forEach((line) => log("warn", `  ${line}`))
          }
        }
      }

      // Security check after bash execution
      if (input.tool === "bash") {
        const cmd = String(input.args?.command || "")
        if (cmd.match(/rm\s+-rf/)) {
          log("warn", "[EOC] Warning: Destructive command detected - " + cmd)
        }
      }
    },

    /**
     * Security Check Hook
     * Equivalent to Claude Code PreToolUse hook for security
     *
     * Triggers: Before bash command execution
     * Action: Checks for secrets and validates commands
     */
    "tool.execute.before": async (input: {
      tool: string
      args?: { command?: string }
    }) => {
      if (input.tool === "bash" && input.args?.command) {
        const cmd = input.args.command

        // Check for potential secret exposure
        const secretPatterns = [
          /api[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/i,
          /password\s*[:=]\s*['"][^'"]+['"]/i,
          /secret\s*[:=]\s*['"][^'"]{10,}['"]/i,
          /sk-[a-zA-Z0-9]{32,}/,
          /ghp_[a-zA-Z0-9]{36}/,
        ]

        for (const pattern of secretPatterns) {
          if (pattern.test(cmd)) {
            log("error", "[EOC] Security: Potential secret in command blocked")
            return { blocked: true, reason: "Potential secret exposure detected" }
          }
        }

        // Check for dangerous commands
        const dangerousPatterns = [
          /rm\s+-rf\s+\//,
          />\s*\/dev\/null.*rm/,
          /curl.*\|.*sh/,
          /wget.*\|.*sh/,
        ]

        for (const pattern of dangerousPatterns) {
          if (pattern.test(cmd)) {
            log("error", "[EOC] Security: Dangerous command pattern detected")
            return { blocked: true, reason: "Dangerous command pattern" }
          }
        }
      }

      return { blocked: false }
    },

    /**
     * Session Created Hook
     * Equivalent to Claude Code SessionStart hook
     *
     * Triggers: When a new session starts
     * Action: Loads context and displays welcome message
     */
    "session.created": async () => {
      log("info", "[EOC] Session started - Easy OpenCode hooks active")

      // Check for project-specific context files using cross-platform fs.existsSync
      const claudeMdPath = worktree ? path.join(worktree, "CLAUDE.md") : "CLAUDE.md"
      if (fs.existsSync(claudeMdPath)) {
        log("info", "[EOC] Found CLAUDE.md - loading project context")
      }
    },

    /**
     * Session Idle Hook
     * Equivalent to Claude Code Stop hook
     *
     * Triggers: When session becomes idle (task completed)
     * Action: Runs console.log audit on all edited files
     */
    "session.idle": async () => {
      if (editedFiles.size === 0) return

      log("info", "[EOC] Session idle - running console.log audit")

      let totalConsoleLogCount = 0
      const filesWithConsoleLogs: string[] = []

      // Use cross-platform countConsoleLogs instead of grep
      for (const file of editedFiles) {
        if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue

        const count = countConsoleLogs(file)
        if (count > 0) {
          totalConsoleLogCount += count
          filesWithConsoleLogs.push(file)
        }
      }

      if (totalConsoleLogCount > 0) {
        log(
          "warn",
          `[EOC] Audit: ${totalConsoleLogCount} console.log statement(s) in ${filesWithConsoleLogs.length} file(s)`
        )
        filesWithConsoleLogs.forEach((f) =>
          log("warn", `  - ${f}`)
        )
        log("warn", "[EOC] Remove console.log statements before committing")
      } else {
        log("info", "[EOC] Audit passed: No console.log statements found")
      }

      // Desktop notification (macOS only) - cross-platform check
      if (process.platform === "darwin") {
        const result = runCommand("osascript", [
          "-e",
          'display notification "Task completed!" with title "OpenCode EOC"'
        ])
        // Silently ignore if notification fails
      }

      // Clear tracked files for next task
      editedFiles.clear()
    },

    /**
     * Session Deleted Hook
     * Equivalent to Claude Code SessionEnd hook
     *
     * Triggers: When session ends
     * Action: Final cleanup and state saving
     */
    "session.deleted": async () => {
      log("info", "[EOC] Session ended - cleaning up")
      editedFiles.clear()
    },

    /**
     * File Watcher Hook
     * OpenCode-only feature
     *
     * Triggers: When file system changes are detected
     * Action: Updates tracking
     */
    "file.watcher.updated": async (event: { path: string; type: string }) => {
      if (event.type === "change" && event.path.match(/\.(ts|tsx|js|jsx)$/)) {
        editedFiles.add(event.path)
      }
    },

    /**
     * Todo Updated Hook
     * OpenCode-only feature
     *
     * Triggers: When todo list is updated
     * Action: Logs progress
     */
    "todo.updated": async (event: { todos: Array<{ text: string; done: boolean }> }) => {
      const completed = event.todos.filter((t) => t.done).length
      const total = event.todos.length
      if (total > 0) {
        log("info", `[EOC] Progress: ${completed}/${total} tasks completed`)
      }
    },

    /**
     * Shell Environment Hook
     * OpenCode-specific: Inject environment variables into shell commands
     *
     * Triggers: Before shell command execution
     * Action: Sets PROJECT_ROOT, PACKAGE_MANAGER, DETECTED_LANGUAGES, EOC_VERSION
     */
    "shell.env": async () => {
      const env: Record<string, string> = {
        EOC_VERSION: "1.9.9",
        EOC_PLUGIN: "true",
        PROJECT_ROOT: worktree || directory,
      }

      // Detect package manager using cross-platform fs.existsSync
      const lockfiles: Record<string, string> = {
        "bun.lockb": "bun",
        "pnpm-lock.yaml": "pnpm",
        "yarn.lock": "yarn",
        "package-lock.json": "npm",
      }
      for (const [lockfile, pm] of Object.entries(lockfiles)) {
        const lockfilePath = worktree ? path.join(worktree, lockfile) : lockfile
        if (fs.existsSync(lockfilePath)) {
          env.PACKAGE_MANAGER = pm
          break
        }
      }

      // Detect languages using cross-platform fs.existsSync
      const langDetectors: Record<string, string> = {
        "tsconfig.json": "typescript",
        "go.mod": "go",
        "pyproject.toml": "python",
        "Cargo.toml": "rust",
        "Package.swift": "swift",
      }
      const detected: string[] = []
      for (const [file, lang] of Object.entries(langDetectors)) {
        const filePath = worktree ? path.join(worktree, file) : file
        if (fs.existsSync(filePath)) {
          detected.push(lang)
        }
      }
      if (detected.length > 0) {
        env.DETECTED_LANGUAGES = detected.join(",")
        env.PRIMARY_LANGUAGE = detected[0]
      }

      return env
    },

    /**
     * Session Compacting Hook
     * OpenCode-specific: Control context compaction behavior
     *
     * Triggers: Before context compaction
     * Action: Push EOC context block and custom compaction prompt
     */
    "experimental.session.compacting": async () => {
      const contextBlock = [
        "# EOC Context (preserve across compaction)",
        "",
        "## Active Plugin: Easy OpenCode v1.9.9",
        "- Hooks: file.edited, tool.execute.before/after, session.created/idle/deleted, shell.env, compacting, permission.ask",
        "- Tools: run-tests, check-coverage, security-audit, format-code, lint-check, git-summary",
        "- Agents: 13 specialized (planner, architect, tdd-guide, code-reviewer, security-reviewer, build-error-resolver, e2e-runner, refactor-cleaner, doc-updater, go-reviewer, go-build-resolver, database-reviewer, python-reviewer)",
        "",
        "## Key Principles",
        "- TDD: write tests first, 80%+ coverage",
        "- Immutability: never mutate, always return new copies",
        "- Security: validate inputs, no hardcoded secrets",
        "",
      ]

      // Include recently edited files
      if (editedFiles.size > 0) {
        contextBlock.push("## Recently Edited Files")
        for (const f of editedFiles) {
          contextBlock.push(`- ${f}`)
        }
        contextBlock.push("")
      }

      return {
        context: contextBlock.join("\n"),
        compaction_prompt: "Focus on preserving: 1) Current task status and progress, 2) Key decisions made, 3) Files created/modified, 4) Remaining work items, 5) Any security concerns flagged. Discard: verbose tool outputs, intermediate exploration, redundant file listings.",
      }
    },

    /**
     * Permission Auto-Approve Hook
     * OpenCode-specific: Auto-approve safe operations
     *
     * Triggers: When permission is requested
     * Action: Auto-approve reads, formatters, and test commands; log all for audit
     */
    "permission.ask": async (event: { tool: string; args: unknown }) => {
      log("info", `[EOC] Permission requested for: ${event.tool}`)

      const cmd = String((event.args as Record<string, unknown>)?.command || event.args || "")

      // Auto-approve: read/search tools
      if (["read", "glob", "grep", "search", "list"].includes(event.tool)) {
        return { approved: true, reason: "Read-only operation" }
      }

      // Auto-approve: formatters
      if (event.tool === "bash" && /^(npx )?(prettier|biome|black|gofmt|rustfmt|swift-format)/.test(cmd)) {
        return { approved: true, reason: "Formatter execution" }
      }

      // Auto-approve: test execution
      if (event.tool === "bash" && /^(npm test|npx vitest|npx jest|pytest|go test|cargo test)/.test(cmd)) {
        return { approved: true, reason: "Test execution" }
      }

      // Everything else: let user decide
      return { approved: undefined }
    },
  }
}

export default EOCHooksPlugin
