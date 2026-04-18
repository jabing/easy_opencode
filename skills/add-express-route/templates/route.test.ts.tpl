import express from 'express';
import request from 'supertest';
import { mount{{pascal_name}}Route } from '../../src/routes/{{kebab_name}}.mount';

describe('{{camel_name}} route', () => {
  it('responds on {{route_path}}', async () => {
    const app = express();
    mount{{pascal_name}}Route(app);

    const response = await request(app).get('{{route_path}}');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, route: '{{route_path}}' });
  });
});
