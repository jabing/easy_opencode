import type { PluginInput } from "@opencode-ai/plugin"
import { spawnSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

type LogLevel = "debug" | "info" | "warn" | "error"

function ensureParent(filePath: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writeLog(logPath: string, level: LogLevel, message: string) {
  try {
    ensureParent(logPath)
    const ts = new Date().toISOString()
    fs.appendFileSync(logPath, `[${ts}] [${level.toUpperCase()}] ${message}\n`, "utf8")
  } catch {
    // best effort only
  }
}

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch {
    return ""
  }
}

function findConsoleLogs(filePath: string): number {
  const content = readText(filePath)
  if (!content) return 0
  return content.split(/\r?\n/).filter((line) => line.includes("console.log")).length
}

function runCheck(cwd: string, command: string, args: string[]) {
  try {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      windowsHide: true,
    })
    return {
      ok: result.status === 0,
      output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
    }
  } catch (error) {
    return {
      ok: false,
      output: String((error as Error).message || error),
    }
  }
}

function resolveQualityGateScript(cwd: string): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'scripts', 'quality-gate.js'),
    path.join(cwd, 'scripts', 'quality-gate.js'),
    path.join(cwd, '.opencode', 'easy-opencode', 'scripts', 'quality-gate.js'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

export const EOCHooksPlugin = async ({ directory }: PluginInput) => {
  const cwd = directory || process.cwd()
  const logPath = path.join(cwd, ".opencode", "eoc.log")

  writeLog(logPath, "info", "Easy OpenCode hooks loaded")

  return {
    name: "easy-opencode-hooks",
    events: {
      "session.created": async () => {
        writeLog(logPath, "info", "session.created")
      },
      "session.deleted": async () => {
        writeLog(logPath, "info", "session.deleted")
      },
      "tool.execute.after": async (event: any) => {
        const maybePath = event?.filePath || event?.path || event?.args?.filePath || event?.args?.path
        if (typeof maybePath === "string" && maybePath) {
          const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(cwd, maybePath)
          const count = findConsoleLogs(resolved)
          if (count > 0) {
            writeLog(logPath, "warn", `console.log detected in ${resolved} (${count})`)
          }
        }
      },
      "session.idle": async () => {
        const qualityGateScript = resolveQualityGateScript(cwd)
        const result = runCheck(cwd, process.execPath, [qualityGateScript])
        writeLog(logPath, result.ok ? "info" : "warn", `quality-gate: ${result.ok ? "pass" : "non-zero"}${result.output ? ` | ${result.output.slice(0, 240)}` : ""}`)
      },
    },
  }
}

export default EOCHooksPlugin
