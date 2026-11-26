import { test, expect, jest } from '@jest/globals';
import { createSettlementService } from '../../../src/services/settlements/settlement.service.js';

const SITTER = { userId: 'synthetic-sitter-a', roles: ['PET_SITTER'], state: 'ACTIVE' };
function fixture({ foreignEarning = false, foreignRequest = false } = {}) {
  const projection = { ledgerReady: true,
    balances: { accrued: 100000, pending: 0, held: 0, available: 100000, reserved: 0, paid: 0 },
    earnings: [{ id: 'synthetic-earning', sitterId: foreignEarning ? 'synthetic-sitter-b' : SITTER.userId,
      earningPeriodKey: 'synthetic-period', availableVnd: 100000,
      bankAccount: 'SYNTHETIC-PRIVATE', customerName: 'Không công khai' }],
    requests: foreignRequest ? [{ id: 'synthetic-request', sitterId: 'synthetic-sitter-b',
      amountVnd: 100000, status: 'SUBMITTED', version: 0 }] : [] };
  const repository = { readOwn: jest.fn(async () => projection), findCommand: jest.fn(), saveCommand: jest.fn(),
    claimWeek: jest.fn(), reserveEarnings: jest.fn(), create: jest.fn(), appendEvent: jest.fn() };
  const unitOfWork = { run: jest.fn() };
  const policy = { resolve: async () => ({ ready: true, policyVersion: 'synthetic-policy',
    decisionVersion: 'synthetic-decision', decisionIds: [] }) };
  const readOwn = createSettlementService({ repository, unitOfWork, policy,
    clock: () => new Date('2026-11-14T03:00:00Z') }).readOwn;
  return { readOwn, repository, unitOfWork };
}

// SRS: I.4.4 Permission Matrix note 10; GBR-02; IV Privacy.
test("SETTLE-01-UTCID01 [N] Đọc theo đúng sitter đang đăng nhập và không trả trường riêng tư", async () => {
  const f = fixture();
  const actual = await f.readOwn({ actor: SITTER });
  expect(f.repository.readOwn).toHaveBeenCalledWith(expect.objectContaining({ sitterId: SITTER.userId }));
  expect(actual.earnings).toHaveLength(1);
  expect(actual.earnings[0].id).toBe('synthetic-earning');
  expect(actual.earnings[0]).not.toHaveProperty('bankAccount');
  expect(actual.earnings[0]).not.toHaveProperty('customerName');
  expect(f.unitOfWork.run).not.toHaveBeenCalled();
});

// SRS: I.4.4 Permission Matrix note 10; GBR-02.
test("SETTLE-01-UTCID02 [A] Nguồn earning khác chủ không được trả cho sitter", async () => {
  const f = fixture({ foreignEarning: true });
  await expect(f.readOwn({ actor: SITTER })).rejects.toMatchObject({ code: 'LEDGER_SCOPE_INVALID' });
  expect(f.unitOfWork.run).not.toHaveBeenCalled();
});

// SRS: I.4.4 Permission Matrix note 10; GBR-02.
test("SETTLE-01-UTCID03 [A] Nguồn lịch sử tài chính khác chủ không được trả kèm", async () => {
  const f = fixture({ foreignRequest: true });
  await expect(f.readOwn({ actor: SITTER })).rejects.toMatchObject({ code: 'LEDGER_SCOPE_INVALID' });
});

// SRS: I.4.4 Permission Matrix note 10; GBR-02.
test("SETTLE-01-UTCID04 [A] Customer không được đọc projection thu nhập sitter", async () => {
  const f = fixture();
  const actor = { ...SITTER, roles: ['CUSTOMER'] };
  await expect(f.readOwn({ actor })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.repository.readOwn).not.toHaveBeenCalled();
});
