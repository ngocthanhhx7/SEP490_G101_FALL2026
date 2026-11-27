import { afterAll, beforeAll, expect, test } from '@jest/globals';
import express from 'express';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { errorHandler, requestId } from '../../src/middlewares/http.js';
import { publicPolicyVersionModel } from '../../src/models/public-policy-version.model.js';
import { publicPolicyModule } from '../../src/routes/public-policy.routes.js';
import { createPublicPolicyCatalog } from '../../src/services/public-policy-catalog.service.js';

let replica, connection, Policy;
const now = Date.parse('2026-10-29T00:00:00Z');
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.34' },
    replSet: { count: 1 }
  });
  connection = await mongoose
    .createConnection(replica.getUri(), { dbName: 'policy_history_isolated' })
    .asPromise();
  Policy = publicPolicyVersionModel(connection);
  await Policy.createIndexes();
});
afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

const row = (slug, version, effectiveAt, extra = {}) => ({
  slug,
  versionId: 'v' + version,
  status: 'APPROVED',
  title: 'Synthetic policy',
  purpose: 'History regression fixture',
  effectiveAt: new Date(effectiveAt),
  approvedAt: new Date(now - 86400000),
  approvedBy: 'synthetic-reviewer',
  sourceRef: 'synthetic-only',
  contentHash: 'synthetic-hash-' + version,
  sections: [{ heading: 'Fixture', paragraphs: ['Synthetic text'] }],
  ...extra
});

test('bounds returned history without losing latest-time ambiguity and approval gates', async () => {
  await Policy.insertMany(
    Array.from({ length: 120 }, (_, index) =>
      row('terms', index + 1, now - (120 - index) * 1000)
    )
  );
  await Policy.create([
    row('privacy', 1, now - 3000),
    row('privacy', 2, now - 1000),
    row('privacy', 3, now - 1000),
    row('booking', 1, now - 5000),
    row('booking', 2, now - 1000, { status: 'DRAFT' }),
    row('payments', 1, now - 1000, { expiresAt: new Date(now - 1) }),
    row('pwa', 1, now - 1000, { approvedBy: null })
  ]);
  const result = await createPublicPolicyCatalog({
    PolicyVersion: Policy,
    clock: () => now
  }).list();
  expect(result.map((item) => [item.slug, item.versionId])).toEqual([
    ['booking', 'v1'],
    ['terms', 'v120']
  ]);
  // Equal newest effective times stay hidden instead of selecting one arbitrarily.
  expect(result.some((item) => item.slug === 'privacy')).toBe(false);
});

test('exact read exposes previously published content without admitting draft, future or unaudited records', async () => {
  await Policy.create(row('terms', 121, now - 150000, { status: 'RETIRED', title: 'Archived synthetic terms' }));
  await Policy.create(row('terms', 122, now + 1000));
  const catalog = createPublicPolicyCatalog({ PolicyVersion: Policy, clock: () => now });
  await expect(catalog.readVersion('terms', 'v121')).resolves.toMatchObject({ title: 'Archived synthetic terms',
    versionId: 'v121', archived: true, currentVersionId: 'v120' });
  await expect(catalog.readVersion('payments', 'v1')).resolves.toMatchObject({ archived: true, currentVersionId: null });
  await expect(catalog.readVersion('booking', 'v2')).rejects.toMatchObject({ status: 404 });
  await expect(catalog.readVersion('terms', 'v122')).rejects.toMatchObject({ status: 404 });
  await expect(catalog.readVersion('pwa', 'v1')).rejects.toMatchObject({ status: 404 });

  const app = express();
  const { mount, router } = publicPolicyModule({ connection, clock: () => now });
  app.use(requestId);
  app.use(mount, router);
  app.use(errorHandler(() => {}));
  const { body } = await request(app).get('/api/v1/public/public-policies/terms/v121').expect(200);
  expect(body).toMatchObject({ data: { archived: true, currentVersionId: 'v120' }, meta: { schemaVersion: 1 } });
  const draft = await request(app).get('/api/v1/public/public-policies/booking/v2').expect(404);
  expect(draft.body.error.code).toBe('POLICY_VERSION_NOT_FOUND');
});
