import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createAdminDashboardRouter } from '../../src/routes/admin-dashboard.routes.js';
import { createAdminDashboardService } from '../../src/services/dashboards/admin-dashboard.service.js';
import { createMongoOperationalDashboardRepository } from '../../src/services/dashboards/mongo-operational-dashboard.repository.js';

let replica;
let connection;
let api;

const adminId = new mongoose.Types.ObjectId();
const actor = role => ({
  userId: String(adminId),
  roles: [role],
  state: 'ACTIVE',
  expiresAt: Date.now() + 3600000
});

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'fe20_admin_dashboard_test' }).asPromise();
  await connection.db.createCollection('visits');
  await connection.db.createCollection('sitterapplications');
  const repository = createMongoOperationalDashboardRepository({
    connection,
    cursorSecret: 'synthetic-fe20-dashboard-cursor-secret',
    clock: () => Date.parse('2026-11-24T03:00:00.000Z')
  });
  const service = createAdminDashboardService({ repository });
  const sessionPort = {
    authenticate: async req => req.get('x-test-role') ? actor(req.get('x-test-role')) : null
  };
  api = express();
  api.use('/api/v1', createAdminDashboardRouter({ service, sessionPort }));
  api.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code } }));
}, 180000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

beforeEach(async () => {
  await connection.db.collection('visits').deleteMany({});
  await connection.db.collection('sitterapplications').deleteMany({});
});

describe('FE-20 UC-54 - View Admin Dashboard', () => {
  test('IT-FE20-UC54-01 requires an Admin session and returns dashboard counts', async () => {
    await connection.db.collection('visits').insertOne({
      state: 'ASSIGNED',
      startAt: new Date('2026-11-24T04:00:00.000Z'),
      needsAction: true
    });
    await connection.db.collection('sitterapplications').insertOne({
      state: 'PENDING',
      createdAt: new Date('2026-11-24T02:00:00.000Z')
    });

    await request(api).get('/api/v1/dashboards/admin').expect(401);
    await request(api).get('/api/v1/dashboards/admin').set('x-test-role', 'CUSTOMER').expect(403);
    const response = await request(api).get('/api/v1/dashboards/admin').set('x-test-role', 'ADMIN').expect(200);

    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.data).toMatchObject({
      kind: 'admin-dashboard',
      metrics: [
        { key: 'pendingApplications', value: 1 },
        { key: 'needsAction', value: 1 }
      ]
    });
  });

  test.todo('IT-FE20-UC54-02 counts today visits across booking and visit states');
  test.todo('IT-FE20-UC54-03 counts today shop grooming appointments');
  test.todo('IT-FE20-UC54-04 counts visits without an assigned Pet Sitter');
  test.todo('IT-FE20-UC54-05 counts open Incidents');
  test.todo('IT-FE20-UC54-06 counts open Complaints');
  test.todo('IT-FE20-UC54-07 lists Incidents and Complaints open for more than three days');
  test.todo('IT-FE20-UC54-08 calculates monthly service revenue after recorded refunds');
  test.todo('IT-FE20-UC54-09 aggregates product sales from online orders and counter sales');
  test.todo('IT-FE20-UC54-10 navigates each See list action to the corresponding Admin page');
  test('IT-FE20-UC54-11 returns zero pending applications and visits needing action for an empty database', async () => {
    const response = await request(api).get('/api/v1/dashboards/admin').set('x-test-role', 'ADMIN').expect(200);
    expect(response.body.data.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'pendingApplications', value: 0 }),
      expect.objectContaining({ key: 'needsAction', value: 0 })
    ]));
  });
  test.todo('IT-FE20-UC54-12 refreshes Incident and Complaint indicators after state changes');
});
