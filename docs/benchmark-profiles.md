# Benchmark Profiles

These are the formal benchmark profiles intended to thicken release evidence rather than add more policy complexity.

## Profiles

| Profile | Target shape | Main evidence purpose |
| --- | --- | --- |
| `node-api` | Express or Node API projects | Route, service, and config path stability |
| `python-service` | FastAPI or Python service projects | Endpoint, test, and model coverage |
| `go-service` | Go service projects | Handler and test coverage |
| `java-service` | Java or Spring service projects | Controller and service-module coverage |
| `plugin-self-release` | This plugin repository | Self-release critical path regression watch |

## How to sample

Generated sample suites now materialize runnable case roots from the directory where you invoke the command, so the JSON can be saved elsewhere and still point back to the benchmark fixtures shipped in this repository.

```bash
node scripts/benchmark-suite.js sample --preset node-api
node scripts/benchmark-suite.js sample --preset python-service
node scripts/benchmark-suite.js sample --preset go-service
node scripts/benchmark-suite.js sample --preset java-service
node scripts/benchmark-suite.js sample --preset plugin-self-release
```

For Go and Java profiles, the shipped sample cases are scaffold-oriented by default and set `no-validate` so they remain runnable even in environments without local Go or Maven/Gradle toolchains.

## Evidence expectations

- Keep multiple runs per profile rather than a single release snapshot.
- Compare current runs against approved baselines when shipping production releases.
- Use trend windows, not only the latest two-run comparison, when judging stability.
- Treat profile drift as a signal to refresh the benchmark fixture, not to weaken release policy.


## Canonical benchmark baseline naming

Prefer policy-scoped names so release flows can resolve baselines without guessing:

- `release.node-api.production`
- `release.python-service.production`
- `release.go-service.production`
- `release.java-service.production`
- `release.plugin-self-release.production`

The release pipeline now emits the recommended baseline name and fallback candidates in `release-check` and `release-evidence`.
