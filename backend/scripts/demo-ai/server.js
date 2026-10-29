import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../src/app.js';
import { aiRuntimeModule } from '../../src/routes/sitter-recommendations.routes.js';
import { assertDemoDatabase, demoRoutingProvider } from './fixtures.js';

export function createDemoApp({ config, connection, manifest, origin }) {
  assertDemoDatabase(connection);
  if (
    config.nodeEnv !== 'development' ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  )
    throw new Error('Demo requires an explicit loopback development origin');
  const app = express(),
    inbox = new Map();
  app.disable('x-powered-by');
  app.use(helmet(), express.json({ limit: '64kb' }));
  app.use((req, res, next) => {
    if (req.headers.host !== new URL(origin).host) return res.sendStatus(403);
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin)
      return res.sendStatus(403);
    if (req.path.startsWith('/demo/'))
      res.set('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });
  app.get('/demo/state', (_req, res) => res.json(manifest));
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
          routingProvider: demoRoutingProvider()
        })
    ]
  });
  app.use('/api/v1/ai', (_req, res, next) => {
    res.set('X-PWC-Demo-Routing', 'SIMULATED_NOT_OSRM');
    const json = res.json.bind(res);
    res.json = (payload) => {
      // Keep production services untouched; label this wrapper's fixture responses.
      if (payload?.data?.routingSource)
        payload.data.routingSource = 'DEMO_SIMULATED_NOT_OSRM';
      if (payload?.meta) payload.meta.demoFixture = true;
      return json(payload);
    };
    next();
  });
  app.use(backend);
  return app;
}
