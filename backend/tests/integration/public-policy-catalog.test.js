import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { publicPolicyVersionModel } from '../../src/models/public-policy-version.model.js';
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
