import { payrollAdjustmentInput, payrollAdjustmentDecisionInput, payrollPageInput } from '../../validators/payroll.validator.js';
import { id, fail } from '../../validators/pet-care.validator.js';
import { assertPayrollStorage } from './payroll-storage.service.js';

export const publicPayrollAdjustment = row => ({ id: String(row._id), employeeId: String(row.employeeId),
  statementId: String(row.statementId), statementVersion: row.statementVersion, direction: row.direction,
  amountVnd: row.amountVnd, currency: 'VND', status: row.status, version: row.version,
  reason: row.reason, decisionReason: row.decisionReason ?? null, requestedAt: row.requestedAt,
  resolvedAt: row.resolvedAt ?? null });

export function createPayrollAdjustmentService({ connection, models, role, command, employeeGuard, claimTransfer, event, page, now }) {
  return {
    async submitAdjustment(actor, body, key) {
      role(actor, 'ADMIN'); const input = payrollAdjustmentInput(body);
      return command(actor, 'ADJUSTMENT', key, input, async session => {
        const statement = await models.PayrollStatement.findById(input.statementId).session(session).lean();
        if (!statement) fail('RESOURCE_NOT_FOUND', 'Statement unavailable', 404);
        await employeeGuard(String(statement.employeeId), session);
        if (statement.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Statement changed', 409);
        if (!['APPROVED', 'PAID'].includes(statement.status)) fail('INVALID_STATE', 'Only approved payroll can be reconciled', 409);
        if (input.direction === 'RECOVERY' && statement.status !== 'PAID') fail('INVALID_STATE', 'Recovery requires a paid statement', 409);
        if (await models.PayrollAdjustment.exists({ statementId: statement._id, assessmentReference: input.assessmentReference }).session(session))
          fail('PAYROLL_ADJUSTMENT_ALREADY_RECORDED', 'Assessment already recorded for statement', 409);
        const { expectedVersion, ...fields } = input;
        const [record] = await models.PayrollAdjustment.create([{ ...fields, statementVersion: expectedVersion,
          employeeId: statement.employeeId, status: 'SUBMITTED', version: 0, requestedAt: now(), preparedBy: actor.userId }], { session });
        await event(actor, statement.employeeId, record._id, 'ADJUSTMENT_SUBMITTED', input.reason, session);
        return publicPayrollAdjustment(record);
      });
    },
    async decideAdjustment(actor, adjustmentId, body, key) {
      role(actor, 'ADMIN'); id(adjustmentId); const input = payrollAdjustmentDecisionInput(body);
      return command(actor, 'ADJUSTMENT_' + input.action, key, { adjustmentId, ...input }, async session => {
        const record = await models.PayrollAdjustment.findById(adjustmentId).session(session).lean();
        if (!record) fail('RESOURCE_NOT_FOUND', 'Adjustment unavailable', 404);
        await employeeGuard(String(record.employeeId), session);
        if (record.version !== input.expectedVersion) fail('VERSION_CONFLICT', 'Adjustment changed', 409);
        const decision = ['APPROVE', 'REJECT'].includes(input.action);
        if (record.status !== (decision ? 'SUBMITTED' : 'APPROVED')) fail('INVALID_STATE', 'Adjustment state mismatch', 409);
        let fields;
        if (decision) fields = { status: input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decidedBy: actor.userId, decidedAt: now(), decisionReason: input.reason };
        else if (input.action === 'RECORD_PAYMENT') {
          if (record.direction !== 'SUPPLEMENT') fail('INVALID_STATE', 'Recovery is not a salary payment', 409);
          const statement = await models.PayrollStatement.findById(record.statementId).session(session).lean();
          if (statement?.status !== 'PAID') fail('INVALID_STATE', 'Record original salary payment before supplement', 409);
          await claimTransfer(input.transferReference, { adjustmentId: record._id }, session);
          fields = { status: 'PAID', resolvedBy: actor.userId, resolvedAt: now(), transferReference: input.transferReference };
        } else {
          if (record.direction !== 'RECOVERY') fail('INVALID_STATE', 'Supplement requires payment evidence', 409);
          // Evidence records an agreed external resolution; it never changes salary or advance balances.
          fields = { status: 'RECONCILED', resolvedBy: actor.userId, resolvedAt: now(),
            agreementReference: input.agreementReference, resolutionReference: input.resolutionReference };
        }
        const saved = await models.PayrollAdjustment.findOneAndUpdate({ _id: adjustmentId, version: record.version },
          { $set: fields, $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
        if (!saved) fail('VERSION_CONFLICT', 'Adjustment changed', 409);
        await event(actor, record.employeeId, record._id, 'ADJUSTMENT_' + input.action, input.reason, session);
        return publicPayrollAdjustment(saved);
      });
    },
    async listAdjustments(actor, query) {
      role(actor, 'ADMIN'); const input = payrollPageInput(query); await assertPayrollStorage(connection);
      return page(models.PayrollAdjustment, {}, actor, input, 'requestedAt', 'admin-adjustments', row => ({
        ...publicPayrollAdjustment(row), assessmentReference: row.assessmentReference,
        agreementReference: row.agreementReference ?? null, resolutionReference: row.resolutionReference ?? null,
        transferReference: row.transferReference ?? null
      }), '+assessmentReference +agreementReference +resolutionReference +transferReference');
    }
  };
}
