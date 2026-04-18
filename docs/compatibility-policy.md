# Compatibility and deprecation policy

## Lifecycle states

- `active`: primary supported command surface
- `stable`: supported and backward-compatible for automation consumers
- `deprecated`: still available for compatibility, but must declare a replacement

## Compatibility classes

- `stable`: JSON contract and CLI behavior are expected to remain compatible
- `compatibility`: supported only as a migration bridge; use the declared replacement
- `internal`: not a public compatibility commitment

## Enforcement

- Public commands with `supports_json=true` must declare a `contract_name`
- Declared contracts must exist in `src/shared/contracts.js`
- Deprecated commands must declare a replacement
- Registry validation is enforced through `node scripts/command-registry.js validate`
