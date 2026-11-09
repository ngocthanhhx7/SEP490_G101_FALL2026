import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { readDirectedSitterPage } from '../../src/services/booking-proposals/directed-sitter-directory.service.js';
import { hasCompletedCustomerCare } from '../../src/services/customer-care-history.service.js';
import { createAiService } from '../../src/services/sitter-matching/recommendation.service.js';
let replica, connection;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_direct_directory' }).asPromise();
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('native directory globally sorts published ratings and paginates every registered employee, including newcomers', async () => {
  const db = connection.db, serviceId = new mongoose.Types.ObjectId();
  const ids = Array.from({ length: 125 }, () => new mongoose.Types.ObjectId());
  await db.collection('users').insertMany(ids.map((_id, i) => ({ _id, state: 'ACTIVE', roles: ['PET_SITTER'], displayName: `Synthetic ${i}`, synthetic: false })));
  await db.collection('sitterstatuses').insertMany(ids.map(userId => ({ userId, status: 'ACTIVE' })));
  await db.collection('sitterpublicprofiles').insertMany(ids.map(userId => ({ userId, state: 'APPROVED' })));
  await db.collection('aisitterprofiles').insertMany(ids.map(userId => ({ userId, active: true, serviceIds: [serviceId] })));
  await db.collection('reviews').insertMany([
    { sitterId: String(ids[124]), direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 5, comment: 'Never expose' },
    { sitterId: ids[0], direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 4 },
    { sitterId: String(ids[1]), direction: 'CUSTOMER_TO_SITTER', state: 'HIDDEN', rating: 5 },
    { sitterId: String(ids[2]), direction: 'SITTER_TO_CUSTOMER', state: 'PUBLISHED', rating: 5 }
  ]);
  const first = await readDirectedSitterPage(db, serviceId), second = await readDirectedSitterPage(db, serviceId, 2);
  expect(first.sitters).toHaveLength(20); expect(first.nextPage).toBe(2);
  expect(first.sitters.slice(0, 2).map(row => row.id)).toEqual([String(ids[124]), String(ids[0])]);
  expect(first.sitters[0]).toMatchObject({ rating: 5, reviewCount: 1 });
  expect(second.sitters).toHaveLength(20); expect(second.nextPage).toBe(3);
  const all = [...first.sitters, ...second.sitters]; let next = second.nextPage;
  while (next) { const page = await readDirectedSitterPage(db, serviceId, next); all.push(...page.sitters); next = page.nextPage; }
  expect(new Set(all.map(row => row.id)).size).toBe(125);
  expect(first.sitters.slice(2).every(row => row.rating === null && row.reviewCount === 0)).toBe(true);
  expect(JSON.stringify(first)).not.toContain('Never expose');
  await db.collection('aisitterprofiles').updateOne({ userId: ids[124] }, { $set: { serviceIds: [new mongoose.Types.ObjectId()] } });
  await db.collection('sitterstatuses').updateOne({ userId: ids[0] }, { $set: { status: 'SUSPENDED' } });
  const filtered = await readDirectedSitterPage(db, serviceId);
  expect(filtered.sitters.some(row => [String(ids[124]), String(ids[0])].includes(row.id))).toBe(false);
  await expect(readDirectedSitterPage(db, serviceId, 0)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});

test('only completed owned care counts; recommendation rejects returning Customer before matching or snapshot creation', async () => {
  const db = connection.db, customerId = new mongoose.Types.ObjectId(), otherId = new mongoose.Types.ObjectId();
  await db.collection('visits').insertMany([{ customerId, state: 'SCHEDULED' }, { customerId: otherId, state: 'COMPLETED' }]);
  expect(await hasCompletedCustomerCare(db, String(customerId))).toBe(false);
  await db.collection('visits').insertOne({ customerId, state: 'COMPLETED' });
  expect(await hasCompletedCustomerCare(db, String(customerId))).toBe(true);
  const ai = createAiService({ repository: { hasCompletedCare: id => hasCompletedCustomerCare(db, id) } });
  await expect(ai.recommend(String(customerId), {})).rejects.toMatchObject({ code: 'CUSTOMER_CARE_HISTORY_EXISTS', status: 409 });
});
