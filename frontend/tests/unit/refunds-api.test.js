import { createRefundApi } from '../../src/services/refunds-api.js';
import { describe, expect, jest, test } from '@jest/globals';

const REFUND_ID = '0123456789abcdef01234567';

describe('refund API adapter', () => {
  test('sends proposal and decision commands with idempotency and version metadata', async () => {
    const request = jest.fn(async () => ({ data: { status: 'PROPOSED' } }));
    const api = createRefundApi({ request });
    const proposal = { sourceRef: { type: 'CASE', id: 'case-1' }, amountVnd: 15000, reason: 'Điều chỉnh' };
    await api.propose(proposal, { idempotencyKey: 'frontend-key-0001' });
    await api.decide(REFUND_ID, { decision: 'APPROVE', reason: 'Đã kiểm tra', expectedVersion: 2 },
      { idempotencyKey: 'frontend-key-0002' });
    expect(request).toHaveBeenNthCalledWith(1, '/refund-proposals', {
      method: 'POST', body: proposal, idempotencyKey: 'frontend-key-0001'
    });
    expect(request).toHaveBeenNthCalledWith(2, `/refunds/${REFUND_ID}/decisions`, {
      method: 'POST', body: { decision: 'APPROVE', reason: 'Đã kiểm tra' }, expectedVersion: 2,
      idempotencyKey: 'frontend-key-0002'
    });
  });

  test('sends manual transfer evidence without calling a payment provider', async () => {
    const request = jest.fn(async () => ({ status: 202, pending: true }));
    const api = createRefundApi({ request });
    const command = { outcome: 'UNKNOWN', expectedVersion: 3, transferReference: 'transfer-1' };
    await api.recordTransfer(REFUND_ID, command, { idempotencyKey: 'frontend-key-0003' });
    expect(request).toHaveBeenCalledWith(`/refunds/${REFUND_ID}/transfer-records`, {
      method: 'POST', body: { outcome: 'UNKNOWN', transferReference: 'transfer-1' }, expectedVersion: 3,
      idempotencyKey: 'frontend-key-0003'
    });
  });

  test('rejects malformed refund IDs and missing idempotency keys', () => {
    const api = createRefundApi({ request: jest.fn() });
    expect(() => api.decide('../other', { decision: 'APPROVE', expectedVersion: 0 },
      { idempotencyKey: 'frontend-key-0004' })).toThrow('Invalid refund ID');
    expect(() => api.propose({}, {})).toThrow('An idempotency key is required');
  });
});
