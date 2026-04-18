import { z } from 'zod';

export const {{pascal_name}}PayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
}).catchall(z.unknown());

export type {{pascal_name}}Payload = z.infer<typeof {{pascal_name}}PayloadSchema>;
