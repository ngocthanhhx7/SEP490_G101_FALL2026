import express from 'express';
import request from 'supertest';
import { test, expect } from '@jest/globals';
import { dashboardReadRuntimeModule } from '../../src/routes/dashboard-runtime.routes.js';

function build(roles) {
  const sessionService = {
    authenticate: async () => roles ? { userId: 'runtime-user', sessionId: 'session',
      state: 'ACTIVE', roles, expiresAt: Date.now() + 3600000 } : null
  };
  const module = dashboardReadRuntimeModule({
    config: { auth: { enabled: true } }, connection: {}, sessionService
  });
  const api = express();
  api.use(module.mount, module.router);
  api.use((error, _req, res, _next) => res.status(error.status ?? 500)
    .json({ error: { code: error.code } }));
  return api;
}

test('runtime registry mounts every P28 read path and keeps unavailable sources pending', async () => {
  const routes = [
    ['/api/v1/dashboards/admin', ['ADMIN']],
    ['/api/v1/dashboards/customer', ['CUSTOMER']],
    ['/api/v1/dashboards/sitter', ['PET_SITTER']],
    ['/api/v1/dashboards/staff', ['STAFF']],
    ['/api/v1/me/sitter-profile', ['PET_SITTER']],
    ['/api/v1/sitters', ['CUSTOMER']],
    ['/api/v1/me/earnings', ['PET_SITTER']],
    ['/api/v1/payroll', ['ADMIN']]
  ];
  for (const [path, roles] of routes) {
    const response = await request(build(roles)).get(path).expect(202);
    expect(response.body.data).toBeNull();
    expect(response.body.meta.integration).toBe('INTEGRATION_PENDING');
    expect(response.headers['cache-control']).toBe('private, no-store');
  }
});

test('runtime registry keeps role and authentication gates before repository access', async () => {
  await request(build(null)).get('/api/v1/me/earnings').expect(401);
  await request(build(['CUSTOMER'])).get('/api/v1/me/earnings').expect(403);
  await request(build(['STAFF'])).get('/api/v1/payroll').expect(403);
});
