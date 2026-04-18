# Integration Guide: {{subject}}

Generated files:
- src/routes/{{kebab_name}}.ts
- src/services/{{kebab_name}}.service.ts
- src/routes/{{kebab_name}}.mount.ts
- tests/routes/{{kebab_name}}.test.ts
- docs/api/{{kebab_name}}.md

Suggested next wiring steps:
1. Import `mount{{pascal_name}}Route` from `src/routes/{{kebab_name}}.mount`.
2. Mount it inside your Express bootstrap with the target app/router instance.
3. Verify the route responds on `{{route_path}}`.
