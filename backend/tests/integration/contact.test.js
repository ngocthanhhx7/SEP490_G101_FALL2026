import { expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { contactModule } from '../../src/routes/contact.routes.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { loadConfig } from '../../src/config/environment.js';
const valid = { name: 'Synthetic Visitor', email: 'visitor@example.test', phone: '',
  topic: 'BOOKING', message: 'Synthetic question about caring for a pet.', consent: true };
function app({ inbox = 'project@example.test', result = { status: 'ACCEPTED' } } = {}) {
  const send = jest.fn(async () => result);
  const instance = express(); instance.use(requestId, express.json());
  const module = contactModule({ config: { contactInbox: inbox }, ports: { notificationDelivery: { send } } });
  instance.use(module.mount, module.router); instance.use(errorHandler(() => {}));
  return { instance, send };
}
test('sends only to the configured project inbox and confirms provider acceptance without exposing contact data', async () => {
  const { instance, send } = app();
  const response = await request(instance).post('/api/v1/contact/messages').send(valid).expect(202);
  expect(response.body.data).toEqual({ status: 'ACCEPTED' });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(JSON.stringify(response.body)).not.toContain(valid.email);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({ kind: 'SYSTEM', channel: 'EMAIL', to: 'project@example.test' });
  expect(send.mock.calls[0][0].message).toContain(valid.message);
});
test.each([
  { ...valid, to: 'attacker@example.test' }, { ...valid, consent: false },
  { ...valid, email: 'invalid' }, { ...valid, name: 'Header\r\nBcc: other@example.test' },
  { ...valid, phone: '<script>' }, { ...valid, message: 'x'.repeat(3001) },
  { ...valid, topic: '__proto__' }, { ...valid, message: 'short' },
])('rejects invalid or unconsented contact payload %# without sending', async body => {
  const { instance, send } = app();
  await request(instance).post('/api/v1/contact/messages').send(body).expect(422);
  expect(send).not.toHaveBeenCalled();
});
test('blocks cross-site requests and limits requests to three per IP per hour', async () => {
  const cross = app();
  await request(cross.instance).post('/api/v1/contact/messages').set('Origin', 'https://outside.example').send(valid).expect(403);
  expect(cross.send).not.toHaveBeenCalled();
  const { instance, send } = app();
  for (let i = 0; i < 3; i++) await request(instance).post('/api/v1/contact/messages').send(valid).expect(202);
  await request(instance).post('/api/v1/contact/messages').send(valid).expect(429);
  expect(send).toHaveBeenCalledTimes(3);
});
test('fails closed without an inbox and distinguishes uncertain SMTP outcome', async () => {
  const missing = app({ inbox: null });
  await request(missing.instance).post('/api/v1/contact/messages').send(valid).expect(503);
  expect(missing.send).not.toHaveBeenCalled();
  const failed = app({ result: { status: 'FAILED', uncertain: true } });
  const result = await request(failed.instance).post('/api/v1/contact/messages').send(valid).expect(503);
  expect(result.body.error.code).toBe('CONTACT_DELIVERY_UNCERTAIN');
});
test('validates optional inbox configuration without requiring a live provider', () => {
  const env = { NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1/test', MONGO_DB: 'synthetic_contact' };
  expect(loadConfig(env).contactInbox).toBe(null);
  expect(loadConfig({ ...env, CONTACT_INBOX_EMAIL: 'project@example.test' }).contactInbox).toBe('project@example.test');
  expect(() => loadConfig({ ...env, CONTACT_INBOX_EMAIL: 'invalid' })).toThrow('CONTACT_INBOX_EMAIL');
});
