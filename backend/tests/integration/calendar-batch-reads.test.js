import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { createCalendarReader } from '../../src/services/employee-scheduling/calendar-read.service.js';

let replica, connection, models, read;
const sitterId = String(new mongoose.Types.ObjectId()), DAY = 86400000;
const windows = (start = '08:00', end = '18:00') => Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, startLocalTime: start, endLocalTime: end }));
const query = (fromLocalDate = '2026-11-01', toLocalDate = '2026-12-01') => ({ sitterId, fromLocalDate, toLocalDate });
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_calendar_batch', monitorCommands: true }).asPromise();
  models = employeeSchedulingModels(connection);
  await Promise.all(Object.values(models).map(Model => Model.init()));
  await connection.db.createCollection('aisitterprofiles');
  read = createCalendarReader({ connection, Availability: models.EmployeeAvailability, Revision: models.EmployeeAvailabilityRevision });
}, 600000);
beforeEach(async () => {
  await models.EmployeeAvailability.deleteMany({}); await models.EmployeeAvailabilityRevision.deleteMany({});
  await connection.db.collection('aisitterprofiles').deleteMany({});
  await models.EmployeeAvailability.create({ _id: sitterId, dayOffDates: ['2026-11-03'], state: 'ACTIVE', version: 1 });
  await connection.db.collection('aisitterprofiles').insertOne({ userId: new mongoose.Types.ObjectId(sitterId), dayOffDates: ['2026-11-04'] });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
async function legacy(input) {
  const current = await models.EmployeeAvailability.findById(sitterId).lean();
  const capability = await connection.db.collection('aisitterprofiles').findOne({ userId: new mongoose.Types.ObjectId(sitterId) });
  const offDates = new Set([...(current?.dayOffDates ?? []), ...(capability?.dayOffDates ?? [])]), rows = [];
  for (let at = Date.parse(input.fromLocalDate + 'T00:00:00Z'); at <= Date.parse(input.toLocalDate + 'T00:00:00Z'); at += DAY) {
    const localDate = new Date(at).toISOString().slice(0, 10), weekday = new Date(at).getUTCDay() || 7;
    const revision = await models.EmployeeAvailabilityRevision.findOne({ sitterId, effectiveFrom: { $lte: localDate } })
      .sort({ effectiveFrom: -1, version: -1 }).lean();
    const selected = (revision?.workingWindows ?? []).filter(row => row.weekday === weekday);
    rows.push({ localDate, available: selected.length > 0 && !offDates.has(localDate), windows: selected, isDayOff: offDates.has(localDate) });
  }
  return rows;
}

test('same calendar across baseline, date/version transitions, future and union of off dates', async () => {
  await models.EmployeeAvailabilityRevision.create([
    { sitterId, effectiveFrom: '2026-10-31', version: 1, workingWindows: windows() },
    { sitterId, effectiveFrom: '2026-11-01', version: 2, workingWindows: windows('09:00', '17:00') },
    { sitterId, effectiveFrom: '2026-11-05', version: 3, workingWindows: windows('10:00', '16:00') },
    { sitterId, effectiveFrom: '2026-11-05', version: 4, workingWindows: windows('22:00', '02:00') },
    { sitterId, effectiveFrom: '2026-11-20', version: 5, workingWindows: [] },
    { sitterId, effectiveFrom: '2026-12-02', version: 6, workingWindows: windows() },
    { sitterId: String(new mongoose.Types.ObjectId()), effectiveFrom: '2026-11-10', version: 10, workingWindows: [] }
  ]);
  expect(await read(query())).toEqual(await legacy(query()));
  const result = await read(query('2026-11-03', '2026-11-06'));
  expect(result.map(row => row.isDayOff)).toEqual([true, true, false, false]);
  expect(result[2].windows[0]).toMatchObject({ startLocalTime: '22:00', endLocalTime: '02:00' });
  expect(await read(query('2026-10-30', '2026-10-30'))).toEqual(await legacy(query('2026-10-30', '2026-10-30')));
});

test('calendar uses at most four data reads regardless of days or revisions per day', async () => {
  await models.EmployeeAvailabilityRevision.insertMany(Array.from({ length: 2000 }, (_, i) => ({ sitterId,
    effectiveFrom: '2026-11-15', version: i + 1, workingWindows: i === 1999 ? windows() : [] })));
  for (const input of [query('2026-11-01', '2026-11-01'), query('2026-11-01', '2026-11-07'), query()]) {
    const commands = [], listener = event => { if (['find', 'aggregate', 'getMore'].includes(event.commandName)) commands.push(event); };
    connection.getClient().on('commandStarted', listener);
    const result = await read(input);
    connection.getClient().off('commandStarted', listener);
    expect(commands).toHaveLength(input.fromLocalDate === input.toLocalDate ? 3 : 4);
    expect(commands.every(event => event.command.autocommit === undefined && event.command.lsid)).toBe(true);
    expect(commands.every(event => event.command.readConcern?.level === 'snapshot')).toBe(true);
    const snapshotTimes = commands.slice(1).map(event => String(event.command.readConcern.atClusterTime));
    expect(snapshotTimes.every(value => value !== 'undefined' && value === snapshotTimes[0])).toBe(true);
    expect(result).toEqual(await legacy(input));
  }
});

test('one snapshot never mixes old revision with concurrently updated off dates or transitions', async () => {
  await models.EmployeeAvailabilityRevision.create({ sitterId, effectiveFrom: '2026-11-01', version: 1, workingWindows: windows() });
  const old = await read(query('2026-11-05', '2026-11-06'));
  const collection = models.EmployeeAvailability.collection, original = collection.findOne;
  let injected = false;
  collection.findOne = async function (...args) {
    const value = await original.apply(this, args);
    if (!injected && args[1]?.session) {
      injected = true;
      await connection.transaction(async session => {
        await models.EmployeeAvailabilityRevision.create([{ sitterId, effectiveFrom: '2026-11-05', version: 2, workingWindows: [] }], { session });
        await connection.db.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(sitterId) },
          { $set: { dayOffDates: ['2026-11-06'] } }, { session });
      });
    }
    return value;
  };
  try { expect(await read(query('2026-11-05', '2026-11-06'))).toEqual(old); }
  finally { collection.findOne = original; }
  expect(injected).toBe(true);
  const fresh = await read(query('2026-11-05', '2026-11-06'));
  expect(fresh.map(row => row.available)).toEqual([false, false]);
  expect(fresh.map(row => row.isDayOff)).toEqual([false, true]);
});

test('invalid date/range and malformed persisted revision fail explicitly', async () => {
  await expect(read(query('2026-02-30', '2026-03-01'))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await expect(read(query('2026-11-01', '2026-12-02'))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await models.EmployeeAvailabilityRevision.collection.insertOne({ sitterId, effectiveFrom: '2026-11-05-invalid', version: 1, workingWindows: [] });
  await expect(read(query())).rejects.toMatchObject({ code: 'AVAILABILITY_UNAVAILABLE' });
});

test('snapshot with absent current/capability and no revisions returns an empty calendar without creating defaults', async () => {
  await models.EmployeeAvailability.deleteMany({});
  await connection.db.collection('aisitterprofiles').deleteMany({});
  expect(await read(query())).toEqual(await legacy(query()));
  expect((await read(query())).every(row => !row.available && !row.isDayOff && row.windows.length === 0)).toBe(true);
  expect(await models.EmployeeAvailability.countDocuments()).toBe(0);
  expect(await models.EmployeeAvailabilityRevision.countDocuments()).toBe(0);
});
