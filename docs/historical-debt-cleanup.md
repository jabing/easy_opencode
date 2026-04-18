# Historical debt cleanup audit

Generated at: 2026-04-14T20:37:49.651Z

## Deletion candidates

- analyze-project-structure: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- benchmark-feedback: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- capability-registry: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- debug-fix-loop: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- enrich-implementation-context: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- model-route: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- orchestrator-state: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- prepare-implementation-context: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- release-override: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- safe-apply: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- skill-runner: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes
- sync-project-memory: replacement=internal-tools, thin_wrapper=yes, can_delete_after_alias_migration=yes

## Recommended internal-tools domains

- project: analyze-project-structure, sync-project-memory
- context: prepare-implementation-context, enrich-implementation-context
- debug: debug-fix-loop
- routing: model-route
- orchestrator: orchestrator-state
- benchmark: benchmark-feedback
- skills: capability-registry, skill-runner
- release: release-override, safe-apply
