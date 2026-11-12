import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { CATALOG_VERSION_AUDITS, createCatalogChange } from '../../src/models/catalog-change-provenance.model.js';
import { serviceVersionModel } from '../../src/models/service-version.model.js';
import { servicePolicyVersionModel } from '../../src/models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../../src/models/service-price-version.model.js';
import { systemSettingVersionModel } from '../../src/models/system-setting-version.model.js';
import { catalogAuditRecord } from '../../src/services/catalog-audit-migration.service.js';

const factories = [serviceVersionModel, servicePolicyVersionModel, servicePriceVersionModel, systemSettingVersionModel];
const sources = [...new Set(CATALOG_VERSION_AUDITS.map(value => value.source))];
const time = new Date('2026-11-07T00:00:00Z'), actor = new mongoose.Types.ObjectId();
function fixture(index, ordinal) {
  const definition = CATALOG_VERSION_AUDITS[index], serviceId = new mongoose.Types.ObjectId();
  const version = { _id: new mongoose.Types.ObjectId(), version: ordinal + 1, changedBy: actor,
    reason: 'Synthetic catalog change for storage comparison', effectiveAt: new Date(+time + ordinal * 1000), recordedAt: time,
    ...(index === 0 ? { serviceId, name: 'Synthetic service', description: 'Synthetic description', scope: 'Synthetic scope', species: ['DOG'], state: 'ACTIVE' }
      : index === 1 ? { serviceId, state: 'PUBLISHED', title: 'Synthetic policy', body: 'Synthetic policy body' }
        : index === 2 ? { serviceId, amountVnd: 50000, currency: 'VND', unitLabel: 'lần' }
          : { key: 'SERVICE_CATALOG_VISIBLE', enabled: true }) };
  const change = createCatalogChange(definition.actions[0], index === 2 ? ['amountVnd', 'unitLabel'] : ['state']);
  return { definition, version, audit: catalogAuditRecord(definition, version, change), embedded: { ...version, changeAudit: change } };
}
async function setup(connection, mode) {
  for (const factory of factories) {
    const model = factory(connection); await model.createCollection(); await model.createIndexes();
  }
  if (mode === 'split') for (const source of sources) {
    await connection.db.createCollection(source);
    await connection.db.collection(source).createIndex({ resourceId: 1, occurredAt: -1 });
  }
}
async function footprint(connection) {
  let logicalBsonBytes = 0, dataStorageBytes = 0, indexBytes = 0, documents = 0, indexes = 0;
  const collections = await connection.db.listCollections().toArray();
  for (const { name } of collections) {
    const stats = await connection.db.command({ collStats: name });
    logicalBsonBytes += stats.size; dataStorageBytes += stats.storageSize; indexBytes += stats.totalIndexSize;
    documents += stats.count; indexes += stats.nindexes;
  }
  return { collections: collections.length, documents, indexes, logicalBsonBytes, dataStorageBytes, indexBytes };
}
const replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
const connections = [];
try {
  const results = [];
  for (const count of [1000, 10000, 100000]) {
    const pair = {};
    for (const mode of ['split', 'embedded']) {
      const connection = await mongoose.createConnection(replica.getUri(), { dbName: `synthetic_${mode}_${count}`,
        autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
      connections.push(connection); await setup(connection, mode); pair[mode] = { connection };
    }
    // Identical facts and IDs in both representations; bounded client batches.
    const bulkMs = { split: 0, embedded: 0 };
    for (let start = 0; start < count; start += 1000) {
      const rows = Array.from({ length: Math.min(1000, count - start) }, (_, offset) => fixture((start + offset) % 4, start + offset));
      for (const mode of ['split', 'embedded']) {
        const db = pair[mode].connection.db, began = performance.now();
        for (const definition of CATALOG_VERSION_AUDITS) {
          const group = rows.filter(row => row.definition === definition);
          if (group.length) await db.collection(definition.target).insertMany(group.map(row => mode === 'split' ? row.version : row.embedded));
        }
        if (mode === 'split') for (const source of sources) {
          const group = rows.filter(row => row.definition.source === source);
          if (group.length) await db.collection(source).insertMany(group.map(row => row.audit));
        }
        bulkMs[mode] += performance.now() - began;
      }
    }
    // Force WT checkpoints equally before comparing physical allocation.
    await pair.split.connection.db.admin().command({ fsync: 1 });
    const measured = {};
    for (const mode of ['split', 'embedded']) {
      const connection = pair[mode].connection, storage = await footprint(connection), samples = [];
      let inserts = 0;
      const listener = event => { if (event.commandName === 'insert') inserts++; };
      for (let run = 0; run < 45; run++) {
        const row = fixture(run % 4, count + run), began = performance.now();
        if (run === 5) connection.getClient().on('commandStarted', listener);
        await connection.transaction(async session => {
          await connection.db.collection(row.definition.target).insertOne(mode === 'split' ? row.version : row.embedded, { session });
          if (mode === 'split') await connection.db.collection(row.definition.source).insertOne(row.audit, { session });
        }, { writeConcern: { w: 'majority' } });
        if (run >= 5) samples.push(performance.now() - began);
        if (mode === 'embedded') {
          const saved = await connection.db.collection(row.definition.target).findOne({ _id: row.version._id });
          assert.deepEqual(catalogAuditRecord(row.definition, saved), row.audit);
        }
      }
      connection.getClient().off('commandStarted', listener);
      const sorted = [...samples].sort((a, b) => a - b);
      measured[mode] = { ...storage, bulkInsertMs: bulkMs[mode], transactionSamples: 40,
        insertCommandsPerChange: inserts / 40, transactionP50Ms: sorted[19], transactionP95Ms: sorted[37],
        sequentialChangesPerSecond: 40000 / samples.reduce((sum, value) => sum + value, 0) };
      await connection.dropDatabase(); await connection.close();
    }
    results.push({ changes: count, identicalAuditViews: true, ...measured });
  }
  console.log(JSON.stringify({ synthetic: true, mongoVersion: '8.0.34', nodeVersion: process.version,
    note: 'Balanced four types, one client, 5 warmups; physical allocation is checkpoint-dependent; no production latency/RSS claim', results }, null, 2));
} finally { await Promise.all(connections.map(connection => connection.close())); await replica.stop(); }
