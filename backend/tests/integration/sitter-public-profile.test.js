import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { sitterPublicProfileModels } from '../../src/models/sitter-public-profile.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createSitterPublicProfileService } from '../../src/services/sitter-public-profile.service.js';
import { createMongoSitterProfileRepository } from '../../src/services/dashboards/mongo-sitter-profile.repository.js';
import { createSitterListService } from '../../src/services/dashboards/sitter-list.service.js';
import { createSitterProfileService } from '../../src/services/dashboards/sitter-profile.service.js';
import { settlementRuntimeFixture } from '../fixtures/settlement-runtime.js';

let replica, connection, models, users, statuses, service, sitter, staff, directory;
const secret = 'synthetic-profile-cursor-secret-0001';
const actor = user => ({ userId: String(user._id), roles: user.roles, state: 'ACTIVE', expiresAt: Date.now() + 3600000 });
const body = { bio: 'Synthetic sitter bio', areas: ['HN-01'], expectedVersion: 0 };
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'public_profile_test', autoIndex: false }).asPromise();
  models = sitterPublicProfileModels(connection); users = userModel(connection);
  statuses = sitterApplicationModels(connection).SitterStatus;
  for (const model of [...Object.values(models), users, statuses]) { await model.createCollection(); await model.createIndexes(); }
  await connection.db.createCollection('reviews');
  service = createSitterPublicProfileService({ connection, cursorSecret: secret });
  directory = createMongoSitterProfileRepository({ connection, cursorSecret: secret });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
beforeEach(async () => {
  await Promise.all([...Object.values(models), users, statuses].map(model => model.deleteMany({})));
  await connection.db.collection('reviews').deleteMany({});
  sitter = actor(await users.create({ displayName: 'Synthetic sitter', state: 'ACTIVE', roles: ['PET_SITTER'] }));
  staff = actor(await users.create({ displayName: 'Synthetic staff', state: 'ACTIVE', roles: ['STAFF'] }));
  await statuses.create({ userId: sitter.userId, status: 'ACTIVE', changedAt: new Date(), version: 0 });
});
const submit = () => service.submit({ actor: sitter, body, idempotencyKey: 'submit-profile-1' });
const approve = version => service.review({ actor: staff, userId: sitter.userId,
  body: { decision: 'APPROVE', reason: 'Synthetic review', expectedVersion: version }, idempotencyKey: `review-profile-${version}` });

test('submit/retry, review and edit retain an audit and remove publication until reviewed again', async () => {
  const submitted = await submit();
  expect(await submit()).toEqual(submitted);
  expect(submitted).toMatchObject({ state: 'SUBMITTED', version: 1 });
  expect((await createSitterListService({ repository: directory }).read({ actor: staff })).data.items).toEqual([]);
  await approve(1);
  const shown = await createSitterListService({ repository: directory }).read({ actor: staff });
  expect(shown.data.items).toEqual([{ id: sitter.userId, displayName: 'Synthetic sitter', bio: body.bio,
    areas: ['HN-01'], reviewCount: 0, rating: null }]);
  await service.submit({ actor: sitter, body: { ...body, bio: 'Revised', expectedVersion: 2 }, idempotencyKey: 'submit-profile-2' });
  expect((await createSitterListService({ repository: directory }).read({ actor: staff })).data.items).toEqual([]);
  expect(await models.SitterPublicProfileAudit.countDocuments()).toBe(3);
});

