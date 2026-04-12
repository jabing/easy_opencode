# Skill Upstream Audit (2026-04-11)

## Goal

Find GitHub upstream sources for local skills and sync to latest available upstream where possible.

## Upstream Sources Used

- `affaan-m/everything-claude-code`  
  Commit: `125d5e619905d97b519a887d5bc7332dcc448a52`
- `nextlevelbuilder/ui-ux-pro-max-skill`  
  Commit: `b7e3af80f6e331f6fb456667b82b12cade7c9d35`

## Sync Result

- Local skills total: `51`
- Synced to `affaan-m/everything-claude-code`: `47`
- Kept on other source or custom track: `4`

### Synced (47)

`api-design`, `backend-patterns`, `clickhouse-io`, `coding-standards`, `configure-ecc`, `content-hash-cache-pattern`, `continuous-learning-v2`, `cost-aware-llm-pipeline`, `cpp-coding-standards`, `cpp-testing`, `database-migrations`, `deployment-patterns`, `django-patterns`, `django-security`, `django-tdd`, `django-verification`, `docker-patterns`, `e2e-testing`, `eval-harness`, `foundation-models-on-device`, `frontend-patterns`, `golang-patterns`, `golang-testing`, `iterative-retrieval`, `java-coding-standards`, `jpa-patterns`, `nutrient-document-processing`, `plankton-code-quality`, `postgres-patterns`, `python-patterns`, `python-testing`, `regex-vs-llm-structured-text`, `search-first`, `security-review`, `security-scan`, `skill-stocktake`, `springboot-patterns`, `springboot-security`, `springboot-tdd`, `springboot-verification`, `strategic-compact`, `swift-actor-persistence`, `swift-concurrency-6-2`, `swift-protocol-di-testing`, `swiftui-patterns`, `tdd-workflow`, `verification-loop`

### Not Matched to `everything-claude-code` (4)

- `claude-public-tooling` (local custom)
- `openspec-workflow` (local custom)
- `superpowers-workflow` (local custom)
- `ui-ux-pro-max` (synced from dedicated upstream repo above)

## Additional Cleanup Applied

- Removed deprecated/duplicate skills: `continuous-learning`, `token-management`, `project-guidelines-example`, `visa-doc-translate`, `liquid-glass-design`, `vue-bigscreen-elite`
- Updated cross-skill references to `continuous-learning-v2`

## Notes

- This audit is content-sync based for same-name skills.
- “Latest” here means latest state of the referenced upstream default branch at audit time.
