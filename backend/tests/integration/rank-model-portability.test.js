import { afterAll, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { matchingModels } from '../../src/models/sitter-matching.model.js';
import { digest } from '../../src/validators/pet-care.validator.js';
import { scoreSitter } from '../../src/services/sitter-matching/scoring.service.js';

let replica, connection;
afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

test('archived draft weights survive a database reconnect with identical scores', async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  const connect = async () => mongoose.createConnection(replica.getUri(), {
    dbName: 'pwc_model_portability_isolated', serverSelectionTimeoutMS: 10000
  }).asPromise();
  connection = await connect();
  const models = matchingModels(connection);
  await models.SitterRankModel.init();
  // A synthetic record exercising compatibility with legacy research artifacts.
  const artifact = {
    version: 'synthetic-portability-test-v1', state: 'DRAFT',
    weights: { fit: 35, travel: 20, quality: 20, reliability: 15, workload: 10 },
    trainingRows: 160, testGroups: 12, testMae: 5, baselineMae: 7,
    trainedUntil: '2025-12-01T00:00:00.000Z'
  };
  const { state, ...content } = artifact;
  const archived = await models.SitterRankModel.create({ ...content, state, sha256: digest(content) });
  const input = {
    stats: { similarVisits: 12, ratingSum: 46, ratingCount: 10, completed: 20, faults: 1, onTime: 18, late: 2 },
    historyCounts: [2], extraTravelMinutes: 11, busyMinutes: 180
  };
  const before = scoreSitter({ ...input, weights: artifact.weights });
  await connection.close();
  connection = await connect();
  const restored = await matchingModels(connection).SitterRankModel.findOne({ version: artifact.version }).lean();
  expect(restored.state).toBe('DRAFT');
  expect(restored.sha256).toBe(archived.sha256);
  expect(Object.fromEntries(Object.keys(artifact.weights).map(key => [key, restored.weights[key]]))).toEqual(artifact.weights);
  expect(scoreSitter({ ...input, weights: Object.fromEntries(Object.keys(artifact.weights).map(key => [key, restored.weights[key]])) })).toEqual(before);
}, 120000);
