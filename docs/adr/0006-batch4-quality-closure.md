# ADR 0006: Batch 4 quality closure without over-expansion

## Status
Accepted

## Context
After batches 1-3, the plugin had stronger layering, real targeted type checking, and a minimal shared rule engine. The remaining quality gaps blocking an 8+ coding score were concentrated in four areas:

1. fragmented error handling,
2. direct external process execution patterns,
3. weak execution observability, and
4. limited explicit test-layer guidance.

A full platform rewrite would be excessive for this stage.

## Decision
Batch 4 closes the gap with a narrow scope:

- introduce a small shared error model for validation and external command failures,
- centralize command execution through the shared process runner,
- attach lightweight execution metrics for command duration, timeout, and truncation,
- strengthen test-runner output structure without changing the overall test strategy,
- keep legacy large scripts working through compatibility wrappers rather than broad rewrites.

## Consequences
### Positive
- clearer operational failures,
- safer and more uniform external command execution,
- better debuggability through duration/timeout/truncation signals,
- improved maintainability without widening the refactor blast radius.

### Trade-offs
- the repository still contains legacy scripts outside the stricter path,
- observability remains file/CLI-oriented instead of becoming a full telemetry system.
