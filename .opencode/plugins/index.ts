/**
 * Easy OpenCode (EOC) Plugins for OpenCode
 *
 * This module exports all EOC plugins for OpenCode integration.
 * Plugins provide hook-based automation that mirrors Claude Code's hook system
 * while taking advantage of OpenCode's more sophisticated 20+ event types.
 */

export { EOCHooksPlugin, default } from "./eoc-hooks.js"

// Re-export for named imports
export * from "./eoc-hooks.js"
