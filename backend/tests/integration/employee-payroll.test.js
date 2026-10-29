import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import { createPayrollService } from '../../src/services/payroll/payroll.service.js';
import { payrollRuntimeModule } from '../../src/routes/employee-payroll.routes.js';
import { employeePayrollPolicyResolver } from '../../src/constants/employee-payroll-policy.js';
import { errorHandler, requestId } from '../../src/middlewares/http.js';
let replica, connection, service, app, at = new Date('2026-10-30T09:00:00Z');
const oid = () => new mongoose.Types.ObjectId();
const sitter = { userId: String(oid()), roles: ['PET_SITTER'], state: 'ACTIVE' }, admin = { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' }, other = { ...sitter, userId: String(oid()) };
const contract = () => ({ employeeId: sitter.userId, expectedVersion: 0, employmentType: 'PART_TIME', salaryBasis: 'GROSS', monthlyBaseVnd: 3000000,
  payCycle: 'WEEKLY', weeklyMinutes: 1200, signedAt: '2026-10-01T00:00:00Z', effectiveAt: '2026-10-01T00:00:00Z',
  contractReference: 'synthetic-contract-reference', workplaceRegion: 1, workplaceReference: 'synthetic-workplace' });
const advance = () => ({ amountVnd: 1500000, reason: 'Synthetic requested advance', settlementPeriod: '2026-11', settlementConsentReference: 'synthetic-agreed-settlement' });
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_payroll' }).asPromise();
  service = createPayrollService({ connection, policy: employeePayrollPolicyResolver, clock: () => at, cursorSecret: 'synthetic-employee-payroll-cursor-secret' });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  await connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(sitter.userId), state: 'ACTIVE', roles: ['PET_SITTER'] });
  await connection.collection('sitterapplications').insertOne({ _id: oid(), state: 'APPROVED', provisionedUserId: new mongoose.Types.ObjectId(sitter.userId) });
  await connection.collection('sitterstatuses').insertOne({ _id: oid(), userId: new mongoose.Types.ObjectId(sitter.userId), status: 'ACTIVE', version: 0, changedAt: at });
  const sessions = { authenticate: async req => {
    const actor = ({ sitter, admin, other })[req.get('x-test-actor')]; return actor ? { ...actor, expiresAt: at.getTime() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'test-csrf' };
  const module = payrollRuntimeModule({ config: { auth: { enabled: true } }, connection, sessionService: sessions, clock: () => at.getTime() });
  app = express(); app.use(express.json(), requestId); app.use(module.mount, module.router); app.use(errorHandler(() => {}));
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
test('only Admin can verify a real signed contract; owner sees no private contract reference', async () => {
  await expect(service.recordContract(sitter, contract(), 'contract-test-001')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const saved = await service.recordContract(admin, contract(), 'contract-test-001'); expect(saved.version).toBe(1);
  expect(await service.recordContract(admin, contract(), 'contract-test-001')).toEqual(saved);
  expect((await service.own(sitter)).contracts[0]).not.toHaveProperty('contractReference');
  expect((await service.own(other)).contracts).toEqual([]);
});
test('parallel submissions create one pending advance; rejection reason required; rejection restores allowance', async () => {
  const results = await Promise.allSettled([service.submitAdvance(sitter, advance(), 'advance-first-001'), service.submitAdvance(sitter, advance(), 'advance-second-002')]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const saved = results.find(r => r.status === 'fulfilled').value;
  await expect(service.decideAdvance(admin, saved.id, { expectedVersion: 0, action: 'REJECT' }, 'reject-first-001')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await service.decideAdvance(admin, saved.id, { expectedVersion: 0, action: 'REJECT', reason: 'Synthetic reason' }, 'reject-first-001');
  expect((await service.submitAdvance(sitter, advance(), 'advance-third-003')).status).toBe('SUBMITTED');
});
test('advance cap, independent role checks, approval/payment retry and monthly uniqueness', async () => {
  await expect(service.submitAdvance(sitter, { ...advance(), amountVnd: 1500001 }, 'over-cap-advance')).rejects.toMatchObject({ code: 'ADVANCE_LIMIT_EXCEEDED' });
  const saved = (await service.own(sitter)).advances.find(a => a.status === 'SUBMITTED');
  await expect(service.decideAdvance(other, saved.id, { action: 'WITHDRAW', expectedVersion: 0 }, 'foreign-withdraw')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await service.decideAdvance(admin, saved.id, { action: 'APPROVE', expectedVersion: 0 }, 'approve-advance-001');
  await expect(service.submitAdvance(sitter, advance(), 'after-approval-001')).rejects.toMatchObject({ code: 'ADVANCE_MONTH_ALREADY_USED' });
  await expect(service.decideAdvance(sitter, saved.id, { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'synthetic-bank-reference' }, 'payment-advance-001')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const paid = await service.decideAdvance(admin, saved.id, { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'synthetic-bank-reference' }, 'payment-advance-001');
  expect(paid.status).toBe('PAID');
  expect(await service.decideAdvance(admin, saved.id, { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'synthetic-bank-reference' }, 'payment-advance-001')).toEqual(paid);
});
test('HTTP session, role and CSRF protections apply', async () => {
  await request(app).get('/api/v1/payroll/me').expect(401);
  await request(app).get('/api/v1/payroll/advances').set('x-test-actor', 'sitter').expect(403);
  await request(app).post('/api/v1/payroll/advances').set('x-test-actor', 'sitter').send(advance()).expect(403);
  await request(app).get('/api/v1/payroll/me').set('x-test-actor', 'sitter').expect(200).expect('Cache-Control', 'private, no-store');
});

test('real completion credits feed weekly payroll without partner fee/tax; salary survives zero customer payments', async () => {
  at = new Date('2026-11-01T03:00:00Z');
  await service.models.PayrollServiceCredit.create({ visitId: oid(), bookingId: oid(), employeeId: sitter.userId,
    completedAt: new Date('2026-10-26T04:00:00Z'), serviceNetVnd: 1000000, careMinutes: 60,
    onTime: true, reportsComplete: true, sourceVersion: 3, policyVersion: 'PWC-EMPLOYEE-PAYROLL-2026-10-30-v1' });
  const assessment = { employeeId: sitter.userId, periodStart: '2026-10-26T00:00:00+07:00', periodEnd: '2026-11-01T00:00:00+07:00', dueAt: '2026-11-02T00:00:00+07:00',
    scheduledMonthMinutes: 4800, paidPeriodMinutes: 1200, kpiTargetMinutes: 60, seriousViolationConfirmed: false, includeMonthlyBonus: true,
    overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0,
    assessmentReference: 'synthetic-approved-timecard-tax-assessment', deductionConsentReference: 'synthetic-no-deductions', advanceRepayments: [] };
  const saved = await service.prepareStatement(admin, assessment, 'prepare-statement-001');
  expect(saved.breakdown).toMatchObject({ baseVnd: 750000, commissionVnd: 50000, bonusVnd: 300000, payableVnd: 1100000 });
  expect(await service.prepareStatement(admin, assessment, 'prepare-statement-001')).toEqual(saved);
  await expect(service.prepareStatement(admin, assessment, 'prepare-statement-002')).rejects.toMatchObject({ code: 'PAYROLL_PERIOD_OVERLAP' });
  await service.decideStatement(admin, saved.id, { action: 'APPROVE', expectedVersion: 0 }, 'approve-statement-001');
  await expect(service.decideStatement(admin, saved.id, { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'synthetic-bank-reference' }, 'reuse-bank-reference-001'))
    .rejects.toMatchObject({ code: 'TRANSFER_REFERENCE_ALREADY_USED' });
  const paid = await service.decideStatement(admin, saved.id, { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'synthetic-salary-bank-reference' }, 'pay-statement-001');
  expect(paid.status).toBe('PAID');
  expect((await service.own(sitter)).statements[0].breakdown.payableVnd).toBe(1100000);
  expect(await connection.collection('payments').countDocuments()).toBe(0);
});

test('voiding an unapproved statement retains history and releases credits for a replacement only', async () => {
  await service.models.PayrollServiceCredit.create({ visitId: oid(), bookingId: oid(), employeeId: sitter.userId,
    completedAt: new Date('2026-10-20T04:00:00Z'), serviceNetVnd: 200000, careMinutes: 60,
    onTime: true, reportsComplete: true, sourceVersion: 3, policyVersion: 'PWC-EMPLOYEE-PAYROLL-2026-10-30-v1' });
  const assessment = { employeeId: sitter.userId, periodStart: '2026-10-19T00:00:00+07:00', periodEnd: '2026-10-26T00:00:00+07:00', dueAt: '2026-10-27T00:00:00+07:00',
    scheduledMonthMinutes: 4800, paidPeriodMinutes: 1200, kpiTargetMinutes: 0, seriousViolationConfirmed: false, includeMonthlyBonus: false,
    overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0,
    assessmentReference: 'synthetic-verified-assessment', deductionConsentReference: 'synthetic-no-deductions', advanceRepayments: [] };
  const first = await service.prepareStatement(admin, assessment, 'prepare-to-void-001');
  await expect(service.decideStatement(admin, first.id, { action: 'REJECT', expectedVersion: 0 }, 'void-reason-missing')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const voided = await service.decideStatement(admin, first.id, { action: 'REJECT', expectedVersion: 0, reason: 'Synthetic attendance correction' }, 'void-statement-001');
  expect(voided).toMatchObject({ status: 'VOIDED', voidReason: 'Synthetic attendance correction', breakdown: first.breakdown });
  const replacement = await service.prepareStatement(admin, assessment, 'prepare-replacement-001');
  expect(replacement.id).not.toBe(first.id); expect(replacement.breakdown.commissionVnd).toBe(10000);
  await service.decideStatement(admin, replacement.id, { action: 'APPROVE', expectedVersion: 0 }, 'approve-replacement-001');
  await expect(service.decideStatement(admin, replacement.id, { action: 'REJECT', expectedVersion: 1, reason: 'Cannot void approved payroll' }, 'reject-approved-statement'))
    .rejects.toMatchObject({ code: 'INVALID_STATE' });
  expect(await service.models.PayrollStatement.countDocuments({ _id: first.id, status: 'VOIDED' })).toBe(1);
  expect(await service.models.PayrollSourceClaim.countDocuments({ statementId: replacement.id })).toBe(1);
});

test('signed payroll pagination is scoped to employee, resource, view, page size and expiry', async () => {
  const first = await service.own(sitter, { limit: '1' }); expect(first.advances).toHaveLength(1); expect(first.advanceNextCursor).toEqual(expect.any(String));
  const second = await service.own(sitter, { limit: 1, advanceCursor: first.advanceNextCursor });
  expect(second.advances).toHaveLength(1); expect(second.advances[0].id).not.toBe(first.advances[0].id);
  await expect(service.own(other, { limit: 1, advanceCursor: first.advanceNextCursor })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await expect(service.own(sitter, { limit: 2, advanceCursor: first.advanceNextCursor })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await expect(service.own(sitter, { limit: 1, statementCursor: first.advanceNextCursor })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const adminHistory = await service.listAdvances(admin, { view: 'HISTORY', limit: 1 });
  expect(adminHistory.nextCursor).toEqual(expect.any(String));
  await expect(service.listAdvances(admin, { view: 'PENDING', limit: 1, cursor: adminHistory.nextCursor })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const savedAt = at; at = new Date(at.getTime() + 16 * 60000);
  try { await expect(service.own(sitter, { limit: 1, advanceCursor: first.advanceNextCursor })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' }); }
  finally { at = savedAt; }
  await expect(service.own(sitter, { limit: '0' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await expect(service.own(sitter, { employeeId: other.userId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});

test('an expired latest contract does not revive an earlier open-ended version', async () => {
  await service.recordContract(admin, { ...contract(), expectedVersion: 1, signedAt: '2026-10-31T00:00:00Z',
    effectiveAt: '2026-10-31T17:00:00Z', endsAt: '2026-11-01T00:00:00Z' }, 'record-ended-contract');
  expect((await service.own(sitter)).activeContractId).toBeNull();
  await expect(service.submitAdvance(sitter, advance(), 'advance-ended-contract')).rejects.toMatchObject({ code: 'CONTRACT_REQUIRED' });
});
