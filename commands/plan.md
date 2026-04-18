---
description: Create implementation plan with risk assessment
agent: eoc_planner
subtask: true
---

# Plan Command

Create a detailed implementation plan for: $ARGUMENTS

## Your Task

1. **Restate Requirements** - Clarify what needs to be built
2. **Define Scope** - Explicitly list in-scope and out-of-scope
3. **Identify Risks** - Surface blockers, dependencies, and rollback concerns
4. **Create Step Plan** - Break down implementation into milestones with validation steps
5. **Emit Execution Packet** - Provide machine-readable DAG task graph for `/eoc-parallel`
6. **Wait for Confirmation** - MUST receive user approval before proceeding

## Output Format

### Requirements Restatement
[Clear, concise restatement of what will be built]

### Implementation Phases
[Phase 1: Description]
- Step 1.1
- Step 1.2
...

[Phase 2: Description]
- Step 2.1
- Step 2.2
...

### Dependencies
[List external dependencies, APIs, services needed]

### Validation Plan
[How each milestone will be verified]

### Risks
- HIGH: [Critical risks that could block implementation]
- MEDIUM: [Moderate risks to address]
- LOW: [Minor concerns]

### Estimated Complexity
[HIGH/MEDIUM/LOW with time estimates]

### Execution Gate
Plan Status: READY | NEEDS_CLARIFICATION
Blocking Questions: [if any]
First Execution Step: [single concrete action]

### Execution Packet (JSON)
[Must include objective, recommended_concurrency, fast_fail, and task list with id/command/deps/priority/validation]

**WAITING FOR CONFIRMATION**: Proceed with this plan? (yes/no/modify)

---

**CRITICAL**: Do NOT write any code until the user explicitly confirms with "yes", "proceed", or similar affirmative response.