test('concurrent same-key submission has one result; stale review and changed-key payload are rejected', async () => {
  const results = await Promise.all([submit(), submit()]);
  expect(results[0]).toEqual(results[1]);
  await expect(service.submit({ actor: sitter, body: { ...body, bio: 'different' }, idempotencyKey: 'submit-profile-1' }))
    .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  await expect(approve(0)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  expect(await models.SitterPublicProfile.countDocuments()).toBe(1);
});

test('self approval, unauthorized actor and suspended sitter cannot publish', async () => {
  await submit();
  await users.updateOne({ _id: sitter.userId }, { $addToSet: { roles: 'STAFF' } });
  await expect(service.review({ actor: { ...sitter, roles: ['PET_SITTER', 'STAFF'] }, userId: sitter.userId,
    body: { decision: 'APPROVE', reason: 'Self', expectedVersion: 1 }, idempotencyKey: 'self-approval-1' }))
    .rejects.toMatchObject({ status: 403 });
  await expect(service.listPending({ actor: sitter })).rejects.toMatchObject({ status: 403 });
  await statuses.updateOne({ userId: sitter.userId }, { $set: { status: 'SUSPENDED' } });
  await expect(approve(1)).rejects.toMatchObject({ code: 'SITTER_NOT_ELIGIBLE' });
  expect((await service.readOwn({ actor: sitter })).profile.state).toBe('SUBMITTED');
});

test('directory aggregates only published customer ratings and never returns customer text or identifiers', async () => {
  await submit(); await approve(1);
  await connection.db.collection('reviews').insertMany([
    { sitterId: sitter.userId, direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 5, comment: 'Private comment', customerId: 'private-customer' },
    { sitterId: sitter.userId, direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 3 },
    { sitterId: sitter.userId, direction: 'CUSTOMER_TO_SITTER', state: 'SUBMITTED', rating: 1 },
    { sitterId: sitter.userId, direction: 'SITTER_TO_CUSTOMER', state: 'PUBLISHED', rating: 1 }
  ]);
  const result = await createSitterProfileService({ repository: directory }).read({ actor: sitter });
  expect(result.data.items[0]).toMatchObject({ reviewCount: 2, rating: 4 });
  expect(JSON.stringify(result)).not.toMatch(/Private comment|private-customer/);
  await connection.db.collection('reviews').insertOne({ sitterId: sitter.userId, direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 'bad' });
  await expect(createSitterProfileService({ repository: directory }).read({ actor: sitter })).rejects.toMatchObject({ code: 'INVALID_PROJECTION' });
});

test('directory cursor binds identity/search and profile reads stay self-only', async () => {
  await submit(); await approve(1);
  const secondUser = await users.create({ displayName: 'Synthetic sitter two', state: 'ACTIVE', roles: ['PET_SITTER'] });
  const second = actor(secondUser);
  await statuses.create({ userId: second.userId, status: 'ACTIVE', changedAt: new Date(), version: 0 });
  await service.submit({ actor: second, body, idempotencyKey: 'second-profile-1' });
  await service.review({ actor: staff, userId: second.userId, body: { decision: 'APPROVE', reason: 'Synthetic', expectedVersion: 1 }, idempotencyKey: 'review-second-1' });
  const reader = createSitterListService({ repository: directory });
  const first = await reader.read({ actor: staff, query: { limit: '1' } });
  const next = await reader.read({ actor: staff, query: { limit: '1', cursor: first.data.nextCursor } });
  expect(next.data.items[0].id).not.toBe(first.data.items[0].id);
  await expect(reader.read({ actor: staff, query: { limit: '1', cursor: first.data.nextCursor, search: 'changed' } }))
    .rejects.toMatchObject({ status: 422 });
  await expect(createSitterProfileService({ repository: directory }).read({ actor: sitter, targetId: second.userId }))
    .resolves.toMatchObject({ pending: true });
});

test('missing moderation collection keeps approved profiles readable with unknown ratings', async () => {
  await submit(); await approve(1);
  await connection.db.collection('reviews').drop();
  try { expect(await createSitterListService({ repository: directory }).read({ actor: staff })).toMatchObject({ data: { items: [{ reviewsAvailable: false, reviewCount: null, rating: null }] } }); }
  finally { await connection.db.createCollection('reviews'); }
});

test('runtime requires real session, Staff review role and CSRF', async () => {
  const f = await settlementRuntimeFixture(connection, replica.getUri(), 'PET_SITTER');
  await request(f.app).get('/api/v1/sitter-public-profiles/me').expect(401);
  await request(f.app).get('/api/v1/sitter-public-profiles/me').set('Cookie', f.cookie).expect(200);
  await request(f.app).get('/api/v1/sitter-public-profiles').set('Cookie', f.cookie).expect(403);
  await request(f.app).put('/api/v1/sitter-public-profiles/me').set('Cookie', f.cookie).send(body).expect(403);
});
