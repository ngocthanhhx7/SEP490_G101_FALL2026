import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { privateImageModels } from '../../src/models/private-image.model.js';
import { createSessionService } from '../../src/services/session.service.js';

const env = { NODE_ENV: 'test', AUTH_ENABLED: 'true',
  OTP_HMAC_SECRET: 'a'.repeat(32), SESSION_TOKEN_SECRET: 'b'.repeat(32),
  SESSION_CSRF_SECRET: 'c'.repeat(32), CONTACT_LOOKUP_SECRET: 'd'.repeat(32), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32),
  R2_ENABLED: 'true', R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'synthetic-private',
  R2_ACCESS_KEY_ID: 'b'.repeat(32), R2_SECRET_ACCESS_KEY: 'c'.repeat(64), R2_MAX_IMAGES_PER_USER: '2' };
let replica, connection, app, config, session, images, png, jpeg, orientedJpeg, alphaPng,
  nearLimitJpeg, tooManyPixelsPng, actors, store, writes, failing, lostResponse;
function headers(actor = actors.a, key = 'private-image-command-0001') {
  return { Cookie: actor.cookie, 'X-CSRF-Token': actor.csrf, Origin: 'http://127.0.0.1',
    Host: '127.0.0.1', 'Idempotency-Key': key, 'Content-Type': 'image/png' };
}
function upload(actor, key, bytes = png) {
  return request(app).post('/api/v1/private-images').set(headers(actor, key)).send(bytes);
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  env.MONGO_URI = replica.getUri(); env.MONGO_DB = 'pwc_private_images_test';
  config = loadConfig(env);
  connection = await connectDatabase(config);
  images = privateImageModels(connection);
  await Promise.all([...Object.values(images), ...Object.values(identityModels(connection)), userModel(connection)]
    .map(model => model.createCollection()));
  session = createSessionService({ connection, tokenSecret: env.SESSION_TOKEN_SECRET, csrfSecret: env.SESSION_CSRF_SECRET });
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#112233' } }).png().toBuffer();
  jpeg = await sharp(png).jpeg().withExif({ IFD0: { Artist: 'Private Synthetic Artist' } }).toBuffer();
  orientedJpeg = await sharp({ create: { width: 2, height: 4, channels: 3, background: '#112233' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  alphaPng = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 17, g: 34, b: 51, alpha: 0.5 } } })
    .png().toBuffer();
  nearLimitJpeg = await sharp(randomBytes(1900 * 1900 * 3), { raw: { width: 1900, height: 1900, channels: 3 } })
    .jpeg({ quality: 90 }).toBuffer();
  tooManyPixelsPng = await sharp({ create: { width: 2001, height: 2000, channels: 3, background: '#112233' } })
    .png().toBuffer();
}, 600000);
beforeEach(async () => {
  await Promise.all([...Object.values(images), ...Object.values(identityModels(connection)), userModel(connection)]
    .map(model => model.deleteMany({})));
  actors = {}; store = new Map(); writes = 0; failing = false; lostResponse = false;
  for (const [name, roles] of [['a', ['CUSTOMER']], ['b', ['CUSTOMER']], ['admin', ['ADMIN']]]) {
    const user = await userModel(connection).create({ displayName: `Synthetic ${name}`, roles, state: 'ACTIVE', authEpoch: 0, version: 0 });
    let issued;
    await connection.transaction(async txn => { issued = await session.issueInTransaction(user, txn); });
    actors[name] = { id: user._id.toString(), cookie: `pwc_session=${issued.token}`, csrf: issued.csrfToken };
  }
  app = createApp({ config, connection, env, lifecycle: { draining: false }, portOverrides: { privateMedia: {
    upload: async ({ storageRef, body, contentType }) => {
      writes += 1;
      if (failing) throw new Error('private provider URL must not escape');
      store.set(storageRef, { body, contentType });
      if (lostResponse) throw new Error('provider stored bytes but acknowledgement lost');
    },
    read: async ({ storageRef }) => store.get(storageRef)
  } } });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

describe('private image runtime with real persisted sessions, CSRF and Mongo transactions', () => {
  test('uploads/replays and reads re-encoded own bytes; other owners and Admin cannot read', async () => {
    const first = await upload(actors.a).expect(201);
    const { id } = first.body.data;
    expect(first.body.data).toEqual({ id, state: 'READY', replayed: false });
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(JSON.stringify(first.body)).not.toMatch(/storageRef|r2\.cloudflarestorage/);
    await upload(actors.a).expect(200);
    expect(writes).toBe(1);
    const read = await request(app).get(`/api/v1/private-images/${id}/content`).set('Cookie', actors.a.cookie).expect(200);
    expect(read.body).toEqual([...store.values()][0].body);
    expect(read.headers['cache-control']).toBe('private, no-store');
    for (const actor of [actors.b, actors.admin]) {
      await request(app).get(`/api/v1/private-images/${id}/content`).set('Cookie', actor.cookie).expect(404);
    }
    await session.revoke({ headers: { cookie: actors.a.cookie } });
    await request(app).get(`/api/v1/private-images/${id}/content`).set('Cookie', actors.a.cookie).expect(401);
  });

  test('rejects guest, invalid CSRF/origin, malformed, spoofed MIME and oversize before storage', async () => {
    await request(app).post('/api/v1/private-images').set('Content-Type', 'image/png').send(png).expect(401);
    await request(app).post('/api/v1/private-images').set({ ...headers(), 'X-CSRF-Token': 'wrong' }).send(png).expect(403);
    await request(app).post('/api/v1/private-images').set({ ...headers(), Origin: 'https://evil.invalid' }).send(png).expect(403);
    await upload(actors.a, undefined, Buffer.from('not an image')).expect(422);
    await upload(actors.a, undefined, jpeg).expect(422);
    await upload(actors.a, undefined, Buffer.alloc(5 * 1024 * 1024 + 1)).expect(413);
    expect(writes).toBe(0);
    expect(await images.PrivateImage.countDocuments()).toBe(0);
  });

  test('strips EXIF, rejects changed payload under one key and preserves quota across uncertain upload', async () => {
    await request(app).post('/api/v1/private-images').set({ ...headers(), 'Content-Type': 'image/jpeg' }).send(jpeg).expect(201);
    const stored = [...store.values()][0].body;
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(stored.includes(Buffer.from('Private Synthetic Artist'))).toBe(false);
    await upload(actors.a).expect(409);
    failing = true;
    await upload(actors.a, 'private-image-command-0002').expect(503);
    expect(await images.PrivateImage.countDocuments({ state: 'PENDING' })).toBe(1);
    expect((await images.PrivateImageQuota.findById(actors.a.id)).count).toBe(2);
    await upload(actors.a, 'private-image-command-0003').expect(429);
    failing = false;
    await upload(actors.a, 'private-image-command-0002').expect(201);
    expect((await images.PrivateImageQuota.findById(actors.a.id)).count).toBe(2);
  });

  test('normalizes orientation, preserves alpha and rejects images over the pixel cap', async () => {
    const rotated = await request(app).post('/api/v1/private-images')
      .set({ ...headers(), 'Content-Type': 'image/jpeg', 'Idempotency-Key': 'private-image-orientation-01' })
      .send(orientedJpeg).expect(201);
    const rotatedStored = [...store.values()].find(value => value.contentType === 'image/jpeg').body;
    const rotatedMeta = await sharp(rotatedStored).metadata();
    expect(rotated.body.data.id).toHaveLength(64);
    expect(rotatedMeta.orientation).toBeUndefined();
    expect([rotatedMeta.width, rotatedMeta.height]).toEqual([4, 2]);

    await request(app).post('/api/v1/private-images')
      .set({ ...headers(), 'Content-Type': 'image/png', 'Idempotency-Key': 'private-image-alpha-01' })
      .send(alphaPng).expect(201);
    const alphaStored = [...store.values()].find(value => value.contentType === 'image/png').body;
    expect((await sharp(alphaStored).metadata()).hasAlpha).toBe(true);

    expect(nearLimitJpeg.length).toBeGreaterThan(2.5 * 1024 * 1024);
    expect(nearLimitJpeg.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    await request(app).post('/api/v1/private-images')
      .set({ ...headers(actors.b), 'Content-Type': 'image/jpeg', 'Idempotency-Key': 'private-image-near-limit-01' })
      .send(nearLimitJpeg).expect(201);
    await request(app).post('/api/v1/private-images')
      .set({ ...headers(actors.b), 'Content-Type': 'image/png', 'Idempotency-Key': 'private-image-pixels-01' })
      .send(tooManyPixelsPng).expect(422);
  });

  test('lost acknowledgement reuses the same object and quota; concurrent same-key requests converge', async () => {
    lostResponse = true;
    await upload(actors.a).expect(503);
    expect(store.size).toBe(1);
    expect(await images.PrivateImage.countDocuments({ state: 'PENDING' })).toBe(1);
    const originalKey = [...store.keys()][0];
    lostResponse = false;
    const retries = await Promise.all([1, 2, 3].map(() => upload(actors.a)));
    expect(retries.every(r => [200, 201].includes(r.status))).toBe(true);
    expect(new Set(retries.map(r => r.body.data.id)).size).toBe(1);
    expect(store.size).toBe(1);
    expect([...store.keys()][0]).toBe(originalKey);
    expect(await images.PrivateImage.countDocuments({ state: 'READY' })).toBe(1);
    expect((await images.PrivateImageQuota.findById(actors.a.id)).count).toBe(1);
  });
  test('parallel different images cannot overspend quota; tampered stored content cannot be served', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(n => upload(actors.a, `private-image-parallel-${n}`)));
    expect(results.filter(r => r.status === 201)).toHaveLength(2);
    expect(results.filter(r => r.status === 429)).toHaveLength(2);
    expect(await images.PrivateImage.countDocuments()).toBe(2);
    expect((await images.PrivateImageQuota.findById(actors.a.id)).count).toBe(2);
    const id = results.find(r => r.status === 201).body.data.id;
    const record = await images.PrivateImage.findById(id).select('+storageRef').lean();
    store.set(record.storageRef, { contentType: 'image/png', body: Buffer.from('tampered') });
    await request(app).get(`/api/v1/private-images/${id}/content`).set('Cookie', actors.a.cookie).expect(503);
  });
});
