import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { aiRuntimeModule } from '../../src/routes/sitter-recommendations.routes.js';
import { assertDemoDatabase, demoRoutingProvider, groundedRoutingProvider,
  validateGroundedSnapshot, GROUNDED_ROUTING_SOURCE } from './fixtures.js';

export function createDemoApp({ config, connection, manifest, origin, groundedSnapshot }) {
  const grounded = manifest.mode === 'GROUNDED_PUBLIC_ROADS';
  assertDemoDatabase(connection, grounded);
  if (
    config.nodeEnv !== 'development' ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  )
    throw new Error('Demo requires an explicit loopback development origin');
  if (grounded && origin !== 'http://127.0.0.1:3012') throw new Error('Grounded demo requires port 3012');
  let provider = demoRoutingProvider();
  if (grounded) {
    const snapshot = validateGroundedSnapshot(groundedSnapshot);
    const sha = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    if (sha !== manifest.routingEvidence?.snapshotCanonicalSha256 || manifest.routing !== GROUNDED_ROUTING_SOURCE) {
      throw new Error('Grounded demo manifest does not match captured route evidence');
    }
    provider = groundedRoutingProvider(snapshot);
  } else if (groundedSnapshot !== undefined) throw new Error('Snapshot requires grounded demo mode');
  const app = express(),
    inbox = new Map();
  app.disable('x-powered-by');
  app.use(helmet(), express.json({ limit: '64kb' }));
  app.use((req, res, next) => {
    if (req.headers.host !== new URL(origin).host) return res.sendStatus(403);
    if (grounded) {
      // Cookies are scoped by host/path, not port. Isolate this demo's session
      // from the existing 3011 demo and the local application's pwc_session.
      req.headers.cookie = (req.headers.cookie ?? '').split(';')
        .map(value => value.trim()).filter(value => value.startsWith('pwc_grounded_session='))
        .map(value => value.replace(/^pwc_grounded_session=/, 'pwc_session=')).join('; ');
      const cookie = res.cookie.bind(res);
      res.cookie = (name, ...args) => cookie(name === 'pwc_session' ? 'pwc_grounded_session' : name, ...args);
    }
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin)
      return res.sendStatus(403);
    if (req.path.startsWith('/demo/'))
      res.set('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });
  app.get('/demo/state', (_req, res) => res.json(manifest));
  if (grounded) {
    // This sandbox has no verified care/review history. Do not let demo Admin
    // imports accidentally manufacture training labels or activate a model.
    app.post(['/api/v1/ai/admin/outcomes', '/api/v1/ai/admin/models'], (_req, res) =>
      res.status(403).json({ error: { code: 'GROUNDED_DEMO_NO_TRAINING_IMPORT' } }));
  }
  app.get('/demo/inbox/:key', (req, res) => {
    const account = manifest.accounts.find((a) => a.key === req.params.key);
    const item = account && inbox.get(account.email);
    if (!item || Date.parse(item.expiresAt) <= Date.now())
      return res.status(404).json({ error: 'No current demo message' });
    res.json(item);
  });
  app.use(
    express.static(
      fileURLToPath(new URL('../../../frontend/demo-ai/', import.meta.url))
    )
  );
  const runtimeConfig = { ...config, ai: { enabled: false } };
  const backend = createApp({
    config: runtimeConfig,
    connection,
    env: { EMAIL_ENABLED: 'false', SMS_ENABLED: 'false' },
    portOverrides: {
      contactDelivery: {
        send: async (message) => {
          if (
            !manifest.accounts.some((a) => a.email === message.to) ||
            message.channel !== 'EMAIL' ||
            message.kind !== 'OTP'
          )
            return { status: 'FAILED', code: 'DEMO_RECIPIENT_ONLY' };
          inbox.set(message.to, {
            code: message.code,
            expiresAt: message.expiresAt,
            purpose: message.purpose
          });
          return { status: 'ACCEPTED', code: 'DEMO_LOCAL_INBOX' };
        }
      }
    },
    moduleFactories: [
      (context) =>
        aiRuntimeModule({
          ...context,
          config,
          routingProvider: provider
        })
    ]
  });
  app.use('/api/v1/ai', (_req, res, next) => {
    res.set('X-PWC-Demo-Routing', grounded ? GROUNDED_ROUTING_SOURCE : 'SIMULATED_NOT_OSRM');
    const json = res.json.bind(res);
    res.json = (payload) => {
      // Keep production services untouched; label this wrapper's fixture responses.
      if (payload?.data?.routingSource)
        payload.data.routingSource = grounded ? GROUNDED_ROUTING_SOURCE : 'DEMO_SIMULATED_NOT_OSRM';
      if (payload?.meta) {
        payload.meta.demoFixture = true;
        if (grounded) payload.meta.routingEvidence = manifest.routingEvidence;
      }
      return json(payload);
    };
    next();
  });
  app.use(backend);
  return app;
}
