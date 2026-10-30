// Launch only by explicit command, never imported by src/server.js.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { loadConfig } from '../src/config/environment.js';
import { connectDatabase } from '../src/config/database.js';
import { seedDemo, DEMO_DATABASE, GROUNDED_DEMO_DATABASE, validateGroundedSnapshot } from './demo-ai/fixtures.js';
import { createDemoApp } from './demo-ai/server.js';

const grounded = process.argv.includes('--grounded');
const snapshotIndex = process.argv.indexOf('--snapshot');
if (
  !process.argv.includes('--apply') ||
  process.env.NODE_ENV === 'production'
) {
  console.log(
    'Explicit local demo: node scripts/demo-ai.js --apply; grounded: --grounded --apply --snapshot PATH (separate DB, ports 3011/3012, no real email/SMS)'
  );
} else {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const port = grounded ? 3012 : 3011;
  const database = grounded ? GROUNDED_DEMO_DATABASE : DEMO_DATABASE;
  const demoEnv = {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(port),
    MONGO_URI: 'mongodb://127.0.0.1:27018/?replicaSet=pwc-local',
    MONGO_DB: database,
    AUTH_ENABLED: 'true',
    AI_ENABLED: 'true',
    AI_ROUTING_URL: '',
    EMAIL_ENABLED: 'false',
    SMS_ENABLED: 'false',
    CONTACT_INBOX_EMAIL: '',
    OTP_HMAC_SECRET: randomBytes(32).toString('hex'),
    SESSION_TOKEN_SECRET: randomBytes(32).toString('hex'),
    SESSION_CSRF_SECRET: randomBytes(32).toString('hex'),
    CONTACT_LOOKUP_SECRET: randomBytes(32).toString('hex'),
    CONTACT_ENCRYPTION_KEY: randomBytes(16).toString('hex')
  };
  let connection, server, app, groundedSnapshot;
  try {
    if (grounded) {
      const path = process.argv[snapshotIndex + 1];
      if (snapshotIndex < 0 || !path || path.startsWith('--') || (await stat(path)).size > 1000000) {
        throw new TypeError('Grounded demo requires a bounded JSON snapshot');
      }
      groundedSnapshot = validateGroundedSnapshot(JSON.parse(await readFile(path, 'utf8')));
    } else if (snapshotIndex >= 0) throw new TypeError('Snapshot requires --grounded');
    // Reserve the port BEFORE writing fixtures: a second launch must never
    // rotate contacts/secrets underneath an already-running demo process.
    server = createServer((req, res) => {
      if (app) return app(req, res);
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('PawWorldCare demo đang chuẩn bị dữ liệu. Vui lòng tải lại sau.');
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    for (const seed of [
      'service-catalog.js',
      'registration-policies.js',
      'pricing.js',
      'sitter-matching.js'
    ])
      await promisify(execFile)(
        process.execPath,
        ['scripts/seeds/' + seed, '--apply'],
        {
          cwd: root,
          env: demoEnv,
          stdio: 'pipe'
        }
      );
    const config = loadConfig(demoEnv);
    connection = await connectDatabase(config);
    const manifest = await seedDemo(connection, config, Date.now, { groundedSnapshot });
    const origin = `http://127.0.0.1:${port}`;
    app = createDemoApp({ config, connection, manifest, origin, groundedSnapshot });
    console.log(
      JSON.stringify({
        state: 'DEMO_READY',
        url: origin,
        database,
        accounts: manifest.accounts.length,
        sitters: manifest.sitters.length,
        date: manifest.date,
        routing: manifest.routing
      })
    );
    server.on('error', async () => {
      console.error('DEMO_PORT_UNAVAILABLE');
      await connection.close();
      process.exitCode = 1;
    });
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () =>
        server.close(async () => {
          await connection.close();
          process.exit(0);
        })
      );
  } catch (error) {
    console.error('DEMO_SETUP_FAILED', error.code ?? error.name);
    await connection?.close();
    server?.close();
    process.exitCode = 1;
  }
}
