---
name: continuous-learning
description: Automatically extract reusable patterns from Claude Code sessions and save them as learned skills for future use.
origin: EOC
deprecated: true
superseded_by: continuous-learning-v2
---

> ⚠️ **DEPRECATED**: This skill has been superseded by [`continuous-learning-v2`](../continuous-learning-v2/SKILL.md) which offers improved reliability with instinct-based architecture, confidence scoring, and PreToolUse/PostToolUse hooks. Consider migrating to v2 for better pattern extraction.

# Continuous Learning Skill

Automatically evaluates Claude Code sessions on end to extract reusable patterns that can be saved as learned skills.

## When to Activate

- Setting up automatic pattern extraction from Claude Code sessions
- Configuring the Stop hook for session evaluation
- Reviewing or curating learned skills in `~/.claude/skills/learned/`
- Adjusting extraction thresholds or pattern categories
- Comparing v1 (this) vs v2 (instinct-based) approaches

## How It Works

This skill runs as a **Stop hook** at the end of each session:

1. **Session Evaluation**: Checks if session has enough messages (default: 10+)
2. **Pattern Detection**: Identifies extractable patterns from the session
3. **Skill Extraction**: Saves useful patterns to `~/.claude/skills/learned/`

## Configuration

Edit `config.json` to customize:

```json
{
  "min_session_length": 10,
  "extraction_threshold": "medium",
  "auto_approve": false,
  "learned_skills_path": "~/.claude/skills/learned/",
  "patterns_to_detect": [
    "error_resolution",
    "user_corrections",
    "workarounds",
    "debugging_techniques",
    "project_specific"
  ],
  "ignore_patterns": [
    "simple_typos",
    "one_time_fixes",
    "external_api_issues"
  ]
}
```

## Pattern Types

| Pattern | Description |
|---------|-------------|
| `error_resolution` | How specific errors were resolved |
| `user_corrections` | Patterns from user corrections |
| `workarounds` | Solutions to framework/library quirks |
| `debugging_techniques` | Effective debugging approaches |
| `project_specific` | Project-specific conventions |

## Hook Setup

Add to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning/evaluate-session.sh"
      }]
    }]
  }
}
```

## Why Stop Hook?

- **Lightweight**: Runs once at session end
- **Non-blocking**: Doesn't add latency to every message
- **Complete context**: Has access to full session transcript

## Related

- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) - Section on continuous learning
- `/learn` command - Manual pattern extraction mid-session

---

## Comparison Notes (Research: Jan 2025)

### vs Homunculus

Homunculus v2 takes a more sophisticated approach:

| Feature | Our Approach | Homunculus v2 |
|---------|--------------|---------------|
| Observation | Stop hook (end of session) | PreToolUse/PostToolUse hooks (100% reliable) |
| Analysis | Main context | Background agent (Haiku) |
| Granularity | Full skills | Atomic "instincts" |
| Confidence | None | 0.3-0.9 weighted |
| Evolution | Direct to skill | Instincts → cluster → skill/command/agent |
| Sharing | None | Export/import instincts |

**Key insight from homunculus:**
> "v1 relied on skills to observe. Skills are probabilistic—they fire ~50-80% of the time. v2 uses hooks for observation (100% reliable) and instincts as the atomic unit of learned behavior."

### Potential v2 Enhancements

1. **Instinct-based learning** - Smaller, atomic behaviors with confidence scoring
2. **Background observer** - Haiku agent analyzing in parallel
3. **Confidence decay** - Instincts lose confidence if contradicted
4. **Domain tagging** - code-style, testing, git, debugging, etc.
5. **Evolution path** - Cluster related instincts into skills/commands

See: `/Users/affoon/Documents/tasks/12-continuous-learning-v2.md` for full spec.

## Open-Source Benchmarks

Reference projects for `continuous-learning` optimization:

- [BerriAI/litellm](https://github.com/BerriAI/litellm) - Provider routing, fallback, and usage tracking patterns.
- [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) - Prompt/version regression testing and eval automation.

### Optimization Guidance
- Attach model routing decisions to measurable SLOs.
- Version prompts and eval datasets together.
- Capture token and latency budgets in acceptance criteria.

## Acceptance Criteria

- Inputs: Clear task scope, target files/systems, and explicit constraints.
- Outputs: Concrete artifact (code/doc/config/decision) aligned with this skill domain.
- Validation: At least one executable check or deterministic review step is defined and run.
- Done: Result is actionable, non-contradictory with adjacent skills, and mapped to user intent.

## Skill Metadata

- Owner: `easy-opencode-team`
- Version: `1.0.0`
- Last Reviewed: `2026-04-11`
- Stability: `stable`
- Overlap Domain: `llm-ops`

