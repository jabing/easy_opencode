/**
 * Shared domain typedefs for CLI/report contracts and project-profile detection.
 * This module intentionally exports no runtime values; it exists to provide a
 * single source of truth for JSDoc imports in checked JavaScript files.
 *
 * @typedef {{ kind: string, command: string, source?: string }} ValidationCommand
 * @typedef {{ is_workspace: boolean, tool: string | null }} WorkspaceDescriptor
 * @typedef {Record<string, string | number | boolean | null | undefined>} DetectionSignals
 * @typedef {{
 *   runtime: string,
 *   language: string,
 *   framework: string,
 *   package_manager: string | null,
 *   package_name: string,
 *   validation: ValidationCommand[],
 *   detected_by: string | null,
 *   build_tool?: string | null,
 *   test_runner?: string | null,
 *   lint_tool?: string | null,
 *   typecheck_tool?: string | null,
 *   format_tool?: string | null,
 *   app_type?: string | null,
 *   repo_shape?: string | null,
 *   workspace?: WorkspaceDescriptor,
 *   entrypoints?: string[],
 *   config_files?: string[],
 *   signals?: DetectionSignals,
 *   confidence: number,
 * }} ProjectProfileResult
 * @typedef {{
 *   root?: string,
 *   gate?: string,
 *   decision?: string,
 *   summary?: string,
 *   counts?: { pass: number, fail: number, warn: number, skip: number },
 *   results?: Array<{ status: string, check: string, detail: string }>,
 *   checks?: Array<{ status: string, check: string, detail: string }>,
 * }} CliJsonEnvelope
 */

module.exports = {};
