# Bootstrap Flow

`eoc bootstrap` is the explicit detect -> recommend -> apply -> verify flow for ecosystem defaults.

## Preview

Preview is the default behavior.

Examples:

```bash
eoc bootstrap --json
eoc bootstrap --preset node-team --json
eoc bootstrap --bundle release-governance --json
```

Preview returns:

- selected presets
- selected bundles
- recommended presets
- recommended bundles
- resolved effective bundle plan
- verification summary showing that nothing was persisted

## Apply

Apply writes managed ecosystem intent to `.opencode/ecosystem.json`.

Examples:

```bash
eoc bootstrap --apply --preset node-team --json
eoc bootstrap --apply --bundle release-governance --json
```

Apply returns:

- the resolved bundle plan
- persisted state summary
- verification metadata confirming managed state was written

## Install Integration

Installer bootstrap reuses the same resolution path:

```bash
eoc-install --project --yes --bootstrap --preset node-team
eoc-install --project --yes --bootstrap --bundle release-governance
```

## Doctor Handoff

`eoc doctor --bootstrap` stays diagnostics-first.

It runs the normal doctor checks, then appends a bootstrap preview step. It does not pass `--apply`, so it cannot mutate managed ecosystem state.
