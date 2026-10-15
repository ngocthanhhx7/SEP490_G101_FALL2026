import { createProjectionReader, ID, fail, integer, text, date } from './read-projection.js';

const STATE_ALIASES = Object.freeze({
  SUBMITTED: 'SUBMITTED', Submitted: 'SUBMITTED',
  APPROVED: 'APPROVED', Approved: 'APPROVED',
  TRANSFER_PENDING: 'TRANSFER_PENDING', TransferPending: 'TRANSFER_PENDING',
  PAID: 'PAID', Paid: 'PAID',
  FAILED: 'FAILED', Failed: 'FAILED',
  REJECTED: 'REJECTED', Rejected: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN', Withdrawn: 'WITHDRAWN'
});
export function createPayrollService({ repository } = {}) {
  return createProjectionReader({ kind: 'payroll', roles: ['ADMIN'], repository, financial: true,
    project: snapshot => ({ metrics: [], items: snapshot.items.map(row => {
      const state = STATE_ALIASES[row.state];
      if (!ID.test(row.id ?? '') || !ID.test(row.sitterId ?? '') || !text(row.displayName, 100)
        || !state
        || !/^\d{4}-\d{2}-\d{2}$/.test(row.requestWeekKey ?? '')
        || !Number.isFinite(Date.parse(row.requestWeekKey))
        || new Date(row.requestWeekKey).getUTCDay() !== 1
        || new Date(row.requestWeekKey).toISOString().slice(0, 10) !== row.requestWeekKey) fail(503, 'INVALID_PROJECTION');
      if (state === 'PAID' && !row.transferRecordedAt) fail(503, 'INVALID_PROJECTION');
      return { id: row.id, displayName: row.displayName, state,
        amountVnd: integer(row.amountVnd), requestWeekKey: row.requestWeekKey,
        transferRecordedAt: row.transferRecordedAt ? date(row.transferRecordedAt) : null };
    }) }) });
}
