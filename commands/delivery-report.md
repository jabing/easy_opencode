---
description: Generate a delivery summary, PR body, and teammate handoff from the latest implementation state
agent: eoc_orchestrator
subtask: true
---

# Delivery Report Command

Generate delivery artifacts from the latest implementation plan, coder-loop state, review-gate result, and git diff: $ARGUMENTS

## What it does

1. Loads the latest implementation plan unless `--plan-id` is provided
2. Reads the latest coder-loop run and review-gate report when available
3. Summarizes changed files, diff stat, review posture, and current delivery risk from git / review-gate
4. Writes artifacts to:
   - `.opencode/delivery/latest.json`
   - `.opencode/delivery/latest.md`
   - `.opencode/delivery/pr-body.md`
   - `.opencode/delivery/handoff.md`
   - `.opencode/delivery/advice.md`
   - `.opencode/delivery/advice.json`
5. Produces both a PR body draft and a teammate handoff summary

## Recommended usage

```bash
node bin/eoc-script.js delivery-report report
```

Machine-readable output:

```bash
node bin/eoc-script.js delivery-report report --json
```

Additional views:

```bash
node bin/eoc-script.js delivery-report pr-body
node bin/eoc-script.js delivery-report handoff
node bin/eoc-script.js delivery-report advice
```

## Output expectations

Return:

- objective and selected skill
- scaffolded outputs
- validation and failure-strategy state
- merge verdict / blockers / follow-ups
- delivery posture, automatic delivery recommendation, execution policy, and review posture
- changed files and diff summary
- suggested next steps
