// Isolated Linux Docker diagnostic only; synthetic auth/provider, never production data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire('/app/package.json');
const mongoose = require('mongoose');
const sharp = require('sharp');
import { createApp } from '/app/src/app.js';
import { privateImageModule } from '/app/src/routes/private-image.routes.js';
import { privateImageModels } from '/app/src/models/private-image.model.js';
import { loadConfig } from '/app/src/config/environment.js';

const connection = mongoose.createConnection('mongodb://pwc-audit-mongo:27017/pwc_memory_audit?directConnection=true', { serverSelectionTimeoutMS: 10000 });
connection.on('error', () => {});
let server;
try {
  await connection.asPromise();
  let hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName) await connection.db.admin().command({ replSetInitiate: { _id: 'audit', members: [{ _id: 0, host: 'pwc-audit-mongo:27017' }] } });
  for (let n = 0; n < 30; n++) {
    hello = await connection.db.admin().command({ hello: 1 });
    if (hello.isWritablePrimary) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(hello.isWritablePrimary);
  await Promise.all(Object.values(privateImageModels(connection)).map(model => model.createCollection()));
  const store = new Map();
  const owner = new mongoose.Types.ObjectId().toString();
  const env = { NODE_ENV: 'test', MONGO_URI: 'mongodb://pwc-audit-mongo:27017/?replicaSet=audit', MONGO_DB: 'pwc_memory_audit', AUTH_ENABLED: 'false', R2_ENABLED: 'false' };
  const app = createApp({ config: loadConfig(env), env, connection, lifecycle: { draining: false },
    moduleFactories: [() => privateImageModule({ connection, secret: 'synthetic-memory-audit-secret-only', maxImagesPerUser: 100,
      media: { upload: async ({ storageRef, body, contentType }) => { store.set(storageRef, { body, contentType }); },
        read: async ({ storageRef }) => store.get(storageRef) },
      requireAuthenticated: (req, _res, next) => { req.auth = { userId: owner }; next(); }, csrf: (_req, _res, next) => next() })] });
  server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/private-images`;
  let raw = randomBytes(1900 * 1900 * 3);
  const jpeg = await sharp(raw, { raw: { width: 1900, height: 1900, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  raw = null;
  assert(jpeg.length > 1024 * 1024 && jpeg.length <= 5 * 1024 * 1024);
  let uploads = 0, reads = 0;
  for (let wave = 0; wave < 4; wave++) {
    const ids = await Promise.all(Array.from({ length: 4 }, async (_, n) => {
      const response = await globalThis.fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'Idempotency-Key': `memory-wave-${wave}-command-${n}` }, body: jpeg });
      assert.equal(response.status, 201);
      const envelope = await response.json(); uploads++;
      return envelope.data.id;
    }));
    await Promise.all(ids.map(async id => {
      const response = await globalThis.fetch(`${url}/${id}/content`);
      assert.equal(response.status, 200);
      assert((await response.arrayBuffer()).byteLength > 0); reads++;
    }));
    store.clear();
  }
  const limit = Number((await readFile('/sys/fs/cgroup/memory.max', 'utf8')).trim());
  const peak = Number((await readFile('/sys/fs/cgroup/memory.peak', 'utf8')).trim());
  const events = await readFile('/sys/fs/cgroup/memory.events', 'utf8');
  const swap = Number((await readFile('/sys/fs/cgroup/memory.swap.current', 'utf8')).trim());
  const swapLimit = Number((await readFile('/sys/fs/cgroup/memory.swap.max', 'utf8')).trim());
  assert.equal(limit, 384 * 1024 * 1024);
  assert.equal(swap, 0);
  assert.equal(swapLimit, 0);
  assert(!/^oom_kill [1-9]/m.test(events));
  console.log(JSON.stringify({ status: 'PASS', platform: process.platform, architecture: process.arch, uploads, reads, fixtureBytes: jpeg.length, limitBytes: limit, peakBytes: peak, rssBytes: process.memoryUsage().rss, swapBytes: swap, swapLimitBytes: swapLimit, oomKill: 0, provider: 'synthetic', auth: 'synthetic-test-only' }));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await connection.close();
}
