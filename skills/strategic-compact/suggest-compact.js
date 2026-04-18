#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_THRESHOLD = 50;
const DEFAULT_REPEAT = 25;
const DEFAULT_STATE_DIR = path.join(os.homedir(), ".claude", "state", "strategic-compact");

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeSessionId(raw) {
  const value = String(raw || process.env.CLAUDE_SESSION_ID || process.env.OPENCODE_SESSION_ID || "default");
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "default";
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function extractToolName(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.tool_name,
    payload.toolName,
    payload.tool,
    payload.name,
    payload.event?.tool_name,
    payload.event?.toolName,
    payload.event?.tool,
    payload.hook_event_name,
    payload.hookEventName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function loadPayload() {
  const chunks = [];
  try {
    if (!process.stdin.isTTY) {
      const buf = fs.readFileSync(0, "utf8");
      if (buf && buf.trim()) chunks.push(buf);
    }
  } catch {}

  if (!chunks.length && process.argv[2]) chunks.push(process.argv[2]);
  if (!chunks.length && process.env.CLAUDE_HOOK_PAYLOAD) chunks.push(process.env.CLAUDE_HOOK_PAYLOAD);

  for (const chunk of chunks) {
    try {
      return JSON.parse(chunk);
    } catch {}
  }
  return {};
}

function main() {
  const payload = loadPayload();
  const sessionId = safeSessionId(payload.session_id || payload.sessionId);
  const threshold = toPositiveInt(process.env.COMPACT_THRESHOLD, DEFAULT_THRESHOLD);
  const repeatEvery = toPositiveInt(process.env.COMPACT_REPEAT_EVERY, DEFAULT_REPEAT);
  const stateDir = process.env.STRATEGIC_COMPACT_STATE_DIR || DEFAULT_STATE_DIR;
  const stateFile = path.join(stateDir, `${sessionId}.json`);

  ensureDir(stateDir);

  const now = new Date().toISOString();
  const tool = extractToolName(payload) || "unknown";
  const state = readJson(stateFile) || {
    session_id: sessionId,
    call_count: 0,
    first_suggested_at: null,
    last_suggested_at: null,
    last_suggested_count: 0,
    tool_history: [],
  };

  state.call_count += 1;
  state.updated_at = now;
  state.tool_history.push({ tool, at: now });
  if (state.tool_history.length > 20) state.tool_history = state.tool_history.slice(-20);

  const shouldSuggest =
    state.call_count >= threshold &&
    (state.last_suggested_count === 0 || state.call_count - state.last_suggested_count >= repeatEvery);

  if (shouldSuggest) {
    state.first_suggested_at ||= now;
    state.last_suggested_at = now;
    state.last_suggested_count = state.call_count;

    const since = state.call_count >= threshold + repeatEvery ? ` Another ${repeatEvery} tool calls passed since the last reminder.` : "";
    const message = [
      "[strategic-compact] Consider running /compact at the next logical boundary.",
      `Session: ${sessionId}`,
      `Tool calls observed: ${state.call_count}. Threshold: ${threshold}.${since}`,
      "Good moments: after planning, after finishing a milestone, before switching to a new feature, or after debugging.",
    ].join(" ");
    console.error(message);
  }

  writeJson(stateFile, state);
}

main();
