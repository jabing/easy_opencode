# Test Matrix

This matrix makes the release-critical path explicit and maps each capability to automated coverage.

## Release-critical coverage

| Capability | Primary tests | Coverage type | Release-critical |
| --- | --- | --- | --- |
| Skill matching | `tests/scaffold-bundles.test.js`, `tests/external-project-fixtures.test.js` | black-box CLI | yes |
| Scaffold bundle output | `tests/scaffold-bundles.test.js`, `tests/external-project-fixtures.test.js` | black-box CLI | yes |
| Runtime-aware verify convergence | `tests/verify-suggestions.test.js`, `tests/external-project-fixtures.test.js` | unit + black-box CLI | yes |
| Project profile detection | `tests/project-profile.test.js`, `tests/project-profile-runtimes.test.js`, `tests/external-project-fixtures.test.js` | unit + black-box CLI | yes |
| Quality gate | `tests/quality-review-gate.test.js`, `tests/external-project-fixtures.test.js` | black-box CLI | yes |
| Review gate | `tests/quality-review-gate.test.js` | black-box CLI | yes |
| Release check | `tests/release-readiness.test.js`, `tests/release-override-constraints.test.js`, `tests/external-project-fixtures.test.js` | black-box CLI | yes |
| Release evidence | `tests/release-evidence-overrides.test.js`, `tests/batch10-audit-summary-alignment.test.js` | black-box CLI | yes |
| Release rehearsal | `tests/release-evidence-overrides.test.js`, `tests/release-rehearsal.test.js` | black-box CLI | yes |
| Release override controls | `tests/release-override-constraints.test.js`, `tests/release-evidence-overrides.test.js` | black-box CLI | yes |
| Benchmark baseline lifecycle | `tests/benchmark-baselines.test.js` | black-box CLI | yes |
| Benchmark approval / retention | `tests/baseline-approval-retention.test.js` | black-box CLI | yes |
| Benchmark freshness policy | `tests/benchmark-freshness-policy.test.js` | black-box CLI | yes |
| Benchmark archive / preset behavior | `tests/benchmark-suite-presets.test.js`, `tests/benchmark-baselines.test.js` | black-box CLI | yes |
| Publish/package hygiene | `tests/pack-check.test.js`, `tests/package-hygiene.test.js` | black-box CLI | yes |
| Production preflight aggregator | `tests/preflight-production.test.js`, `tests/batch10-audit-summary-alignment.test.js` | black-box CLI | yes |
| Release audit export | `tests/release-audit-export.test.js`, `tests/batch10-audit-summary-alignment.test.js` | black-box CLI | no |

## Runtime fixture regression coverage

| Fixture shape | Covered by | Assertions |
| --- | --- | --- |
| Node API | `tests/external-project-fixtures.test.js` | profile detection, scaffold dry-run, verify suggestions, quality gate, release-check |
| Python service | `tests/external-project-fixtures.test.js` | profile detection, scaffold dry-run, verify suggestions, quality gate, release-check |
| Go service | `tests/external-project-fixtures.test.js` | profile detection, scaffold dry-run, verify suggestions, quality gate, release-check |
| Java / Spring | `tests/external-project-fixtures.test.js` | profile detection, scaffold dry-run, verify suggestions, quality gate, release-check |

## Test levels

- Unit: narrow library logic such as verify suggestion filtering and direct project profile helpers.
- Black-box CLI: script-level validation through the public command entrypoints.
- Release-critical: required to keep `npm run preflight:production` meaningful for production release decisions.

## Production release expectation

Before a production release, these commands are expected to pass together:

- `npm run check:metadata`
- `npm run syntax-check`
- `npm run typecheck`
- `npm run check:repo`
- `npm test`
- `npm run quality-gate:json`
- `npm run release:check:json -- --policy production`
- `npm run release:evidence:json -- --policy production`
- `npm run preflight:production`

Compatibility aliases remain available for existing automation:

- `npm run lint` → `check:metadata` + `syntax-check`
- `npm run build` → `check:repo` + `npm pack --dry-run`

## Test stability evidence

- `npm run test:stability -- --repeat 5 --temp-copy` is the repeatable proof point for unified test entry stability.
