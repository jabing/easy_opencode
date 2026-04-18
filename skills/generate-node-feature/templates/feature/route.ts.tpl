import { Router } from 'express';
import { build{{pascal_name}}Controller } from '{{import_controller_from_route}}';

export function register{{pascal_name}}Routes(router: Router = Router()): Router {
  const controller = build{{pascal_name}}Controller();

  router.post('/{{kebab_name}}', async (req, res, next) => {
    try {
      const result = await controller.handle(req.body ?? {});
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
