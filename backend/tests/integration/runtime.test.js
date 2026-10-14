import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server-core';
import request from 'supertest';
import { spawn } from 'node:child_process';
import { Router } from 'express';
import { startRuntime } from '../../src/runtime.js';
import { connectDatabase } from '../../src/config/database.js';
import { loadConfig } from '../../src/config/environment.js';
import { seedDevelopmentAdmin } from '../../src/services/admin-seed.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';

let replica, runtime;
const envFor = uri => ({ NODE_ENV: 'test', PORT: '0', MONGO_URI: uri, MONGO_DB: 'pwc_foundation_test', MONGO_CONNECT_TIMEOUT_MS: '3000' });
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  runtime = await startRuntime({ env: envFor(replica.getUri()) });
}, 600000);
afterAll(async () => { await runtime?.stop(); await replica?.stop(); }, 30000);

describe('real isolated MongoDB 8.0.34 replica-set smoke', () => {
  test('listens on a real socket and reports healthy/ready with Mongo ping', async () => {
    expect(runtime.server.address().port).toBeGreaterThan(0);
    const build = await runtime.connection.db.admin().command({ buildInfo: 1 });
    expect(build.version).toBe('8.0.34');
    await request(runtime.server).get('/health').expect(200);
    await request(runtime.server).get('/ready').expect(200);
  });
  test('unit-of-work rolls back database writes on error and commits success', async () => {
    const collection = runtime.connection.db.collection('synthetic_operations');
    await collection.insertOne({ key: 'initial' });
    const uow = createUnitOfWork(runtime.connection);
    await expect(uow.run(async session => {
      await collection.insertOne({ key: 'rolled-back' }, { session });
      throw new Error('synthetic rollback');
    })).rejects.toThrow('synthetic rollback');
    expect(await collection.countDocuments({ key: 'rolled-back' })).toBe(0);
    await uow.run(session => collection.insertOne({ key: 'committed' }, { session }));
    expect(await collection.countDocuments({ key: 'committed' })).toBe(1);
  });
  test('seed is repeatable, locked and credential-free; test/production opt-in denied', async () => {
    const dev = { ...runtime.config, nodeEnv: 'development', database: 'pwc_foundation_dev', allowDevAdminSeed: true };
    const connection = await connectDatabase(dev);
    try {
      const first = await seedDevelopmentAdmin(connection, dev);
      const second = await seedDevelopmentAdmin(connection, dev);
      expect(first.id).toBe(second.id);
      const concurrent = await Promise.all([seedDevelopmentAdmin(connection, dev), seedDevelopmentAdmin(connection, dev)]);
      expect(concurrent.every(user => user.id === first.id)).toBe(true);
      expect(first.state).toBe('LOCKED'); expect(first.synthetic).toBe(true);
      const records = await connection.collection('users').find({ fixtureKey: 'pwc-synthetic-admin-v1' }).toArray();
      expect(records).toHaveLength(1);
      expect(records[0]).not.toHaveProperty('password');
      expect(records[0]).not.toHaveProperty('otp');
      expect(records[0]).not.toHaveProperty('contact');
      await expect(seedDevelopmentAdmin(connection, { ...dev, nodeEnv: 'production' })).rejects.toMatchObject({ code: 'SEED_FORBIDDEN' });
      await expect(seedDevelopmentAdmin(connection, { ...dev, allowDevAdminSeed: false })).rejects.toMatchObject({ code: 'SEED_FORBIDDEN' });
      await expect(seedDevelopmentAdmin(connection, runtime.config)).rejects.toMatchObject({ code: 'SEED_FORBIDDEN' });
      await connection.collection('users').updateOne({ _id: first._id }, { $set: { state: 'ACTIVE' } });
      await expect(seedDevelopmentAdmin(connection, dev)).rejects.toMatchObject({ code: 'SEED_FIXTURE_CONFLICT' });
    } finally { await connection.close(); }
  });
  test('standalone database is refused rather than pretending transactions ready', async () => {
    const standalone = await MongoMemoryServer.create({ binary: { version: '8.0.34' } });
    try {
      await expect(connectDatabase(loadConfig(envFor(standalone.getUri())))).rejects.toThrow('required topology');
    } finally { await standalone.stop(); }
  });
  test('startup with invalid configuration or unreachable database exits safely', async () => {
    async function execute(extra) {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), windowsHide: true,
          env: { ...process.env, NODE_ENV: 'test', MONGO_URI: '', MONGO_DB: '', ...extra } });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.on('error', reject); child.on('close', code => resolve({ code, output }));
      });
    }
    const invalid = await execute({ MONGO_URI: 'invalid://synthetic-secret' });
    expect(invalid.code).toBe(1); expect(invalid.output).toContain('INVALID_CONFIGURATION');
    expect(invalid.output).not.toContain('synthetic-secret');
    const down = await execute({ MONGO_URI: 'mongodb://127.0.0.1:1', MONGO_DB: 'pwc_test', MONGO_CONNECT_TIMEOUT_MS: '100' });
    expect(down.code).toBe(1); expect(down.output).toContain('DB_CONNECTION_UNAVAILABLE');
    expect(down.output).not.toMatch(/stack|MongoServerSelectionError|mongodb:\/\//);
  });
  test('bounded shutdown drains and closes a stuck HTTP request', async () => {
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    const events = [];
    const isolated = await startRuntime({ env: { ...envFor(replica.getUri()), SHUTDOWN_TIMEOUT_MS: '100' },
      logger: event => events.push(event), moduleFactories: [() => {
        const router = Router();
        router.get('/blocked', () => { entered(); });
        return { name: 'shutdown-test-only', mount: '/api/v1/testing', router };
      }]
    });
    try {
      const response = request(isolated.server).get('/api/v1/testing/blocked').then(() => 'completed', () => 'aborted');
      await started;
      await isolated.stop();
      expect(await response).toBe('aborted');
      expect(events).toContainEqual({ event: 'shutdown_complete', forced: true });
      expect(isolated.connection.readyState).toBe(0);
    } finally { await isolated.stop(); }
  });
  test('Mongo disconnect makes readiness fail, health lives; shutdown closes both resources idempotently', async () => {
    await replica.stop();
    await request(runtime.server).get('/ready').expect(503);
    await request(runtime.server).get('/health').expect(200);
    await Promise.all([runtime.stop(), runtime.stop()]);
    expect(runtime.server.listening).toBe(false);
    expect(runtime.connection.readyState).toBe(0);
    expect(runtime.lifecycle.draining).toBe(true);
  });
});
