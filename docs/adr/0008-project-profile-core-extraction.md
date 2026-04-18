# ADR 0008: project-profile core extraction

## Status
Accepted

## Context
`project-profile` remained one of the last important legacy cores that still concentrated file walking,
git probing, source summarization, and profile assembly in a single module. That made internal testing
coarse and left the most important profile path only partially aligned with the newer core/cli split.

## Decision
Extract `project-profile` internals into focused modules under `src/core/project-profile/`:

- `files.js` for file walking, target normalization, and related-test discovery
- `git.js` for git state probing
- `summarize.js` for source summarization
- `detect.js` for profile assembly and validation maps

Keep `scripts/project-profile.js` as a compatibility wrapper and keep `src/cli/project-profile-cli.js`
as the only place responsible for terminal output.

## Consequences
Benefits:
- smaller, easier-to-test modules
- less legacy pressure in the main project-profile entrypoint
- better alignment with the batch 5 quality-gate extraction pattern

Trade-offs:
- more files to maintain
- project-profile is still JavaScript with targeted type-check coverage rather than a full TS rewrite
