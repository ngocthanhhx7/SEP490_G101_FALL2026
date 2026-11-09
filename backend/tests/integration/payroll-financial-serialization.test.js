import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createPayrollService } from '../../src/services/payroll/payroll.service.js';
import { employeePayrollPolicyResolver } from '../../src/constants/employee-payroll-policy.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { createComplaintService } from '../../src/services/complaints/complaint.service.js';
import { createMongoComplaintRepository } from '../../src/services/complaints/mongo-complaint.repository.js';
import { recordEmployeeServiceCompletion } from '../../src/services/payroll/completion-payroll-source.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';

let replica, connection, payroll, complaints;
const at = new Date('2026-11-01T03:00:00Z'), completedAt = new Date('2026-10-26T04:00:00Z');
const oid = () => new mongoose.Types.ObjectId(), col = name => connection.db.collection(name);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_financial_serialization',
    autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
}, 600000);
beforeEach(async () => {
  await connection.dropDatabase(); await provisionFinanceSources(connection);
  payroll = createPayrollService({ connection, policy: employeePayrollPolicyResolver, clock: () => at,
    cursorSecret: 'synthetic-serialization-cursor-secret' });
  const finance = createBookingFinanceSourceService({ connection, compensationModel: 'EMPLOYEE', clock: () => at });
  complaints = createComplaintService({ repository: createMongoComplaintRepository({ connection, finance, compensationModel: 'EMPLOYEE',
    cursorSecret: 'synthetic-complaint-serialization-secret' }), clock: () => at });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
});
afterAll(async () => { await connection?.close(); await replica?.stop(); });

async function fixture() {
  const actor = role => ({ userId: String(oid()), roles: [role], state: 'ACTIVE', expiresAt: +at + 86400000 });
  const sitter = actor('PET_SITTER'), admin = actor('ADMIN'), customer = actor('CUSTOMER');
  await col('users').insertOne({ _id: new mongoose.Types.ObjectId(sitter.userId), state: 'ACTIVE', roles: ['PET_SITTER'], displayName: 'Synthetic employee' });
  await col('sitterapplications').insertOne({ _id: oid(), state: 'APPROVED', submissionKeyDigest: 'a'.repeat(40) + sitter.userId,
    provisionedUserId: new mongoose.Types.ObjectId(sitter.userId) });
  await col('sitterstatuses').insertOne({ _id: oid(), userId: new mongoose.Types.ObjectId(sitter.userId), status: 'ACTIVE', version: 0, changedAt: at });
  await payroll.recordContract(admin, { employeeId: sitter.userId, expectedVersion: 0, employmentType: 'PART_TIME', salaryBasis: 'GROSS',
    monthlyBaseVnd: 3000000, payCycle: 'WEEKLY', weeklyMinutes: 1200, signedAt: '2026-10-01T00:00:00Z', effectiveAt: '2026-10-01T00:00:00Z',
    contractReference: 'synthetic-private-contract', workplaceRegion: 1, workplaceReference: 'synthetic-workplace' }, 'synthetic-contract');
  const bookingId = oid(), visitId = oid();
  await col('bookings').insertOne({ _id: bookingId, customerId: new mongoose.Types.ObjectId(customer.userId), state: 'COMPLETED',
    paymentMode: 'POSTPAY', version: 0, originalVisitCount: 1 });
  const visit = { _id: visitId, bookingId, customerId: new mongoose.Types.ObjectId(customer.userId), sitterId: new mongoose.Types.ObjectId(sitter.userId),
    state: 'COMPLETED', version: 3, startAt: new Date(+completedAt - 3600000), endAt: completedAt,
    checkInAt: new Date(+completedAt - 3600000), checkOutAt: completedAt, completedAt,
    snapshots: { employeeServiceNetVnd: 1000000, serviceName: 'Synthetic care', privateAccessNotes: 'synthetic-private-entry' } };
  await col('visits').insertOne(visit);
  await createUnitOfWork(connection).run(session => recordEmployeeServiceCompletion({ connection, visits: [visit], session }));
  const assessment = { employeeId: sitter.userId, periodStart: '2026-10-26T00:00:00+07:00', periodEnd: '2026-11-01T00:00:00+07:00', dueAt: '2026-11-02T00:00:00+07:00',
    scheduledMonthMinutes: 4800, paidPeriodMinutes: 1200, kpiTargetMinutes: 60, seriousViolationConfirmed: false, includeMonthlyBonus: false,
    overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0,
    assessmentReference: 'synthetic-assessment', deductionConsentReference: 'synthetic-consent', advanceRepayments: [] };
  return { sitter, admin, customer, bookingId, visitId, assessment,
    prepare: () => payroll.prepareStatement(admin, assessment, 'synthetic-prepare'),
    open: () => complaints.submit({ actor: customer, visitId: String(visitId), expectedVersion: 3,
      idempotencyKey: 'synthetic-complaint', category: 'OTHER', summary: 'Synthetic complaint', description: 'Synthetic description' }) };
}
async function capture(work) {
  const commands = [], listener = e => { if (e.command.autocommit === false) commands.push({ name: e.commandName, command: e.command }); };
  connection.getClient().on('commandStarted', listener);
  try { return { result: await work(), commands }; } finally { connection.getClient().off('commandStarted', listener); }
}
function sharedSession(commands) {
  expect(commands.length).toBeGreaterThan(2);
  expect(new Set(commands.map(row => JSON.stringify(row.command.lsid))).size).toBe(1);
  expect(new Set(commands.map(row => row.command.txnNumber.toString())).size).toBe(1);
}

