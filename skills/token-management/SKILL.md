# Token Management Skill  

## When to Activate

- Trigger this skill when the request clearly matches this skill's domain.
- Use this skill before writing implementation details outside its scope.
- If multiple skills overlap, follow `skills/ROUTING_GUIDE.md` precedence rules.

  
智能 token 管理和自动压缩系统

## Open-Source Benchmarks

Reference projects for `token-management` optimization:

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

