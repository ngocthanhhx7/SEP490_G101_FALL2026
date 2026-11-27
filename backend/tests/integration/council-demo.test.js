import { afterAll, beforeAll, expect, test } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ACCOUNT_ROLES } from '../../src/constants/account-roles.js';
import { COUNCIL_ORIGIN, COUNCIL_OTP, createCouncilDemo } from '../../scripts/council-demo/runtime.js';

let demo;
const host = new URL(COUNCIL_ORIGIN).host;

beforeAll(async () => { demo = await createCouncilDemo(); }, 600000);
afterAll(async () => { await demo?.close(); }, 30000);

test.each(ACCOUNT_ROLES)('%s signs in through the standard OTP API and gets the intended role', async role => {
  const { email } = demo.accounts.find(account => account.role === role);
  const agent = request.agent(demo.app);
  const identity = { channel: 'EMAIL', contact: email, purpose: 'LOGIN' };
  const challenge = await agent.post('/api/v1/otp-challenges').set('Host', host).send(identity).expect(202);
  const attempt = { ...identity, challengeId: challenge.body.data.challengeId };
  expect(challenge.text).not.toContain(COUNCIL_OTP);
  await agent.post('/api/v1/otp-challenges').set('Host', host).send(identity).expect(429);
  await agent.post('/api/v1/sessions').set('Host', host).send({ ...attempt, code: '111111' }).expect(400);
  const signedIn = await agent.post('/api/v1/sessions').set('Host', host).send({ ...attempt, code: COUNCIL_OTP }).expect(200);
  expect(signedIn.body.data).toMatchObject({ authenticated: true, user: { roles: [role] } });
  const profile = await agent.get('/api/v1/me').set('Host', host).expect(200);
  expect(profile.body.data.user.roles).toEqual([role]);
  if (role === 'CUSTOMER') await agent.get('/api/v1/users').set('Host', host).expect(403);
  await agent.post('/api/v1/sessions').set('Host', host).send({ ...attempt, code: COUNCIL_OTP }).expect(400);
  await agent.delete('/api/v1/sessions/current').set('Host', host).set('Origin', COUNCIL_ORIGIN)
    .set('X-CSRF-Token', signedIn.body.data.csrfToken).expect(204);
  await agent.get('/api/v1/me').set('Host', host).expect(401);
});

test('rejects an unrelated login and isolates the demo HTTP origin', async () => {
  await request(demo.app).get('/ready').set('Host', 'pawworldvn.shop').expect(403);
  await request(demo.app).get('/ready').set('Host', host).set('Origin', 'https://outside.example').expect(403);
  await request(demo.app).post('/api/v1/otp-challenges').set('Host', host)
    .send({ channel: 'EMAIL', contact: 'someone@outside.example', purpose: 'LOGIN' }).expect(409);
  expect(() => createApp({
    config: { nodeEnv: 'production', host: '127.0.0.1', database: 'pwc_council_demo' },
    connection: { host: '127.0.0.1', name: 'pwc_council_demo' },
    createOtpCode: () => COUNCIL_OTP
  })).toThrow('Custom OTP generation requires the local council demo');
});
