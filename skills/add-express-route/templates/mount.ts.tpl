import type { Express } from 'express';
import router from './{{kebab_name}}';

export function mount{{pascal_name}}Route(app: Express) {
  app.use(router);
}
