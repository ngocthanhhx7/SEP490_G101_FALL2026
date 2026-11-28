import { createHmac } from 'node:crypto';
import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createEmploymentDocumentService } from '../../src/services/payroll/employment-document.service.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { createPayrollService } from '../../src/services/payroll/payroll.service.js';
import { employmentTerms } from '../fixtures/employment-terms.js';

let replica, connection, crypto, admin, sitterId;
const oid = () => new mongoose.Types.ObjectId();
const clock = () => Date.parse('2026-11-05T03:00:00Z');
const lookupSecret = 'synthetic-st-onb-17-lookup-secret-0001';

const customPolicy = Object.freeze({
  version: 'PWC-TEST-POLICY-2026-11-28-v1',
  ready: true,
  salaryBasis: 'GROSS',
  fullTimeMonthlyBaseVnd: 12000000,
  partTimeMonthlyBaseVnd: 4500000,
  partTimeWeeklyMinutes: 1200,
  commissionBps: 500,
  advanceCapBps: 5000,
  kpiThresholdBps: [9000, 10000, 11000],
  fullTimeBonusVnd: [500000, 1000000, 1500000],
  partTimeBonusVnd: [150000, 300000, 450000],
  minimumOnTimeBps: 9500,
  minimumReportBps: 10000,
  advancesPerMonth: 1,
  interestBps: 0
});

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_st_onb_17' }).asPromise();
  crypto = createContactCrypto({
    lookupSecret,
    encryptionKey: '0123456789abcdef0123456789abcdef'
  });
  admin = { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0 };
  sitterId = oid();
  await connection.collection('users').insertMany([
    { _id: new mongoose.Types.ObjectId(admin.userId), roles: ['ADMIN'], state: 'ACTIVE', synthetic: false, authEpoch: 0 },
    { _id: sitterId, roles: ['PET_SITTER'], state: 'ACTIVE', displayName: 'Synthetic Sitter ST-ONB-17' }
  ]);
  await connection.collection('sitterapplications').insertOne({
    _id: oid(),
    submissionKeyDigest: 'synthetic-approved-' + String(sitterId),
    state: 'APPROVED',
    provisionedUserId: sitterId
  });
  // Ensure models and collections exist before transactions
  createEmploymentDocumentService({ connection, crypto, lookupSecret, clock });
  createPayrollService({ connection, policy: { resolve: async () => customPolicy }, clock: () => new Date(clock()), cursorSecret: 'synthetic-st-onb-17-cursor-secret-0001' });
  for (const model of Object.values(connection.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
}, 180000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

async function insertInterviewApplication() {
  const appId = oid();
  await connection.collection('sitterapplications').insertOne({
    _id: appId,
    submissionKeyDigest: 'synthetic-interview-' + String(appId),
    state: 'INTERVIEW',
    version: 2,
    displayName: 'Synthetic Applicant',
    employmentType: 'PART_TIME',
    identityLookupKey: createHmac('sha256', lookupSecret).update('applicant-identity\0' + '012345678901').digest('hex')
  });
  return String(appId);
}

test('ST-ONB-17 interview contract rejects mismatched monthlyBaseVnd with 422 and exposes approved payPolicy', async () => {
  const appId = await insertInterviewApplication();
  const service = createEmploymentDocumentService({
    connection,
    crypto,
    lookupSecret,
    clock,
    policy: { resolve: async () => customPolicy }
  });

  const fetched = await service.get(admin, appId);
  expect(fetched.payPolicy).toMatchObject({
    ready: true,
    version: customPolicy.version,
    fullTimeMonthlyBaseVnd: 12000000,
    partTimeMonthlyBaseVnd: 4500000
  });

  // Client submits tampered monthlyBaseVnd (not matching approved policy for PART_TIME)
  const tamperedTerms = employmentTerms({
    employmentType: 'PART_TIME',
    monthlyBaseVnd: 3000000,
    monthlyAllowanceVnd: 200000,
    effectiveOn: '2026-11-06',
    plannedSigningOn: '2026-11-05'
  });
  await expect(
    service.save(admin, appId, { applicationVersion: 2, expectedRevision: 0, terms: tamperedTerms }, 'st-onb-17-doc-mismatch')
  ).rejects.toMatchObject({
    status: 422,
    code: 'VALIDATION_FAILED',
    details: { fields: { monthlyBaseVnd: 'POLICY_MISMATCH' } }
  });

  // Matching policy base pay + allowance >= 0 succeeds
  const validTerms = employmentTerms({
    employmentType: 'PART_TIME',
    monthlyBaseVnd: 4500000,
    monthlyAllowanceVnd: 250000,
    effectiveOn: '2026-11-06',
    plannedSigningOn: '2026-11-05'
  });
  const saved = await service.save(admin, appId, { applicationVersion: 2, expectedRevision: 0, terms: validTerms }, 'st-onb-17-doc-valid');
  expect(saved.terms).toMatchObject({
    employmentType: 'PART_TIME',
    monthlyBaseVnd: 4500000,
    monthlyAllowanceVnd: 250000
  });
});

test('ST-ONB-17 interview contract blocks with 409 PAYROLL_POLICY_REQUIRED when approved pay policy is missing', async () => {
  const appId = await insertInterviewApplication();
  const service = createEmploymentDocumentService({
    connection,
    crypto,
    lookupSecret,
    clock,
    policy: { resolve: async () => ({ ready: false, version: null }) }
  });

  const fetched = await service.get(admin, appId);
  expect(fetched.payPolicy).toMatchObject({
    ready: false,
    fullTimeMonthlyBaseVnd: null,
    partTimeMonthlyBaseVnd: null
  });

  const terms = employmentTerms({
    employmentType: 'FULL_TIME',
    monthlyBaseVnd: 10000000,
    effectiveOn: '2026-11-06',
    plannedSigningOn: '2026-11-05'
  });
  await expect(
    service.save(admin, appId, { applicationVersion: 2, expectedRevision: 0, terms }, 'st-onb-17-doc-no-policy')
  ).rejects.toMatchObject({
    status: 409,
    code: 'PAYROLL_POLICY_REQUIRED'
  });
});

test('ST-ONB-17 recordContract enforces resolved payPolicy base pay, blocks unready policy with 409, and saves monthlyAllowanceVnd', async () => {
  const unreadyPayroll = createPayrollService({
    connection,
    policy: { resolve: async () => ({ ready: false, version: null }) },
    clock: () => new Date(clock()),
    cursorSecret: 'synthetic-st-onb-17-cursor-secret-0001'
  });

  const basePayload = {
    employeeId: String(sitterId),
    expectedVersion: 0,
    employmentType: 'PART_TIME',
    salaryBasis: 'GROSS',
    monthlyBaseVnd: 4500000,
    monthlyAllowanceVnd: 300000,
    payCycle: 'MONTHLY',
    weeklyMinutes: 1200,
    signedAt: '2026-11-01T00:00:00Z',
    effectiveAt: '2026-11-02T00:00:00Z',
    contractReference: 'HD-ST-ONB-17-01',
    workplaceRegion: 1,
    workplaceReference: 'Cau Giay, Ha Noi'
  };

  await expect(
    unreadyPayroll.recordContract(admin, basePayload, 'st-onb-17-rec-unready')
  ).rejects.toMatchObject({ status: 409, code: 'PAYROLL_POLICY_REQUIRED' });

  const payroll = createPayrollService({
    connection,
    policy: { resolve: async () => customPolicy },
    clock: () => new Date(clock()),
    cursorSecret: 'synthetic-st-onb-17-cursor-secret-0001'
  });

  // Overview exposes payPolicy for Admin UI
  const overview = await payroll.overview(admin);
  expect(overview.payPolicy).toMatchObject({
    ready: true,
    version: customPolicy.version,
    fullTimeMonthlyBaseVnd: 12000000,
    partTimeMonthlyBaseVnd: 4500000
  });

  // Mismatched monthlyBaseVnd against customPolicy is rejected with 422
  await expect(
    payroll.recordContract(admin, { ...basePayload, monthlyBaseVnd: 3000000 }, 'st-onb-17-rec-mismatch')
  ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });

  // Negative allowance is rejected with 422
  await expect(
    payroll.recordContract(admin, { ...basePayload, monthlyAllowanceVnd: -1 }, 'st-onb-17-rec-neg-allow')
  ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });

  // Matching customPolicy base pay + allowance succeeds and persists both
  const saved = await payroll.recordContract(admin, basePayload, 'st-onb-17-rec-valid');
  expect(saved.version).toBe(1);
  const stored = await payroll.models.EmploymentContract.findById(saved.id).lean();
  expect(stored).toMatchObject({
    employmentType: 'PART_TIME',
    monthlyBaseVnd: 4500000,
    monthlyAllowanceVnd: 300000
  });
});
