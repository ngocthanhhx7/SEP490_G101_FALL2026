import { createProjectionReader, ID, fail, integer, text, date } from './read-projection.js';
export function createPayrollService({ repository } = {}) {
  return createProjectionReader({ kind: 'payroll', roles: ['ADMIN'], repository, financial: true,
    project: snapshot => ({ metrics: [], items: snapshot.items.map(row => {
      if (!ID.test(row.id ?? '') || !ID.test(row.sitterId ?? '') || !text(row.displayName, 100)
        || !['Submitted', 'Approved', 'TransferPending', 'Paid', 'Failed', 'Rejected', 'Withdrawn'].includes(row.state)
        || !/^\d{4}-\d{2}-\d{2}$/.test(row.requestWeekKey ?? '')
        || !Number.isFinite(Date.parse(row.requestWeekKey))
        || new Date(row.requestWeekKey).getUTCDay() !== 1
        || new Date(row.requestWeekKey).toISOString().slice(0, 10) !== row.requestWeekKey) fail(503, 'INVALID_PROJECTION');
      if (row.state === 'Paid' && !row.transferRecordedAt) fail(503, 'INVALID_PROJECTION');
      return { id: row.id, displayName: row.displayName, state: row.state,
        amountVnd: integer(row.amountVnd), requestWeekKey: row.requestWeekKey,
        transferRecordedAt: row.transferRecordedAt ? date(row.transferRecordedAt) : null };
    }) }) });
}
