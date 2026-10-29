import { createAdminDashboardRouter } from '../../src/routes/admin-dashboard.routes.js';
import { createCustomerDashboardRouter } from '../../src/routes/customer-dashboard.routes.js';
import { createSitterDashboardRouter } from '../../src/routes/sitter-dashboard.routes.js';
import { createStaffDashboardRouter } from '../../src/routes/staff-dashboard.routes.js';
import { createSitterProfileRouter } from '../../src/routes/sitter-profile.routes.js';
import { createSitterListRouter } from '../../src/routes/sitter-list.routes.js';
import { test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createEarningsRouter } from '../../src/routes/earnings.routes.js';
import { createEarningsService } from '../../src/services/dashboards/earnings.service.js';
import { createPayrollRouter } from '../../src/routes/payroll.routes.js';
import { createPayrollService } from '../../src/services/dashboards/payroll.service.js';
// Real Express/session/role/service boundaries, synthetic sessions; no live DB claim.
function build(roles, payroll = false) {
  const api = express();
  const sessionPort = { authenticate: async () => roles ? { userId: 'a'.repeat(24), sessionId: 'session',
    state: 'ACTIVE', roles, expiresAt: Date.now() + 3600000 } : null };
  api.use('/api/v1', payroll ? createPayrollRouter({ sessionPort, service: createPayrollService() })
    : createEarningsRouter({ sessionPort, service: createEarningsService() }));
  api.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code } }));
  return api;
}
test('unauthenticated 401; Staff/Admin may not read sitter earnings', async () => {
  await request(build(null)).get('/api/v1/me/earnings').expect(401);
  for (const role of ['STAFF', 'ADMIN', 'CUSTOMER']) await request(build([role])).get('/api/v1/me/earnings').expect(403);
});
test('pending is 202 null with no-store; repeat GET has no mutation', async () => {
  const api = build(['PET_SITTER']);
  for (let i = 0; i < 2; i++) {
    const response = await request(api).get('/api/v1/me/earnings').expect(202);
    expect(response.body.data).toBeNull();
    expect(response.headers['cache-control']).toBe('private, no-store');
  }
});
test('payroll only allows Admin and validates query', async () => {
  await request(build(['STAFF'], true)).get('/api/v1/payroll').expect(403);
  await request(build(['ADMIN'], true)).get('/api/v1/payroll').expect(202);
  await request(build(['ADMIN'], true)).get('/api/v1/payroll?sitterId=another').expect(422);
});

test.each([
  [createAdminDashboardRouter, 'ADMIN', '/dashboards/admin'],
  [createCustomerDashboardRouter, 'CUSTOMER', '/dashboards/customer'],
  [createSitterDashboardRouter, 'PET_SITTER', '/dashboards/sitter'],
  [createStaffDashboardRouter, 'STAFF', '/dashboards/staff'],
  [createSitterProfileRouter, 'PET_SITTER', '/me/sitter-profile'],
  [createSitterListRouter, 'CUSTOMER', '/sitters']
])('router %s uses session/role gates before reads', async (factory, role, path) => {
  const api = express();
  let roles = null;
  const service = { read: jest.fn(async () => ({ pending: true })) };
  const sessionPort = { authenticate: async () => roles && ({ userId: 'a'.repeat(24), state: 'ACTIVE', roles,
    expiresAt: Date.now() + 3600000 }) };
  api.use('/api/v1', factory({ service, sessionPort }));
  api.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code } }));
  await request(api).get('/api/v1' + path).expect(401);
  expect(service.read).not.toHaveBeenCalled();
  roles = [role];
  await request(api).get('/api/v1' + path).expect(202);
  expect(service.read).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: 'a'.repeat(24) }) }));
});
