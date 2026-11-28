import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { sitterPublicProfileModels } from '../../src/models/sitter-public-profile.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createSitterPublicProfileService } from '../../src/services/sitter-public-profile.service.js';
import { createMongoSitterProfileRepository } from '../../src/services/dashboards/mongo-sitter-profile.repository.js';
import { createSitterProfileService } from '../../src/services/dashboards/sitter-profile.service.js';

let replica, connection, models, users, statuses, service, directory, sitter;
const secret = 'synthetic-st-onb-05-cursor-secret-0001';
const actor = user => ({ userId: String(user._id), roles: user.roles, state: 'ACTIVE', expiresAt: Date.now() + 3600000 });

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_st_onb_05', autoIndex: false }).asPromise();
  models = sitterPublicProfileModels(connection);
  users = userModel(connection);
  statuses = sitterApplicationModels(connection).SitterStatus;
  for (const model of [...Object.values(models), users, statuses]) {
    await model.createCollection();
    await model.createIndexes();
  }
  for (const name of ['reviews', 'visits', 'employeeavailabilities', 'serviceareas']) {
    await connection.db.createCollection(name).catch(() => {});
  }
  service = createSitterPublicProfileService({ connection, cursorSecret: secret });
  directory = createMongoSitterProfileRepository({ connection, cursorSecret: secret });
}, 180000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

beforeEach(async () => {
  await Promise.all([...Object.values(models), users, statuses].map(model => model.deleteMany({})));
  for (const name of ['reviews', 'visits', 'employeeavailabilities']) {
    await connection.db.collection(name).deleteMany({});
  }
  sitter = actor(await users.create({ displayName: 'Nguyễn Minh Anh', state: 'ACTIVE', roles: ['PET_SITTER'] }));
  await statuses.create({ userId: sitter.userId, status: 'ACTIVE', changedAt: new Date(), version: 0 });
});

test('ST-ONB-05 new sitter reads own profile without existing public profile and saves bio + experience immediately as APPROVED', async () => {
  const initial = await service.readSelfProfile({ actor: sitter });
  expect(initial.profile).toMatchObject({
    displayName: 'Nguyễn Minh Anh',
    bio: '',
    experience: '',
    completedVisitsCount: 0,
    reviewCount: 0,
    rating: null,
    version: 0
  });

  await expect(service.saveSelfProfile({
    actor: sitter,
    body: { bio: '   ', experience: '', expectedVersion: 0 },
    idempotencyKey: 'st-onb-05-missing-fields'
  })).rejects.toMatchObject({
    status: 422,
    code: 'VALIDATION_FAILED',
    details: {
      messageCode: 'MSG01',
      fieldErrors: {
        bio: 'Trường này là bắt buộc.',
        experience: 'Trường này là bắt buộc.'
      }
    }
  });

  const saved = await service.saveSelfProfile({
    actor: sitter,
    body: {
      bio: 'Yêu thương chó mèo và chăm sóc tận tâm.',
      experience: '3 năm chăm sóc chó nhỏ và mèo trong nhà.',
      expectedVersion: 0
    },
    idempotencyKey: 'st-onb-05-save-1'
  });
  expect(saved).toMatchObject({
    messageCode: 'MSG51',
    profile: {
      bio: 'Yêu thương chó mèo và chăm sóc tận tâm.',
      experience: '3 năm chăm sóc chó nhỏ và mèo trong nhà.',
      state: 'APPROVED',
      version: 1
    }
  });

  const projection = await createSitterProfileService({ repository: directory }).read({ actor: sitter });
  expect(projection.data.items).toHaveLength(1);
  expect(projection.data.items[0]).toMatchObject({
    id: sitter.userId,
    bio: 'Yêu thương chó mèo và chăm sóc tận tâm.',
    experience: '3 năm chăm sóc chó nhỏ và mèo trong nhà.'
  });
});


test('replay returns the original self-profile response without mutating account, status, or history', async () => {
  const first = {
    actor: sitter,
    body: { bio: 'Giới thiệu đầu tiên.', experience: 'Kinh nghiệm đã lưu.', expectedVersion: 0 },
    idempotencyKey: 'st-onb-05-replay-original'
  };
  const saved = await service.saveSelfProfile(first);
  await service.saveSelfProfile({
    ...first, body: { ...first.body, bio: 'Giới thiệu mới hơn.', expectedVersion: 1 },
    idempotencyKey: 'st-onb-05-replay-next'
  });
  const userBefore = await users.findById(sitter.userId).lean();
  const statusBefore = await statuses.findOne({ userId: sitter.userId }).lean();
  await expect(service.saveSelfProfile(first)).resolves.toEqual(saved);
  expect((await users.findById(sitter.userId).lean()).version).toBe(userBefore.version);
  expect((await statuses.findOne({ userId: sitter.userId }).lean()).version).toBe(statusBefore.version);
  expect(await models.SitterPublicProfileAudit.countDocuments({ userId: sitter.userId })).toBe(2);
  expect(await models.SitterPublicProfile.findOne({ userId: sitter.userId }).lean()).toMatchObject({
    state: 'APPROVED', bio: 'Giới thiệu mới hơn.', version: 2
  });
});
