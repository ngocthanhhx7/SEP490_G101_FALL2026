import { createHash } from 'node:crypto';
import { payrollModels } from '../../models/payroll.model.js';
import { sitterApplicationModels } from '../../models/sitter-application.model.js';
import { userModel } from '../../models/user.model.js';
import { contractInput, advanceInput, advanceDecisionInput, payrollAssessmentInput, payrollPageInput } from '../../validators/payroll.validator.js';
import { fail, id } from '../../validators/pet-care.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { calculateEmployeePayroll } from './payroll-calculation.service.js';
import { assertPayrollStorage } from './payroll-storage.service.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { createPayrollAdjustmentService, publicPayrollAdjustment } from './payroll-adjustment.service.js';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const payrollMonth = at => new Date(at.getTime() + 7 * 3600000).toISOString().slice(0, 7);
const publicAdvance = row => ({ id: String(row._id), amountVnd: row.amountVnd, currency: 'VND', monthKey: row.monthKey,
  settlementPeriod: row.settlementPeriod, status: row.status, version: row.version, reason: row.reason,
  decisionReason: row.decisionReason ?? null, requestedAt: row.requestedAt, paidAt: row.paidAt ?? null });
const publicStatement = row => ({ id: String(row._id), employeeId: String(row.employeeId), periodStart: row.periodStart, periodEnd: row.periodEnd,
  dueAt: row.dueAt, status: row.status, version: row.version, payCycle: row.payCycle, breakdown: row.breakdown, paidAt: row.paidAt ?? null, voidReason: row.voidReason ?? null });