test('prepare and actual complaint hold each propagate one session through employee/booking guards and source/claim writes', async () => {
  const f = await fixture(), prepared = await capture(f.prepare); sharedSession(prepared.commands);
  expect(prepared.result.breakdown.commissionVnd).toBe(50000);
  expect(prepared.commands.some(row => row.command.findAndModify === payroll.models.PayrollMonthGuard.collection.name)).toBe(true);
  expect(prepared.commands.some(row => row.command.find === 'cases')).toBe(true);
  expect(prepared.commands.some(row => row.command.find === 'refunds')).toBe(true);
  expect(prepared.commands.some(row => row.command.insert === payroll.models.PayrollSourceClaim.collection.name)).toBe(true);
  const opened = await capture(f.open); sharedSession(opened.commands);
  expect(opened.commands.some(row => row.command.findAndModify === 'bookings')).toBe(true);
  expect(opened.commands.some(row => row.command.findAndModify === payroll.models.PayrollMonthGuard.collection.name)).toBe(true);
  expect(opened.commands.some(row => row.command.insert === 'cases')).toBe(true);
});

test('a real case opened after preparation blocks approval without altering snapshots or consuming transfer references', async () => {
  const f = await fixture(), statement = await f.prepare(); await f.open();
  await expect(payroll.decideStatement(f.admin, statement.id, { action: 'APPROVE', expectedVersion: 0 }, 'synthetic-approve'))
    .rejects.toMatchObject({ code: 'PAYROLL_COMMISSION_HELD' });
  const saved = await col('payrollstatements').findOne({ _id: new mongoose.Types.ObjectId(statement.id) });
  expect(saved.status).toBe('PREPARED'); expect(saved.version).toBe(0); expect(saved.breakdown).toEqual(statement.breakdown);
  expect(await payroll.models.PayrollSourceClaim.countDocuments({ _id: /^transfer:/ })).toBe(0);
});

