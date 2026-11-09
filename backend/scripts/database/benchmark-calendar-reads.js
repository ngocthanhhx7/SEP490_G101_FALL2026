import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { createCalendarReader } from '../../src/services/employee-scheduling/calendar-read.service.js';

const replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
let connection;
const DAY = 86400000, origin = Date.parse('2026-11-01T00:00:00Z');
const dates = Array.from({ length: 31 }, (_, i) => new Date(origin + i * DAY).toISOString().slice(0, 10));
const windows = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, startLocalTime: '08:00', endLocalTime: '18:00' }));
try {
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_calendar_reads', monitorCommands: true }).asPromise();
  const { EmployeeAvailability: Availability, EmployeeAvailabilityRevision: Revision } = employeeSchedulingModels(connection);
  await Availability.init(); await Revision.init();
  const sitters = Array.from({ length: 100 }, () => String(new mongoose.Types.ObjectId())), sitterId = sitters[0];
  await Availability.create({ _id: sitterId, dayOffDates: [dates[3]], workingWindows: windows, areas: ['synthetic'], state: 'ACTIVE', version: 1 });
  await connection.db.collection('aisitterprofiles').insertOne({ userId: new mongoose.Types.ObjectId(sitterId), dayOffDates: [dates[4]], syntheticUnusedPayload: 'x'.repeat(2048) });
  async function legacy({ fromLocalDate, toLocalDate }) {
    const [current, capability] = await Promise.all([Availability.findById(sitterId).lean(),
      connection.db.collection('aisitterprofiles').findOne({ userId: new mongoose.Types.ObjectId(sitterId) })]);
    const off = new Set([...(current?.dayOffDates ?? []), ...(capability?.dayOffDates ?? [])]), result = [];
    for (let time = Date.parse(fromLocalDate + 'T00:00:00Z'); time <= Date.parse(toLocalDate + 'T00:00:00Z'); time += DAY) {
      const date = new Date(time).toISOString().slice(0, 10), weekday = new Date(time).getUTCDay() || 7;
      const row = await Revision.findOne({ sitterId, effectiveFrom: { $lte: date } }).sort({ effectiveFrom: -1, version: -1 }).lean();
      const selected = (row?.workingWindows ?? []).filter(item => item.weekday === weekday);
      result.push({ localDate: date, windows: selected, isDayOff: off.has(date), available: selected.length > 0 && !off.has(date) });
    }
    return result;
  }
  const batched = createCalendarReader({ connection, Availability, Revision }), results = [];
  let rangeExplain;
  for (const count of [1000, 10000, 100000]) {
    await Revision.deleteMany({});
    await Revision.create({ sitterId, effectiveFrom: '2026-10-31', version: 0, workingWindows: windows });
    for (let start = 0; start < count; start += 1000) {
      await Revision.insertMany(Array.from({ length: Math.min(1000, count - start) }, (_, offset) => {
        const index = start + offset;
        return { sitterId: sitters[index % 100], effectiveFrom: dates[Math.floor(index / 100) % 31],
          version: index + 1, workingWindows: index % 3 ? windows : [] };
      }));
    }
    if (count === 100000) {
      const explained = await Revision.aggregate([
        { $match: { sitterId, effectiveFrom: { $gt: dates[0], $lte: dates[30] } } },
        { $sort: { effectiveFrom: -1, version: -1 } },
        { $group: { _id: '$effectiveFrom', effectiveFrom: { $first: '$effectiveFrom' },
          version: { $first: '$version' }, workingWindows: { $first: '$workingWindows' } } }, { $limit: 32 }
      ]).option({ maxTimeMS: 5000, allowDiskUse: false }).explain('executionStats');
      const cursor = explained.stages?.find(stage => stage.$cursor)?.$cursor ?? explained;
      const stages = [];
      function collect(plan) { if (!plan || typeof plan !== 'object') return; if (plan.stage) stages.push(plan.stage);
        for (const value of Object.values(plan)) if (value && typeof value === 'object') collect(value); }
      collect(cursor.queryPlanner?.winningPlan);
      rangeExplain = { stages: [...new Set(stages)], keys: cursor.executionStats?.totalKeysExamined,
        documents: cursor.executionStats?.totalDocsExamined, returned: cursor.executionStats?.nReturned };
    }
    for (const days of [1, 7, 31]) {
      const input = { sitterId, fromLocalDate: dates[0], toLocalDate: dates[days - 1] }, measures = {};
      assert.deepEqual(await batched(input), await legacy(input));
      for (const [name, read] of Object.entries({ legacy, batched })) {
        for (let warm = 0; warm < 3; warm++) await read(input);
        let commands = 0, commits = 0, returnedBsonBytes = 0;
        const started = event => { if (['find', 'aggregate', 'getMore'].includes(event.commandName)) commands++; if (event.commandName === 'commitTransaction') commits++; };
        const succeeded = event => {
          if (['find', 'aggregate', 'getMore'].includes(event.commandName)) for (const row of event.reply.cursor?.firstBatch ?? event.reply.cursor?.nextBatch ?? []) {
            returnedBsonBytes += mongoose.mongo.BSON.calculateObjectSize(row);
          }
        };
        connection.getClient().on('commandStarted', started); connection.getClient().on('commandSucceeded', succeeded);
        const samples = [];
        for (let run = 0; run < 20; run++) { const start = performance.now(); await read(input); samples.push(performance.now() - start); }
        connection.getClient().off('commandStarted', started); connection.getClient().off('commandSucceeded', succeeded);
        samples.sort((a, b) => a - b);
        measures[name] = { samples: 20, dataCommands: commands / 20, commits: commits / 20,
          returnedDocumentBsonBytes: returnedBsonBytes / 20, p50Ms: samples[9], p95Ms: samples[18] };
      }
      results.push({ revisions: count + 1, sitters: 100, days, identicalDto: true, ...measures });
    }
  }
  console.log(JSON.stringify({ synthetic: true, mongoVersion: '8.0.34', results, rangeExplain,
    note: 'Same DTO and native indexes; old then new with warm cache, one client. Snapshot read session without commit; no production latency/RSS/capacity claim.' }, null, 2));
} finally { await connection?.close(); await replica.stop(); }
