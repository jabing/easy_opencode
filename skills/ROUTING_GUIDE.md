# Skills Routing Guide

This guide reduces overlap by defining preferred routing by domain.

## Primary Routing

- `api-design` -> API contract/versioning/pagination decisions
- `backend-patterns` -> service/repository/business logic structure
- `frontend-patterns` -> UI state/rendering/accessibility/perf
- `security-review` -> app/API security controls and hardening
- `security-scan` -> automated vuln/secrets/dependency scanning
- `tdd-workflow` -> cross-stack RED/GREEN/REFACTOR workflow
- `e2e-testing` -> browser/user-journey test strategy
- `database-migrations` -> schema evolution and rollback safety
- `deployment-patterns` -> runtime rollout, rollback, SLO operations
- `eval-harness` -> LLM/systematic eval and regression checks

## Overlap Arbitration

When two skills could apply, use this precedence:

1. Security-critical requests: `security-review` first.
2. Test-first implementation: `tdd-workflow` first, then language/framework testing skill.
3. API changes: `api-design` before framework-specific implementation skill.
4. Architecture disputes: choose domain pattern skill over generic coding standards.

## Merge Candidates (Long-Term)

Potential consolidation opportunities:

- `django-tdd`, `springboot-tdd`, `golang-testing`, `python-testing` -> keep framework specifics but share one common TDD contract.
- `security-review` and `security-scan` -> keep separate intent, cross-link explicitly.
- `verification-loop`, `eval-harness`, `continuous-learning*` -> clarify boundaries and handoff order.
