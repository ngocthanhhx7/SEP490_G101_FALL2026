import { expect, jest, test } from '@jest/globals';

const storage = jest.fn();
jest.unstable_mockModule('../../src/services/employee-scheduling/scheduling-storage.service.js', () => ({ assertEmployeeSchedulingStorage: storage }));
const { createEmployeeDispatchService } = await import('../../src/services/employee-scheduling/employee-dispatch.service.js');

const future = new Date('2026-12-01T10:00:00.000Z');
const row = (id, patch = {}) => ({ _id: id, version: 0, startAt: future, ...patch });
function setup({ overdue = [], queued = [], carePlans } = {}) {
  const aggregate = jest.fn()
    .mockReturnValueOnce({ toArray: async () => overdue })
    .mockReturnValueOnce({ toArray: async () => queued });
  const service = createEmployeeDispatchService({ repository: {
    models: { EmployeeVisitOffer: { db: {}, collection: { name: 'employee_visit_offers' } } }, col: name => name === 'visits' ? { aggregate } : {}, uow: {},
    employeeGuard: async () => {}, eligible: async () => {}, coverageAreas: [], areaKeys: () => []
  }, clock: () => Date.parse('2026-11-18T00:00:00.000Z'), carePlans });
  return { service, aggregate };
}

test.each([['UTCID01', 0], ['UTCID02', 21], ['UTCID03', 1.5], ['UTCID04', '1']])('%s rejects a batch limit outside the runBatch contract', async (_id, limit) => {
  await expect(setup().service.runBatch({ limit })).rejects.toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});
test('UTCID05 runs the care-plan worker and sends every queued visit with its versioned agent key', async () => {
  const carePlans = { runBatch: jest.fn() }, { service } = setup({ queued: [row('a'.repeat(24), { version: 3 })], carePlans });
  jest.spyOn(service, 'invite').mockResolvedValue({ state: 'PENDING' });
  await expect(service.runBatch({ limit: 2 })).resolves.toEqual({ processed: 1, invited: 1, review: 0 });
  expect(carePlans.runBatch).toHaveBeenCalledWith({ limit: 2 });
  expect(service.invite).toHaveBeenCalledWith(expect.objectContaining({ userId: 'SYSTEM_DISPATCH' }), 'a'.repeat(24), { expectedVersion: 3 }, `agent:${'a'.repeat(24)}:3`);
  expect(storage).toHaveBeenCalled();
});
test('UTCID06 skips a review record until retryAt', async () => {
  const { service } = setup({ queued: [row('b'.repeat(24), { dispatchReview: { retryAt: new Date('2026-11-18T01:00:00.000Z') } })] });
  jest.spyOn(service, 'invite');
  await expect(service.runBatch()).resolves.toEqual({ processed: 0, invited: 0, review: 0 });
  expect(service.invite).not.toHaveBeenCalled();
});
test('UTCID07 counts an invitation conflict as review without treating it as success', async () => {
  const { service } = setup({ queued: [row('c'.repeat(24))] });
  jest.spyOn(service, 'invite').mockRejectedValue({ status: 409, code: 'VERSION_CONFLICT' });
  await expect(service.runBatch()).resolves.toEqual({ processed: 1, invited: 0, review: 1 });
});