test('case/approval races serialize on the shared employee guard and payment rechecks the resulting hold', async () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const f = await fixture(), statement = await f.prepare();
    const results = await Promise.allSettled([f.open(), payroll.decideStatement(f.admin, statement.id,
      { action: 'APPROVE', expectedVersion: 0 }, 'synthetic-race-approve')]);
    expect(results[0].status).toBe('fulfilled');
    if (results[1].status === 'fulfilled') {
      await expect(payroll.decideStatement(f.admin, statement.id, { action: 'RECORD_PAYMENT', expectedVersion: 1,
        transferReference: `synthetic-race-transfer-${attempt}` }, 'synthetic-race-pay')).rejects.toMatchObject({ code: 'PAYROLL_COMMISSION_HELD' });
    } else expect(results[1].reason.code).toBe('PAYROLL_COMMISSION_HELD');
    expect((await col('payrollstatements').findOne({ _id: new mongoose.Types.ObjectId(statement.id) })).status).not.toBe('PAID');
    expect(await col('cases').countDocuments({ bookingId: f.bookingId })).toBe(1);
  }
  expect(await payroll.models.PayrollSourceClaim.countDocuments({ _id: /^transfer:/ })).toBe(0);
});

test('refund hold reader blocks approve/pay, while raw refund producer serialization remains an adapter gate', async () => {
  const f = await fixture(), statement = await f.prepare(), refund = { _id: oid(), bookingId: f.bookingId, state: 'APPROVED' };
  await col('refunds').insertOne(refund); // Explicit reader fixture, not a mounted producer acceptance claim.
  await expect(payroll.decideStatement(f.admin, statement.id, { action: 'APPROVE', expectedVersion: 0 }, 'synthetic-refund-approve'))
    .rejects.toMatchObject({ code: 'PAYROLL_COMMISSION_HELD' });
  await col('refunds').updateOne({ _id: refund._id }, { $set: { state: 'COMPLETED' } });
  await payroll.decideStatement(f.admin, statement.id, { action: 'APPROVE', expectedVersion: 0 }, 'synthetic-refund-approve');
  await col('refunds').updateOne({ _id: refund._id }, { $set: { state: 'TRANSFER_PENDING' } });
  await expect(payroll.decideStatement(f.admin, statement.id, { action: 'RECORD_PAYMENT', expectedVersion: 1,
    transferReference: 'synthetic-refund-bank' }, 'synthetic-refund-pay')).rejects.toMatchObject({ code: 'PAYROLL_COMMISSION_HELD' });
});

test('a case after recorded payment preserves paid money/version/claims without automatic clawback', async () => {
  const f = await fixture(), statement = await f.prepare();
  await payroll.decideStatement(f.admin, statement.id, { action: 'APPROVE', expectedVersion: 0 }, 'synthetic-paid-approve');
  await payroll.decideStatement(f.admin, statement.id, { action: 'RECORD_PAYMENT', expectedVersion: 1,
    transferReference: 'synthetic-paid-bank' }, 'synthetic-paid-record');
  const before = await col('payrollstatements').findOne({ _id: new mongoose.Types.ObjectId(statement.id) });
  const claims = await payroll.models.PayrollSourceClaim.find({ statementId: statement.id }).lean();
  await f.open();
  expect(await col('payrollstatements').findOne({ _id: new mongoose.Types.ObjectId(statement.id) })).toEqual(before);
  expect(await payroll.models.PayrollSourceClaim.find({ statementId: statement.id }).lean()).toEqual(claims);
});

test('raw and aggregate-backed payroll/case DTOs retain ownership, role and private-field boundaries', async () => {
  const f = await fixture(), statement = await f.prepare(), other = { ...f.sitter, userId: String(oid()) };
  await expect(payroll.listStatements(f.sitter, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect((await payroll.own(other)).statements).toEqual([]);
  const own = await payroll.own(f.sitter), admin = await payroll.listStatements(f.admin, {});
  expect(JSON.stringify([own, admin])).not.toContain('synthetic-private-contract');
  expect(JSON.stringify([own, admin])).not.toContain('synthetic-private-entry');
  const opened = await f.open();
  expect(JSON.stringify(opened)).not.toContain('synthetic-private-entry');
  await expect(complaints.get({ actor: { ...f.customer, userId: String(oid()) }, complaintId: opened.complaintId }))
    .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  expect(statement.breakdown.commissionVnd).toBe(50000);
});
