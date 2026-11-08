import { afterAll, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';
import { settlementModels } from '../../src/models/settlement.model.js';
import { earningAccrualModels } from '../../src/models/earning-accrual.model.js';

let server;
const connections = [];
let legacyCollections;
beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.0.34' } });
  const definitions = mongoose.createConnection();
  legacyCollections = Object.values({ ...settlementModels(definitions), ...earningAccrualModels(definitions) })
    .map(model => model.collection.name);
  await definitions.close();
}, 600000);
afterAll(async () => {
  await Promise.all(connections.map(connection => connection.close()));
  await server?.stop();
}, 30000);
async function connect(name) {
  const connection = await mongoose.createConnection(server.getUri(), {
    dbName: name, autoCreate: false, autoIndex: false, monitorCommands: true
  }).asPromise();
  connections.push(connection);
  return connection;
}

test.each([undefined, 'EMPLOYEE'])('employee composition (%s) does not provision or query legacy accrual storage', async compensationModel => {
  const connection = await connect(compensationModel ? 'explicit_employee' : 'default_employee');
  const service = createBookingFinanceSourceService({ connection, ...(compensationModel ? { compensationModel } : {}) });
  const registered = Object.values(connection.models).map(model => model.collection.name);
  expect(registered.filter(name => legacyCollections.includes(name))).toEqual([]);
  // Exercise the real provisioner: registration alone used to create all 16 stores.
  await provisionDeploymentStorage({ connection });
  const physical = (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
  expect(physical.filter(name => legacyCollections.includes(name))).toEqual([]);
  const commands = [];
  const listener = command => commands.push(command.commandName);
  connection.getClient().on('commandStarted', listener);
  try {
    expect(await service.drain()).toEqual([]);
    await service.enqueue({ _id: new mongoose.Types.ObjectId() });
    expect(commands).toEqual([]);
  } finally {
    connection.getClient().off('commandStarted', listener);
  }
});

test('explicit legacy composition retains its collections, unique indexes and producer', async () => {
  const connection = await connect('explicit_legacy');
  createBookingFinanceSourceService({ connection, compensationModel: 'LEGACY_PARTNER' });
  await provisionDeploymentStorage({ connection, env: { COMPENSATION_PROFILE: 'LEGACY_PARTNER' } });
  const physical = (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
  expect(legacyCollections).toHaveLength(16);
  expect(legacyCollections.every(name => physical.includes(name))).toBe(true);
  const indexes = await connection.db.collection('bookingearningsnapshots').listIndexes().toArray();
  expect(indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify({ sitterId: 1, bookingId: 1 }))).toBe(true);
});

test('invalid compensation mode fails before registering any storage', async () => {
  const connection = await connect('invalid_mode');
  expect(() => createBookingFinanceSourceService({ connection, compensationModel: 'UNKNOWN' })).toThrow('Invalid compensation model');
  expect(Object.keys(connection.models)).toEqual([]);
});
