# Integration Guide: {{subject}}

Generated files:
- internal/http/{{snake_name}}.go
- internal/http/{{snake_name}}_routes.go
- internal/http/{{snake_name}}_test.go
- docs/http/{{snake_name}}.md

Suggested next wiring steps:
1. Call `Register{{pascal_name}}Routes` from your router bootstrap.
2. Confirm the handler is reachable on `{{route_path}}`.
3. Run `go test ./...`.
