import { performance } from 'node:perf_hooks';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';

// Always starts an isolated disposable server; never accepts a database URI.
const server = await MongoMemoryServer.create({ binary: { version: '8.0.34' } });
let connection;
const now = new Date('2026-11-07T00:00:00Z');
const filter = { deliveryState: 'PENDING', nextAttemptAt: { $lte: now } };
const sort = { createdAt: 1, _id: 1 };
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const indexes = {
  baseline: [{ deliveryState: 1, nextAttemptAt: 1 }, {}],
  fifo: [{ createdAt: 1, _id: 1, nextAttemptAt: 1 }, { partialFilterExpression: { deliveryState: 'PENDING' } }]
};
const results = [];
try {
  connection = await mongoose.createConnection(server.getUri(), { dbName: 'synthetic_mail_benchmark' }).asPromise();
  for (const size of [1000, 10000, 100000]) {
    for (const workload of ['backlog', 'future-first', 'mostly-accepted']) {
      const rows = Array.from({ length: size }, (_, i) => ({
        _id: String(i).padStart(8, '0'), applicationId: `synthetic-${i}`,
        deliveryState: workload === 'mostly-accepted' && i % 100 !== 0 ? 'ACCEPTED' : 'PENDING',
        nextAttemptAt: new Date(now.getTime() + (workload === 'future-first' && i < size * 0.9 ? 60000 : -60000)),
        createdAt: new Date(now.getTime() - size + i), attempts: 0,
        contactCiphertext: 'synthetic-not-a-recipient'.repeat(8)
      }));
      for (const [name, [key, options]] of Object.entries(indexes)) {
        const collection = connection.db.collection(`${workload}_${name}`);
        await collection.drop().catch(error => { if (error.code !== 26) throw error; });
        await collection.createIndex(key, { ...options, name: 'candidate' });
        const writeStart = performance.now();
        for (let offset = 0; offset < size; offset += 1000) await collection.insertMany(rows.slice(offset, offset + 1000));
        const insertMs = performance.now() - writeStart;
        const query = () => collection.find(filter).sort(sort).limit(1).maxTimeMS(10000);
        const explain = await query().explain('executionStats');
        for (let warmup = 0; warmup < 5; warmup++) await query().toArray();
        const times = [];
        for (let run = 0; run < 40; run++) {
          const start = performance.now();
          await query().toArray();
          times.push(performance.now() - start);
        }
        // WiredTiger sizes before a checkpoint can report only one empty page.
        await connection.db.admin().command({ fsync: 1 });
        const stats = await connection.db.command({ collStats: collection.collectionName });
        const stages = [];
        const walk = value => {
          if (!value || typeof value !== 'object') return;
          if (value.stage) stages.push(value.stage);
          Object.values(value).forEach(walk);
        };
        walk(explain.queryPlanner.winningPlan);
        results.push({ size, workload, index: name, p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95),
          sequentialReadsPerSecond: 40000 / times.reduce((a, b) => a + b, 0), insertMs,
          indexBytes: stats.totalIndexSize, keysExamined: explain.executionStats.totalKeysExamined,
          docsExamined: explain.executionStats.totalDocsExamined, returned: explain.executionStats.nReturned,
          stages, clientRssBytes: process.memoryUsage().rss });
        await collection.drop();
      }
    }
  }
  console.log(JSON.stringify({ synthetic: true, mongoVersion: '8.0.34', nodeVersion: process.version,
    samples: 40, queryCountPerSample: 1, concurrentClients: 1, results }, null, 2));
} finally {
  await connection?.close();
  await server.stop();
}
