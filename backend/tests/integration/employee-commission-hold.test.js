import { beforeAll, beforeEach, afterAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createPayrollService } from '../../src/services/payroll/payroll.service.js';
import { employeePayrollPolicyResolver } from '../../src/constants/employee-payroll-policy.js';
import { createMongoComplaintRepository } from '../../src/services/complaints/mongo-complaint.repository.js';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';

const oid = () => new mongoose.Types.ObjectId();
let replica, connection, payroll, complaints, employeeId, bookingId, visitId, caseId, creditId, at;
const admin = { userId: String(oid()), state: 'ACTIVE', roles: ['ADMIN'] };
const assessment = (start = '2026-10-01T00:00:00+07:00', end = '2026-11-01T00:00:00+07:00') => ({
  employeeId: String(employeeId), periodStart: start, periodEnd: end, dueAt: end,
  scheduledMonthMinutes: 4800, paidPeriodMinutes: 4800, kpiTargetMinutes: 0, seriousViolationConfirmed: false,
  includeMonthlyBonus: false, overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0,
  otherLawfulDeductionsVnd: 0, assessmentReference: 'synthetic-confirmed-assessment',
  deductionConsentReference: 'synthetic-no-deductions', advanceRepayments: []
});
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_employee_holds' }).asPromise();
  payroll = createPayrollService({ connection, policy: employeePayrollPolicyResolver, clock: () => at });
  const finance = createBookingFinanceSourceService({ connection });
  complaints = createMongoComplaintRepository({ connection, finance, compensationModel: 'EMPLOYEE', cursorSecret: 'synthetic-employee-case-cursor-secret' });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  await provisionFinanceSources(connection);
}, 600000);
beforeEach(async () => {
  for (const { name } of await connection.db.listCollections({}, { nameOnly: true }).toArray()) await connection.collection(name).deleteMany({});
  at = new Date('2026-12-01T04:00:00Z');
  employeeId = oid(); bookingId = oid(); visitId = oid(); caseId = 'case-' + oid();
  await connection.collection('users').insertOne({ _id: employeeId, displayName: 'Synthetic employee', state: 'ACTIVE', roles: ['PET_SITTER'] });
  await payroll.models.EmploymentContract.create({ employeeId, version: 1, employmentType: 'PART_TIME', salaryBasis: 'GROSS', monthlyBaseVnd: 3000000,
    monthlyAllowanceVnd: 200000, payCycle: 'MONTHLY', weeklyMinutes: 1200, signedAt: new Date('2026-01-01'), effectiveAt: new Date('2026-01-01'),
    contractReference: 'synthetic-contract', workplaceRegion: 1, workplaceReference: 'synthetic-workplace', verifiedBy: admin.userId, recordedAt: at });
  const credit = await payroll.models.PayrollServiceCredit.create({ visitId, bookingId, employeeId, completedAt: new Date('2026-10-10'),
    serviceNetVnd: 1000000, careMinutes: 60, onTime: true, reportsComplete: true, sourceVersion: 1, policyVersion: 'synthetic-v1' });
  creditId = credit._id;
  await connection.collection('bookings').insertOne({ _id: bookingId, version: 0, state: 'COMPLETED' });
  await connection.collection('visits').insertOne({ _id: visitId, bookingId, sitterId: employeeId, customerId: new mongoose.Types.ObjectId(admin.userId), state: 'COMPLETED' });
  await connection.collection('cases').insertOne({ _id: caseId, kind: 'COMPLAINT', bookingId, visitId, version: 0, state: 'OPEN', financialHold: true });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
const change = (expectedVersion, state, financialHold) => complaints.runForCase(admin, caseId, tx =>
  tx.updateComplaint({ complaintId: caseId, expectedVersion, actorId: admin.userId, decision: { state, financialHold } }));

test('unresolved complaint holds commission only, final release carries prior credit exactly once', async () => {
  const held = await payroll.prepareStatement(admin, assessment(), 'held-october');
  expect(held.breakdown).toMatchObject({ baseVnd: 3000000, allowanceVnd: 200000, commissionVnd: 0 });
  expect(held.heldCommissionCredits).toBe(1);
  expect(await payroll.models.PayrollSourceClaim.findById(`credit:${creditId}`)).toBeNull();
  await change(0, 'RESOLVED', false);
  const sources = await import('../../src/services/payroll/commission-source.service.js');
  expect((await sources.createCommissionSources({ connection }).payable(String(employeeId), at)).held).toHaveLength(1);
  await change(1, 'CLOSED', false);
  const november = assessment('2026-11-01T00:00:00+07:00', '2026-12-01T00:00:00+07:00');
  const released = await payroll.prepareStatement(admin, november, 'released-november');
  expect(released.breakdown).toMatchObject({ baseVnd: 3000000, allowanceVnd: 200000, commissionVnd: 50000 });
  expect(await payroll.models.PayrollSourceClaim.countDocuments({ _id: `credit:${creditId}` })).toBe(1);
  expect(await payroll.prepareStatement(admin, november, 'released-november')).toEqual(released);
});

test('hold after approval blocks payment; explicit unpaid void releases claims and preserves original snapshot', async () => {
  await change(0, 'CLOSED', false);
  const prepared = await payroll.prepareStatement(admin, assessment(), 'before-case');
  await payroll.decideStatement(admin, prepared.id, { action: 'APPROVE', expectedVersion: 0 }, 'approve-before-case');
  await change(1, 'OPEN', true);
  await expect(payroll.decideStatement(admin, prepared.id, { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'synthetic-bank' }, 'pay-held'))
    .rejects.toMatchObject({ code: 'PAYROLL_COMMISSION_HELD' });
  await expect(payroll.decideStatement(admin, prepared.id, { action: 'VOID_UNPAID', expectedVersion: 1, reason: 'Synthetic case review', confirmNoPayment: false }, 'void-no-attest'))
    .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const voided = await payroll.decideStatement(admin, prepared.id, { action: 'VOID_UNPAID', expectedVersion: 1, reason: 'Synthetic case review', confirmNoPayment: true }, 'void-unpaid');
  expect(voided.status).toBe('VOIDED'); expect(voided.breakdown).toEqual(prepared.breakdown);
  const replacement = await payroll.prepareStatement(admin, assessment(), 'base-after-case');
  expect(replacement.breakdown).toMatchObject({ baseVnd: 3000000, allowanceVnd: 200000, commissionVnd: 0 });
});

test('concurrent complaint reopening and approval serialize; payment rechecks the committed hold', async () => {
  await change(0, 'CLOSED', false);
  const prepared = await payroll.prepareStatement(admin, assessment(), 'race-prepared');
  const result = await Promise.allSettled([
    change(1, 'OPEN', true),
    payroll.decideStatement(admin, prepared.id, { action: 'APPROVE', expectedVersion: 0 }, 'race-approve')
  ]);
  expect(result[0].status).toBe('fulfilled');
  if (result[1].status === 'fulfilled') await expect(payroll.decideStatement(admin, prepared.id,
    { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'synthetic-race-bank' }, 'race-payment')).rejects.toMatchObject({ code: 'PAYROLL_COMMISSION_HELD' });
  else expect(result[1].reason.code).toBe('PAYROLL_COMMISSION_HELD');
  expect(await payroll.models.PayrollStatement.countDocuments({ status: 'PAID' })).toBe(0);
});

test('pending refund holds credits and a paid statement cannot be voided', async () => {
  await change(0, 'CLOSED', false);
  await connection.collection('refunds').insertOne({ _id: oid(), bookingId, state: 'TRANSFER_PENDING' });
  const held = await payroll.prepareStatement(admin, assessment(), 'refund-held');
  expect(held.breakdown.commissionVnd).toBe(0);
  await payroll.decideStatement(admin, held.id, { action: 'APPROVE', expectedVersion: 0 }, 'refund-base-approve');
  await payroll.decideStatement(admin, held.id, { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'synthetic-base-payment' }, 'refund-base-paid');
  await expect(payroll.decideStatement(admin, held.id, { action: 'VOID_UNPAID', expectedVersion: 2, reason: 'Synthetic invalid void', confirmNoPayment: true }, 'void-paid'))
    .rejects.toMatchObject({ code: 'INVALID_STATE' });
});
