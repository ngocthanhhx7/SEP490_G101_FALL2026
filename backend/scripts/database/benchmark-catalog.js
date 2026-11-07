import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { loadConfig } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { provisionInitialCatalog } from '../../src/services/initial-catalog-provisioning.service.js';
import { provisionServiceDetails } from '../../src/services/service-details-provisioning.service.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';
import { createServiceCatalogService } from '../../src/services/service-catalog.service.js';
import { createServicePriceService } from '../../src/services/service-price.service.js';
import { servicePresentationModel } from '../../src/models/service-presentation.model.js';

const baselineSha = process.argv.find(arg => arg.startsWith('--baseline='))?.slice(11);
if (!/^[a-f0-9]{40}$/.test(baselineSha ?? '')) throw new Error('Provide --baseline=<reviewed full source SHA>');
const source = execFileSync('git', ['show', `${baselineSha}:backend/src/services/service-catalog.service.js`], { encoding: 'utf8', windowsHide: true });
const appErrorUrl = new URL('../../src/utils/app-error.js', import.meta.url).href;
const baselineSource = source.replace("'../utils/app-error.js'", JSON.stringify(appErrorUrl))
  .replace("'mongoose'", JSON.stringify(import.meta.resolve('mongoose')));
const baseline = await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);
const replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
let connection;
try {
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_catalog_benchmark', monitorCommands: true }).asPromise();
  createApp({ config: loadConfig({ NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'synthetic_catalog_benchmark' }), connection, env: {} });
  await provisionInitialCatalog({ connection }); await provisionServiceDetails(connection); await provisionDemoCatalog({ connection });
  const models = connection.models, Presentation = servicePresentationModel(connection);
  await Presentation.createCollection(); await Presentation.createIndexes();
  const services = await models.Service.find().lean();
  await Presentation.insertMany(services.filter(row => row.presentation).map(row => ({ serviceId: row._id, ...row.presentation })));
  const priceProvider = createServicePriceService({ connection, PriceVersion: models.ServicePriceVersion,
    Audit: models.ServicePriceAudit, serviceExists: async id => !!await models.Service.exists({ _id: id }) });
  const at = new Date();
  const options = { connection, Service: models.Service, ServiceVersion: models.ServiceVersion,
    PolicyVersion: models.ServicePolicyVersion, Audit: models.ServiceAudit, Presentation,
    priceProvider, catalogSettings: { isEnabledAt: async () => true } };
  const candidates = { baseline: baseline.createServiceCatalogService(options), optimized: createServiceCatalogService(options) };
  assert.deepEqual(await candidates.baseline.publicList({ at }), await candidates.optimized.publicList({ at }));
  const results = [];
  for (const [name, service] of Object.entries(candidates)) {
    for (let i = 0; i < 5; i++) await service.publicList({ at });
    let commands = 0;
    const listener = event => { if (['find', 'aggregate', 'getMore'].includes(event.commandName)) commands++; };
    connection.getClient().on('commandStarted', listener);
    const times = [];
    for (let run = 0; run < 40; run++) {
      const start = performance.now(); await service.publicList({ at }); times.push(performance.now() - start);
    }
    connection.getClient().off('commandStarted', listener);
    const ordered = [...times].sort((a, b) => a - b);
    results.push({ name, samples: 40, commandsPerList: commands / 40,
      p50Ms: ordered[19], p95Ms: ordered[37], sequentialListsPerSecond: 40000 / times.reduce((a, b) => a + b, 0),
      clientRssBytes: process.memoryUsage().rss });
  }
  console.log(JSON.stringify({ synthetic: true, baselineSha, serviceCount: 13, identicalDto: true,
    measures: 'domain service only; shared catalog-visibility HTTP query excluded', results }, null, 2));
} finally { await connection?.close(); await replica.stop(); }
