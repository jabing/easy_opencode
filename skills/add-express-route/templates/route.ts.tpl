import { Router } from 'express';
import { build{{pascal_name}}Payload } from '../services/{{kebab_name}}.service';

const router = Router();

router.get('{{route_path}}', (_req, res) => {
  res.json(build{{pascal_name}}Payload());
});

export default router;