export function createPayrollService({ connection, policy, clock = () => new Date(), cursorSecret }) {
  const models = payrollModels(connection), User = userModel(connection), { SitterStatus, SitterApplication } = sitterApplicationModels(connection);
  const uow = createUnitOfWork(connection);
  const notifications = createDomainNotifications({ connection, clock: () => new Date(clock()).getTime() });
  const now = () => new Date(clock());
  const codec = cursorSecret ? createScopedCursor({ secret: cursorSecret, namespace: 'employee-payroll-history-v1', clock: () => now().getTime() }) : null;
  async function page(model, match, actor, input, field, kind, project, select = '') {
    const context = { actorId: actor.userId, kind, limit: input.limit, match };
    let position;
    if (input.cursor) {
      if (!codec) fail('PAYROLL_STORAGE_NOT_READY', 'Payroll cursor configuration required', 503);
      position = codec.decode(input.cursor, context); id(position.id);
      if (typeof position.at !== 'string' || !Number.isFinite(Date.parse(position.at))) fail('VALIDATION_FAILED', 'Invalid payroll cursor');
    }
    const filter = { ...match, ...(position ? { $or: [{ [field]: { $lt: new Date(position.at) } },
      { [field]: new Date(position.at), _id: { $lt: position.id } }] } : {}) };
    const rows = await model.find(filter).select(select).sort({ [field]: -1, _id: -1 }).limit(input.limit + 1).maxTimeMS(5000).lean();
    const items = rows.slice(0, input.limit), last = items.at(-1);
    let nextCursor = null;
    if (rows.length > input.limit) {
      if (!codec) fail('PAYROLL_STORAGE_NOT_READY', 'Payroll cursor configuration required', 503);
      nextCursor = codec.encode({ id: String(last._id), at: last[field].toISOString() }, context);
    }
    return { items: items.map(project), nextCursor, limit: input.limit };
  }
  function role(actor, name) {
    if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles) || !actor.userId || actor.synthetic === true) fail('UNAUTHENTICATED', 'Authentication required', 401);
    id(actor.userId); if (!actor.roles.includes(name)) fail('FORBIDDEN', 'Action not permitted', 403);
  }
  async function command(actor, operation, key, input, work) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail('VALIDATION_FAILED', 'Idempotency key required');
    const commandId = hash([actor.userId, operation, key]), fingerprint = hash(input);
    await assertPayrollStorage(connection);
    for (let attempt = 0; ; attempt++) {
      try { return await uow.run(async session => {
        const prior = await models.PayrollCommand.findById(commandId).session(session).lean();
        if (prior) { if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_REUSED', 'Key already used', 409); return prior.result; }
        const result = await work(session);
        await models.PayrollCommand.create([{ _id: commandId, fingerprint, result, createdAt: now() }], { session }); return result;
      }); } catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
    }
  }
  async function event(actor, employeeId, resourceId, type, reason, session) {
    const [record] = await models.PayrollEvent.create([{ actorId: actor.userId, employeeId, resourceId, type, reason, at: now() }], { session });
    await notifications.payroll({ eventId: String(record._id), employeeId, type }, session);
  }
  async function currentContract(employeeId, session, at = now()) {
    const contract = await models.EmploymentContract.findOne({ employeeId, effectiveAt: { $lte: at } }).sort({ version: -1 }).session(session ?? null).lean();
    if (!contract || (contract.endsAt && contract.endsAt <= at)) fail('CONTRACT_REQUIRED', 'Verified active contract required', 409);
    return contract;
  }
  async function employeeGuard(employeeId, session) {
    await models.PayrollMonthGuard.findOneAndUpdate({ _id: `employee:${employeeId}` }, { $inc: { version: 1 } }, { upsert: true, session });
  }
  async function claimTransfer(reference, resource, session) {
    const claimId = `transfer:${reference}`;
    if (await models.PayrollSourceClaim.exists({ _id: claimId }).session(session))
      fail('TRANSFER_REFERENCE_ALREADY_USED', 'Transfer reference already recorded', 409);
    await models.PayrollSourceClaim.create([{ _id: claimId, ...resource }], { session });
  }
  async function policyFor(action) {
    const value = await policy?.resolve?.({ action });
    if (!value?.ready || !value.version || !['GROSS', 'NET'].includes(value.salaryBasis) || !Number.isSafeInteger(value.advanceCapBps) || value.advanceCapBps < 1 || value.advanceCapBps > 10000)
      fail('PAYROLL_POLICY_REQUIRED', 'Employee payroll policy awaits confirmation', 409);
    return value;
  }
  return {
    ...createPayrollAdjustmentService({ connection, models, role, command, employeeGuard, claimTransfer, event, page, now }),
    models,
    async recordContract(actor, body, key) {
      role(actor, 'ADMIN'); const input = contractInput(body), approved = await policyFor('CONTRACT');
      if (input.salaryBasis !== approved.salaryBasis) fail('PAYROLL_POLICY_REQUIRED', 'Salary basis mismatch', 409);
      if (input.employmentType === 'PART_TIME' && input.weeklyMinutes !== 1200) fail('VALIDATION_FAILED', 'Part-time contract is twenty hours per week');
      if (input.signedAt > now()) fail('VALIDATION_FAILED', 'Contract signature cannot be future dated');
      const minMonthly = [5310000, 4730000, 4140000, 3700000][input.workplaceRegion - 1];
      const minHourly = [25500, 22700, 20000, 17800][input.workplaceRegion - 1];
      if (input.salaryBasis === 'GROSS' && ((input.employmentType === 'FULL_TIME' && input.monthlyBaseVnd < minMonthly) ||
        BigInt(input.monthlyBaseVnd) * 12n * 60n < BigInt(minHourly) * BigInt(input.weeklyMinutes) * 52n)) fail('BELOW_MINIMUM_WAGE', 'Contract hours exceed supported salary', 422);
      return command(actor, 'CONTRACT', key, input, async session => {
        await employeeGuard(input.employeeId, session);
        const user = await User.findOne({ _id: input.employeeId, state: 'ACTIVE', roles: 'PET_SITTER' }).session(session).lean();
        const application = await SitterApplication.exists({ provisionedUserId: input.employeeId, state: 'APPROVED' }).session(session);
        if (!user || !application) fail('APPROVED_EMPLOYEE_REQUIRED', 'Approved employee required', 409);
        const prior = await models.EmploymentContract.findOne({ employeeId: input.employeeId }).sort({ version: -1 }).session(session).lean();
        if ((prior?.version ?? 0) !== input.expectedVersion) fail('VERSION_CONFLICT', 'Contract changed', 409);
        if (prior && input.effectiveAt <= prior.effectiveAt) fail('VALIDATION_FAILED', 'Contract versions must progress in time');
        const { expectedVersion, ...fields } = input;
        const [record] = await models.EmploymentContract.create([{ ...fields, version: expectedVersion + 1, verifiedBy: actor.userId, recordedAt: now() }], { session });
        await event(actor, input.employeeId, record._id, 'CONTRACT_RECORDED', 'Admin verified signed contract', session);
        return { id: String(record._id), version: record.version };
      });
    },
    async own(actor, query) {
      role(actor, 'PET_SITTER'); const input = payrollPageInput(query, true);
      await assertPayrollStorage(connection);
      const contracts = await models.EmploymentContract.find({ employeeId: actor.userId }).sort({ version: -1 }).limit(20).lean();
      const effective = await models.EmploymentContract.findOne({ employeeId: actor.userId, effectiveAt: { $lte: now() } }).sort({ version: -1 }).lean();
      const active = effective && (!effective.endsAt || effective.endsAt > now()) ? effective : null;
      if (active && !contracts.some(c => String(c._id) === String(active._id))) contracts.push(active);
      const advances = await page(models.SalaryAdvance, { employeeId: actor.userId }, actor,
        { limit: input.limit, cursor: input.advanceCursor }, 'requestedAt', 'own-advances', publicAdvance);
      const statements = await page(models.PayrollStatement, { employeeId: actor.userId }, actor,
        { limit: input.limit, cursor: input.statementCursor }, 'periodEnd', 'own-statements', publicStatement);
      const adjustments = await page(models.PayrollAdjustment, { employeeId: actor.userId }, actor,
        { limit: input.limit, cursor: input.adjustmentCursor }, 'requestedAt', 'own-adjustments', publicPayrollAdjustment);
      return { contracts: contracts.map(c => ({ id: String(c._id), version: c.version, employmentType: c.employmentType, salaryBasis: c.salaryBasis,
        monthlyBaseVnd: c.monthlyBaseVnd, payCycle: c.payCycle, weeklyMinutes: c.weeklyMinutes, signedAt: c.signedAt, effectiveAt: c.effectiveAt, endsAt: c.endsAt ?? null })),
        activeContractId: active ? String(active._id) : null, advances: advances.items, statements: statements.items,
        advanceNextCursor: advances.nextCursor, statementNextCursor: statements.nextCursor,
        adjustments: adjustments.items, adjustmentNextCursor: adjustments.nextCursor };
    },
    async submitAdvance(actor, body, key) {
      role(actor, 'PET_SITTER'); const input = advanceInput(body), approved = await policyFor('ADVANCE');
      const monthKey = payrollMonth(now());
      if (input.settlementPeriod < monthKey) fail('VALIDATION_FAILED', 'Settlement period cannot be past');
      return command(actor, 'ADVANCE', key, input, async session => {
        await employeeGuard(actor.userId, session);
        const contract = await currentContract(actor.userId, session);
        if (!await SitterStatus.exists({ userId: actor.userId, status: 'ACTIVE' }).session(session)) fail('EMPLOYEE_NOT_ACTIVE', 'Employee is not active', 409);
        const cap = Number(BigInt(contract.monthlyBaseVnd) * BigInt(approved.advanceCapBps) / 10000n);
        if (input.amountVnd > cap) fail('ADVANCE_LIMIT_EXCEEDED', 'Advance exceeds agreed cap', 422);
        const guardId = `${actor.userId}:${monthKey}`;
        if (await models.SalaryAdvance.exists({ employeeId: actor.userId, status: 'SUBMITTED' }).session(session)) fail('ADVANCE_MONTH_ALREADY_USED', 'Another advance is pending', 409);
        const guard = await models.PayrollMonthGuard.findOneAndUpdate({ _id: guardId }, { $inc: { version: 1 } }, { upsert: true, returnDocument: 'after', session }).lean();
        if (guard.pendingId || guard.approvedId) fail('ADVANCE_MONTH_ALREADY_USED', 'An advance is pending or approved this month', 409);
        const [record] = await models.SalaryAdvance.create([{ ...input, employeeId: actor.userId, contractId: contract._id, monthKey,
          policyVersion: approved.version, status: 'SUBMITTED', version: 0, requestedAt: now() }], { session });
        await models.PayrollMonthGuard.updateOne({ _id: guardId }, { $set: { pendingId: record._id } }, { session });
        await event(actor, actor.userId, record._id, 'ADVANCE_SUBMITTED', input.reason, session); return publicAdvance(record);
      });
    },
    async decideAdvance(actor, advanceId, body, key) {
      const input = advanceDecisionInput(body); id(advanceId); role(actor, input.action === 'WITHDRAW' ? 'PET_SITTER' : 'ADMIN');
      return command(actor, 'ADVANCE_' + input.action, key, { advanceId, ...input }, async session => {
        const record = await models.SalaryAdvance.findOne({ _id: advanceId, ...(input.action === 'WITHDRAW' ? { employeeId: actor.userId } : {}) }).session(session).lean();
        if (!record) fail('RESOURCE_NOT_FOUND', 'Advance unavailable', 404);
        await employeeGuard(String(record.employeeId), session);
        if (record.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Advance changed', 409);
        const guardId = `${record.employeeId}:${record.monthKey}`;
        const guard = await models.PayrollMonthGuard.findOneAndUpdate({ _id: guardId }, { $inc: { version: 1 } }, { returnDocument: 'after', session }).lean();
        if (!guard) fail('PAYROLL_RECONCILIATION_REQUIRED', 'Missing month guard', 409);
        let fields;
        if (input.action === 'RECORD_PAYMENT') {
          if (record.status !== 'APPROVED') fail('INVALID_STATE', 'Approve before recording payment', 409);
          await claimTransfer(input.transferReference, { advanceId: record._id }, session);
          fields = { status: 'PAID', paidBy: actor.userId, paidAt: now(), transferReference: input.transferReference };
        } else {
          if (record.status !== 'SUBMITTED' || String(guard.pendingId) !== advanceId) fail('INVALID_STATE', 'Only submitted advances can be decided', 409);
          if (input.action === 'APPROVE') {
            if (payrollMonth(now()) !== record.monthKey || guard.approvedId) fail('ADVANCE_MONTH_ALREADY_USED', 'Reconcile prior-month advance', 409);
            const contract = await currentContract(record.employeeId, session);
            const approved = await policyFor('ADVANCE');
            if (record.amountVnd > Number(BigInt(contract.monthlyBaseVnd) * BigInt(approved.advanceCapBps) / 10000n))
              fail('ADVANCE_LIMIT_EXCEEDED', 'Current contract advance cap exceeded', 422);
            if (!await SitterStatus.exists({ userId: record.employeeId, status: 'ACTIVE' }).session(session))
              fail('EMPLOYEE_NOT_ACTIVE', 'Employee is not active', 409);
            await models.PayrollMonthGuard.updateOne({ _id: guardId }, { $set: { approvedId: record._id }, $unset: { pendingId: 1 } }, { session });
          } else await models.PayrollMonthGuard.updateOne({ _id: guardId }, { $unset: { pendingId: 1 } }, { session });
          fields = { status: { APPROVE: 'APPROVED', REJECT: 'REJECTED', WITHDRAW: 'WITHDRAWN' }[input.action],
            decidedBy: actor.userId, decidedAt: now(), ...(input.reason ? { decisionReason: input.reason } : {}) };
        }
        const updated = await models.SalaryAdvance.findOneAndUpdate({ _id: advanceId, version: record.version }, { $set: fields, $inc: { version: 1 } }, { returnDocument: 'after', session }).lean();
        if (!updated) fail('VERSION_CONFLICT', 'Advance changed', 409);
        await event(actor, record.employeeId, record._id, 'ADVANCE_' + input.action, input.reason, session); return publicAdvance(updated);
      });
    },
    async prepareStatement(actor, body, key) {
      role(actor, 'ADMIN'); const input = payrollAssessmentInput(body); await policyFor('STATEMENT');
      if (input.periodEnd > now()) fail('VALIDATION_FAILED', 'Only completed work periods can be assessed');
      const monthKey = payrollMonth(input.periodStart);
      const [year, month] = monthKey.split('-').map(Number);
      const monthEnd = new Date(Date.UTC(year, month, 1) - 7 * 3600000);
      if (input.periodEnd > monthEnd) fail('VALIDATION_FAILED', 'Split cross-month work into separate assessments');
      return command(actor, 'STATEMENT', key, input, async session => {
        await employeeGuard(input.employeeId, session);
        const contract = await currentContract(input.employeeId, session, input.periodStart);
        if (contract.endsAt && contract.endsAt < input.periodEnd) fail('CONTRACT_REQUIRED', 'Split period at contract end', 409);
        if (await models.EmploymentContract.exists({ employeeId: input.employeeId, effectiveAt: { $gt: input.periodStart, $lt: input.periodEnd } }).session(session))
          fail('CONTRACT_REQUIRED', 'Split period at contract change', 409);
        const existing = await models.PayrollStatement.find({ employeeId: input.employeeId, monthKey, status: { $ne: 'VOIDED' } }).select('+assessment').session(session).lean();
        if (existing.some(s => s.periodStart < input.periodEnd && s.periodEnd > input.periodStart)) fail('PAYROLL_PERIOD_OVERLAP', 'Payroll period overlaps', 409);
        if (contract.payCycle === 'WEEKLY' && input.periodEnd - input.periodStart > 7 * 86400000) fail('VALIDATION_FAILED', 'Weekly period too long');
        if (contract.payCycle === 'WEEKLY' && input.dueAt - input.periodEnd > 8 * 86400000) fail('VALIDATION_FAILED', 'Pay date exceeds weekly payment interval');
        if (existing.some(s => s.assessment.scheduledMonthMinutes !== input.scheduledMonthMinutes) ||
          existing.reduce((sum, s) => sum + s.assessment.paidPeriodMinutes, 0) + input.paidPeriodMinutes > input.scheduledMonthMinutes)
          fail('PAYROLL_RECONCILIATION_REQUIRED', 'Attendance would duplicate monthly base', 409);
        const credits = await models.PayrollServiceCredit.find({ employeeId: input.employeeId, completedAt: { $gte: input.periodStart, $lt: input.periodEnd } }).limit(1001).session(session).lean();
        if (credits.length > 1000) fail('PAYROLL_REVIEW_REQUIRED', 'Period too large', 409);
        const monthlyCredits = input.includeMonthlyBonus ? await models.PayrollServiceCredit.find({ employeeId: input.employeeId,
          completedAt: { $gte: new Date(monthKey + '-01T00:00:00+07:00'), $lt: monthEnd } }).limit(5001).session(session).lean() : credits;
        if (monthlyCredits.length > 5000) fail('PAYROLL_REVIEW_REQUIRED', 'Monthly credit set too large', 409);
        if (input.includeMonthlyBonus && (input.periodEnd < monthEnd || now() < monthEnd)) fail('VALIDATION_FAILED', 'Monthly bonus is assessed after month close');
        const serviceNetVnd = credits.reduce((sum, c) => sum + c.serviceNetVnd, 0);
        const baseInput = { contract, scheduledMinutes: input.scheduledMonthMinutes, paidMinutes: input.paidPeriodMinutes, serviceNetVnd,
          overtimeVnd: input.overtimeVnd, employeeInsuranceVnd: input.employeeInsuranceVnd, incomeTaxVnd: input.incomeTaxVnd,
          otherLawfulDeductionsVnd: input.otherLawfulDeductionsVnd,
          kpi: { targetMinutes: input.includeMonthlyBonus ? input.kpiTargetMinutes : 0, completedMinutes: monthlyCredits.reduce((sum, c) => sum + c.careMinutes, 0),
            onTimeBps: monthlyCredits.length ? Math.floor(monthlyCredits.filter(c => c.onTime).length * 10000 / monthlyCredits.length) : 0,
            reportBps: monthlyCredits.length ? Math.floor(monthlyCredits.filter(c => c.reportsComplete).length * 10000 / monthlyCredits.length) : 0,
            seriousViolationConfirmed: input.seriousViolationConfirmed } };
        const repayments = [];
        for (const installment of input.advanceRepayments) {
          const advance = await models.SalaryAdvance.findOne({ _id: installment.advanceId, employeeId: input.employeeId, status: 'PAID', settlementPeriod: { $lte: monthKey } }).session(session).lean();
          if (!advance) fail('RESOURCE_NOT_FOUND', 'Paid advance unavailable for agreed settlement', 404);
          const related = await models.PayrollStatement.find({ employeeId: input.employeeId, advanceIds: advance._id, status: { $ne: 'VOIDED' } }).session(session).lean();
          const already = related.reduce((sum, s) => sum + (s.breakdown.advanceAllocations ?? []).filter(a => a.advanceId === installment.advanceId).reduce((n, a) => n + a.amountVnd, 0), 0);
          if (already + installment.amountVnd > advance.amountVnd) fail('ADVANCE_RECONCILIATION_REQUIRED', 'Advance repayment exceeds amount paid', 409);
          repayments.push({ advanceId: installment.advanceId, amountVnd: installment.amountVnd });
        }
        const breakdown = { ...calculateEmployeePayroll({ ...baseInput, paidAdvanceVnd: repayments.reduce((sum, a) => sum + a.amountVnd, 0) }), advanceAllocations: repayments };
        if (existing.reduce((sum, s) => sum + s.breakdown.baseVnd, 0) + breakdown.baseVnd > contract.monthlyBaseVnd)
          fail('PAYROLL_RECONCILIATION_REQUIRED', 'Rounded monthly base requires reconciliation', 409);
        const [statement] = await models.PayrollStatement.create([{ employeeId: input.employeeId, contractId: contract._id, periodStart: input.periodStart,
          periodEnd: input.periodEnd, dueAt: input.dueAt, monthKey, payCycle: contract.payCycle, status: 'PREPARED', version: 0,
          breakdown, assessment: input, creditIds: credits.map(c => c._id), advanceIds: repayments.map(a => a.advanceId), preparedBy: actor.userId, preparedAt: now() }], { session });
        for (const claim of [...credits.map(c => `credit:${c._id}`),
          ...(input.includeMonthlyBonus ? [`bonus:${input.employeeId}:${monthKey}`] : [])]) {
          if (await models.PayrollSourceClaim.exists({ _id: claim }).session(session)) fail('PAYROLL_SOURCE_ALREADY_USED', 'Payroll source already reserved', 409);
          await models.PayrollSourceClaim.create([{ _id: claim, statementId: statement._id }], { session });
        }
        await event(actor, input.employeeId, statement._id, 'STATEMENT_PREPARED', input.assessmentReference, session);
        return publicStatement(statement);
      });
    },
    async decideStatement(actor, statementId, body, key) {
      role(actor, 'ADMIN'); id(statementId); const input = advanceDecisionInput(body);
      if (!['APPROVE', 'REJECT', 'RECORD_PAYMENT'].includes(input.action)) fail('VALIDATION_FAILED', 'Invalid payroll statement decision');
      return command(actor, 'STATEMENT_' + input.action, key, { statementId, ...input }, async session => {
        const row = await models.PayrollStatement.findById(statementId).session(session).lean();
        if (!row) fail('RESOURCE_NOT_FOUND', 'Statement unavailable', 404);
        await employeeGuard(String(row.employeeId), session);
        if (row.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Statement changed', 409);
        const expected = input.action === 'RECORD_PAYMENT' ? 'APPROVED' : 'PREPARED';
        if (row.status !== expected) fail('INVALID_STATE', 'Statement state mismatch', 409);
        if (input.action === 'RECORD_PAYMENT') await claimTransfer(input.transferReference, { statementId: row._id }, session);
        const fields = input.action === 'REJECT' ? { status: 'VOIDED', voidedBy: actor.userId, voidedAt: now(), voidReason: input.reason }
          : input.action === 'APPROVE' ? { status: 'APPROVED', approvedBy: actor.userId, approvedAt: now() }
          : { status: 'PAID', paidBy: actor.userId, paidAt: now(), transferReference: input.transferReference };
        const saved = await models.PayrollStatement.findOneAndUpdate({ _id: statementId, version: row.version }, { $set: fields, $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
        if (!saved) fail('VERSION_CONFLICT', 'Statement changed', 409);
        if (input.action === 'REJECT') await models.PayrollSourceClaim.deleteMany({ statementId: row._id }, { session });
        await event(actor, row.employeeId, row._id, 'STATEMENT_' + input.action, input.reason, session); return publicStatement(saved);
      });
    },
    async listStatements(actor, query) {
      role(actor, 'ADMIN'); const input = payrollPageInput(query);
      await assertPayrollStorage(connection);
      return page(models.PayrollStatement, {}, actor, input, 'periodEnd', 'admin-statements', publicStatement);
    },
    async listAdvances(actor, query) {
      role(actor, 'ADMIN'); const input = payrollPageInput(query);
      await assertPayrollStorage(connection);
      return page(models.SalaryAdvance, input.view === 'HISTORY' ? {} : { status: { $in: ['SUBMITTED', 'APPROVED'] } }, actor,
        input, 'requestedAt', 'admin-advances', row => ({ ...publicAdvance(row), employeeId: String(row.employeeId) }));
    }
  };
}
