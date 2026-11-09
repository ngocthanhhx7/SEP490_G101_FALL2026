import { test, expect, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { petRecordImportModule } from '../../src/routes/pet-record-import.routes.js';
import { createPetRecordImport } from '../../src/services/pet-record-import.service.js';
import { requireSession, requireCsrf } from '../../src/middlewares/session.js';
const bytes = Buffer.from('%PDF-1.7\nfixture\n%%EOF');
function setup() {
  const fetchImpl = jest.fn(), service = createPetRecordImport({ config: { enabled: false, model: 'gemini-3.1-flash-lite' }, fetchImpl });
  const session = { authenticate: async req => req.get('X-Test-Role') ? { userId: 'a'.repeat(24), roles: [req.get('X-Test-Role')], state: 'ACTIVE', expiresAt: Date.now() + 60000 } : null, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'pwc_record_test' });
  const app = createApp({ config, env: {}, lifecycle: { draining: false }, moduleFactories: [() => petRecordImportModule({ requireAuthenticated: requireSession(session), csrf: requireCsrf(session), service })] });
  return { app, fetchImpl };
}
test('record metadata is private Customer-only; default disabled leaks neither key nor provider data', async () => {
  const { app, fetchImpl } = setup();
  await request(app).get('/api/v1/pet-record-import').expect(401);
  await request(app).get('/api/v1/pet-record-import').set('X-Test-Role', 'ADMIN').expect(403);
  const response = await request(app).get('/api/v1/pet-record-import').set('X-Test-Role', 'CUSTOMER').expect(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.body.data).toEqual({ enabled: false, model: 'gemini-3.1-flash-lite', maxBytes: 5 * 1024 * 1024 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('binary extraction rejects missing session, wrong role and CSRF before work; disabled mode never calls Google', async () => {
  const { app, fetchImpl } = setup();
  const post = headers => request(app).post('/api/v1/pet-record-import').set({ Host: '127.0.0.1', Origin: 'http://127.0.0.1', 'Content-Type': 'application/pdf', ...headers }).send(bytes);
  await post({}).expect(401);
  await post({ 'X-Test-Role': 'STAFF' }).expect(403);
  await post({ 'X-Test-Role': 'CUSTOMER' }).expect(403);
  await post({ 'X-Test-Role': 'CUSTOMER', 'X-CSRF-Token': 'synthetic-csrf', 'X-Pet-Record-Consent': 'google-gemini' }).expect(503);
  expect(fetchImpl).not.toHaveBeenCalled();
});
