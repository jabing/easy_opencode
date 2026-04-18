# Integration Guide: {{subject}}

Generated files:
- app/routers/{{snake_name}}.py
- app/services/{{snake_name}}_service.py
- app/routers/{{snake_name}}_wiring.py
- tests/test_{{snake_name}}.py
- docs/api/{{snake_name}}.md

Suggested next wiring steps:
1. Import `mount_{{snake_name}}` from `app.routers.{{snake_name}}_wiring`.
2. Call `mount_{{snake_name}}(app)` from your FastAPI bootstrap.
3. Verify the route responds on `{{route_path}}`.
