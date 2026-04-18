import { Router } from 'express';
import { build{{pascal_name}}Controller } from '{{import_controller_from_route}}';
{{runtime_schema_import}}
{{route_service_error_import}}

export function register{{pascal_name}}Routes(router: Router = Router()): Router {
  const controller = build{{pascal_name}}Controller();

  router.post('{{route_path}}', async (req, res, next) => {
    try {
{{auth_guard_block}}
      {{payload_binding_statement}}
      const result = await controller.handle(payload);
{{route_response_statement}}
    } catch (error) {
{{route_error_handler_statement}}
    }
  });

  return router;
}
