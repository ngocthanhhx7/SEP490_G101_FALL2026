import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectCatalogIndexRetirement, retireCatalogIndexes, restoreCatalogIndexes, redundantCatalogIndexes } from '../../src/services/catalog-index-retirement.service.js';

let server, connection;
beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.0.34' } });
  connection = await mongoose.createConnection(server.getUri(), { dbName: 'catalog_index_retire', autoCreate: false, autoIndex: false }).asPromise();
  for (const spec of redundantCatalogIndexes) {
    const col = connection.db.collection(spec.collection);
    await col.createIndex(spec.key, { name: spec.name });
    for (const keys of spec.required) await col.createIndex(keys, { unique: true });
    await col.insertMany(Array.from({ length: 100 }, (_, i) => ({ ...(spec.collection === 'servicepriceversions'
      ? { serviceId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011') } : { key: 'SERVICE_CATALOG_VISIBLE' }),
    version: i + 1, effectiveAt: new Date(Date.UTC(2026, 0, i + 1)), value: i })));
  }
}, 600000);
afterAll(async () => { await connection?.close(); await server?.stop(); }, 30000);
test('drop two redundant nonunique indexes; latest read, plan and uniqueness remain correct; restore exact metadata', async () => {
  const dry = await inspectCatalogIndexRetirement(connection.db);
  await expect(retireCatalogIndexes({ db: connection.db, expectedDigest: dry.digest })).rejects.toThrow('CATALOG_INDEX_FREEZE_REQUIRED');
  await expect(retireCatalogIndexes({ db: connection.db, writersFrozen: true, expectedDigest: 'bad' })).rejects.toThrow('CATALOG_INDEX_DIGEST_MISMATCH');
  await retireCatalogIndexes({ db: connection.db, expectedDigest: dry.digest, writersFrozen: true });
  for (const spec of redundantCatalogIndexes) {
    const col = connection.db.collection(spec.collection), owner = spec.collection === 'servicepriceversions'
      ? { serviceId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011') } : { key: 'SERVICE_CATALOG_VISIBLE' };
    const filter = { ...owner, effectiveAt: { $lte: new Date('2026-02-01') } };
    expect((await col.find(filter).sort({ effectiveAt: -1 }).limit(1).toArray())[0].version).toBe(32);
    const plan = await col.find(filter).sort({ effectiveAt: -1 }).limit(1).explain('executionStats');
    expect(plan.executionStats.totalDocsExamined).toBe(1);
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"');
    await expect(col.insertOne({ ...owner, version: 101, effectiveAt: new Date('2026-01-01') })).rejects.toMatchObject({ code: 11000 });
    expect(await col.countDocuments()).toBe(100);
  }
  await restoreCatalogIndexes({ db: connection.db, writersFrozen: true });
  expect((await inspectCatalogIndexRetirement(connection.db)).digest).toBe(dry.digest);
});
test('operator CLI binds database and manifest, and restores indexes without changing documents', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pwc-catalog-index-cli-'));
  const manifest = path.join(directory, 'manifest.ejson');
  const env = { ...process.env, NODE_ENV: 'test', AUTH_ENABLED: 'false', MONGO_URI: server.getUri(), MONGO_DB: connection.name,
    CATALOG_REFINEMENT_MANIFEST: manifest, CONFIRMED_CATALOG_REFINEMENT_DATABASE: connection.name,
    CONFIRMED_CATALOG_REFINEMENT_WRITERS_FROZEN: 'true' };
  const run = async (args, digest) => JSON.parse((await promisify(execFile)(process.execPath,
    ['scripts/database/refine-catalog-storage.js', '--scope=indexes', ...args],
    { cwd: process.cwd(), env: { ...env, CONFIRMED_CATALOG_REFINEMENT_DIGEST: digest ?? '' }, windowsHide: true })).stdout);
  try {
    const dry = await run([]);
    expect(dry).toMatchObject({ state: 'DRY_RUN', indexes: 2 });
    expect((await run(['--apply'], dry.digest)).state).toBe('RETIRED');
    expect((await run(['--restore'], dry.digest)).state).toBe('RESTORED');
    for (const spec of redundantCatalogIndexes) expect(await connection.db.collection(spec.collection).countDocuments()).toBe(100);
  } finally {
    expect(path.dirname(path.resolve(directory))).toBe(path.resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
