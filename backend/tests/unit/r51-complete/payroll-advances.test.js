import { describe, expect, jest, test } from '@jest/globals';
import { Types } from 'mongoose';
import { createPayrollService } from '../../../src/services/payroll/payroll.service.js';

const SITTER_ID = '507f1f77bcf86cd799439011';
const ADMIN_ID = '507f1f77bcf86cd799439099';
const CONTRACT_ID = '507f1f77bcf86cd799439021';
const ADVANCE_ID = '507f1f77bcf86cd799439031';
const NOW = new Date('2026-11-15T03:00:00.000Z'); // 2026-11 in +07:00

function chainDoc(value) {
  const q = {
    sort: () => q,
    select: () => q,
    limit: () => q,
    maxTimeMS: () => q,
    session: () => q,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return q;
}

function buildPayrollHarness(overrides = {}) {
  const state = {
    priorCommand: null,
    contract: {
      _id: new Types.ObjectId(CONTRACT_ID),
      employeeId: new Types.ObjectId(SITTER_ID),
      monthlyBaseVnd: 10_000_000,
      supersededAt: null,
      effectiveAt: new Date('2026-10-01T00:00:00.000Z'),
      endsAt: null
    },
    sitterActive: true,
    existingSubmitted: null,
    monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 1 },
    advanceRecord: {
      _id: new Types.ObjectId(ADVANCE_ID),
      employeeId: new Types.ObjectId(SITTER_ID),
      contractId: new Types.ObjectId(CONTRACT_ID),
      amountVnd: 3_000_000,
      monthKey: '2026-11',
      settlementPeriod: '2026-11',
      status: 'SUBMITTED',
      version: 0,
      reason: 'Chi phí khám sức khỏe định kỳ',
      requestedAt: NOW
    },
    transferClaimExists: false,
    updatedAdvance: null,
    createdAdvances: [],
    createdEvents: [],
    ...overrides
  };

  const sessionObj = { inTransaction: () => true };
  const modelsObj = {};

  const makeModel = (name, impl) => {
    const full = {
      modelName: name,
      schema: { indexes: () => [] },
      collection: {
        name: impl.collection?.name ?? name.toLowerCase() + 's',
        listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } }] }),
        ...(impl.collection ?? {})
      },
      ...impl
    };
    full.collection = {
      name: impl.collection?.name ?? name.toLowerCase() + 's',
      listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } }] }),
      ...(impl.collection ?? {})
    };
    modelsObj[name] = full;
    return full;
  };

  makeModel('PayrollCommand', {
    collection: { name: 'payrollcommands' },
    findById: jest.fn(() => chainDoc(state.priorCommand)),
    create: jest.fn(async docs => docs)
  });

  makeModel('EmploymentContract', {
    collection: { name: 'employmentcontracts' },
    findOne: jest.fn(() => chainDoc(state.contract))
  });

  makeModel('SalaryAdvance', {
    collection: { name: 'salaryadvances' },
    exists: jest.fn(() => chainDoc(state.existingSubmitted)),
    findOne: jest.fn((filter) => {
      if (filter.employeeId && String(filter.employeeId) !== String(state.advanceRecord?.employeeId)) {
        return chainDoc(null);
      }
      return chainDoc(state.advanceRecord);
    }),
    create: jest.fn(async docs => {
      const saved = { _id: new Types.ObjectId(ADVANCE_ID), ...docs[0] };
      state.createdAdvances.push(saved);
      return [saved];
    }),
    findOneAndUpdate: jest.fn((_filter, update) => {
      if (state.updatedAdvance === false) return chainDoc(null);
      const next = state.updatedAdvance ?? {
        ...state.advanceRecord,
        ...(update.$set ?? {}),
        version: (state.advanceRecord?.version ?? 0) + update.$inc.version
      };
      state.advanceRecord = next;
      return chainDoc(next);
    })
  });

  makeModel('PayrollMonthGuard', {
    collection: { name: 'payrollmonthguards' },
    findOneAndUpdate: jest.fn((filter) => {
      if (String(filter._id).startsWith('employee:')) return chainDoc({ _id: filter._id, version: 1 });
      return chainDoc(state.monthGuard);
    }),
    updateOne: jest.fn(async () => ({ acknowledged: true, matchedCount: 1 }))
  });

  makeModel('PayrollSourceClaim', {
    collection: { name: 'payrollsourceclaims' },
    exists: jest.fn(() => chainDoc(state.transferClaimExists ? { _id: 'transfer:1' } : null)),
    create: jest.fn(async docs => docs)
  });

  makeModel('PayrollEvent', {
    collection: { name: 'payrollevents' },
    create: jest.fn(async docs => {
      const saved = { _id: new Types.ObjectId(), ...docs[0] };
      state.createdEvents.push(saved);
      return [saved];
    })
  });

  for (const extra of ['PayrollStatement', 'PayrollServiceCredit', 'PayrollAdjustment']) {
    makeModel(extra, { collection: { name: extra.toLowerCase() + 's' } });
  }

  makeModel('SitterStatus', {
    collection: { name: 'sitterstatuses' },
    exists: jest.fn(() => chainDoc(state.sitterActive ? { _id: 'st1' } : null))
  });
  makeModel('SitterApplication', { collection: { name: 'sitterapplications' } });
  makeModel('User', { collection: { name: 'users' } });

  const collections = [
    'employmentcontracts', 'salaryadvances', 'payrollstatements', 'payrollservicecredits',
    'payrolladjustments', 'payrollmonthguards', 'payrollsourceclaims', 'payrollcommands', 'payrollevents',
    'notificationoutboxes', 'notifications', 'users'
  ];

  const connection = {
    models: modelsObj,
    model: jest.fn((name) => modelsObj[name] ?? makeModel(name, {})),
    transaction: jest.fn(async fn => fn(sessionObj)),
    startSession: jest.fn(async () => ({
      withTransaction: async fn => fn(sessionObj),
      endSession: async () => {}
    })),
    db: {
      listCollections: () => ({
        toArray: async () => [...new Set([...collections, ...Object.values(modelsObj).map(m => m.collection.name)])].map(name => ({ name }))
      }),
      collection: jest.fn(() => ({
        indexes: async () => [{ key: { _id: 1 } }],
        listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } }] }),
        find: () => ({ toArray: async () => [] }),
        insertOne: async () => ({ insertedId: new Types.ObjectId() }),
        updateOne: async () => ({ matchedCount: 1 }),
        findOne: async () => null
      }))
    }
  };

  const policy = {
    resolve: jest.fn(async () => state.policyValue ?? {
      ready: true,
      version: 'PAYROLL_V1',
      salaryBasis: 'GROSS',
      advanceCapBps: 5000
    })
  };

  const service = createPayrollService({
    connection,
    policy,
    clock: () => state.now ?? NOW,
    cursorSecret: 'a'.repeat(32)
  });

  return { service, state, connection };
}

const sitterActor = { userId: SITTER_ID, state: 'ACTIVE', roles: ['PET_SITTER'] };
const adminActor = { userId: ADMIN_ID, state: 'ACTIVE', roles: ['ADMIN'] };
const validAdvanceBody = {
  amountVnd: 3_000_000,
  reason: 'Tạm ứng chi phí đi lại và chăm sóc định kỳ trong tháng',
  settlementPeriod: '2026-11',
  settlementConsentReference: 'CONSENT-2026-11-01'
};

describe('PAYROLL-04 submitAdvance & PAYROLL-05 decideAdvance', () => {
  test('PAYROLL-04-UTCID01 [N] submits valid salary advance within 50% monthly base cap', async () => {
    const { service, state } = buildPayrollHarness();
    const res = await service.submitAdvance(sitterActor, validAdvanceBody, 'adv-key-0001');
    expect(res).toMatchObject({
      id: ADVANCE_ID,
      amountVnd: 3_000_000,
      currency: 'VND',
      monthKey: '2026-11',
      settlementPeriod: '2026-11',
      status: 'SUBMITTED',
      version: 0
    });
    expect(state.createdEvents[0].type).toBe('ADVANCE_SUBMITTED');
  });

  test('PAYROLL-04-UTCID02 [B] accepts exact 50% cap boundary (5,000,000 VND on 10,000,000 base)', async () => {
    const { service } = buildPayrollHarness();
    const res = await service.submitAdvance(sitterActor, { ...validAdvanceBody, amountVnd: 5_000_000 }, 'adv-key-0002');
    expect(res.amountVnd).toBe(5_000_000);
    expect(res.status).toBe('SUBMITTED');
  });

  test('PAYROLL-04-UTCID03 [B] rejects amount exceeding 50% cap by 1 VND (5,000,001 VND) with ADVANCE_LIMIT_EXCEEDED', async () => {
    const { service } = buildPayrollHarness();
    await expect(
      service.submitAdvance(sitterActor, { ...validAdvanceBody, amountVnd: 5_000_001 }, 'adv-key-0003')
    ).rejects.toMatchObject({ code: 'ADVANCE_LIMIT_EXCEEDED', status: 422 });
  });

  test('PAYROLL-04-UTCID04 [A] rejects past settlementPeriod before current payroll month', async () => {
    const { service } = buildPayrollHarness();
    await expect(
      service.submitAdvance(sitterActor, { ...validAdvanceBody, settlementPeriod: '2026-10' }, 'adv-key-0004')
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
  });

  test('PAYROLL-04-UTCID05 [A] rejects when employee already has a pending or approved advance in the month', async () => {
    const { service } = buildPayrollHarness({
      monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 2, approvedId: new Types.ObjectId() }
    });
    await expect(
      service.submitAdvance(sitterActor, validAdvanceBody, 'adv-key-0005')
    ).rejects.toMatchObject({ code: 'ADVANCE_MONTH_ALREADY_USED', status: 409 });
  });

  test('PAYROLL-04-UTCID06 [A] rejects when employee has no active verified contract', async () => {
    const { service } = buildPayrollHarness({ contract: null });
    await expect(
      service.submitAdvance(sitterActor, validAdvanceBody, 'adv-key-0006')
    ).rejects.toMatchObject({ code: 'CONTRACT_REQUIRED', status: 409 });
  });

  test('PAYROLL-04-UTCID07 [A] rejects when sitter status is not ACTIVE', async () => {
    const { service } = buildPayrollHarness({ sitterActive: false });
    await expect(
      service.submitAdvance(sitterActor, validAdvanceBody, 'adv-key-0007')
    ).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_ACTIVE', status: 409 });
  });

  test('PAYROLL-04-UTCID08 [A] rejects non-PET_SITTER actor with FORBIDDEN', async () => {
    const { service } = buildPayrollHarness();
    await expect(
      service.submitAdvance(adminActor, validAdvanceBody, 'adv-key-0008')
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  test('PAYROLL-05-UTCID01 [N] allows PET_SITTER owner to WITHDRAW submitted advance', async () => {
    const { service } = buildPayrollHarness({
      monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 2, pendingId: new Types.ObjectId(ADVANCE_ID) }
    });
    const res = await service.decideAdvance(
      sitterActor,
      ADVANCE_ID,
      { action: 'WITHDRAW', expectedVersion: 0, reason: 'Không còn nhu cầu tạm ứng' },
      'dec-key-0001'
    );
    expect(res).toMatchObject({ id: ADVANCE_ID, status: 'WITHDRAWN', version: 1 });
  });

  test.each([
    ['APPROVE', {}], ['APPROVE', { reason: null }], ['APPROVE', { reason: '' }],
    ['APPROVE', { reason: '   ' }], ['REJECT', {}]
  ])('SAL-IN-03-UTCID01 rejects %s with blank or missing reason %p before any writes', async (action, input) => {
    const { service, state, connection } = buildPayrollHarness({
      monthGuard: { _id: SITTER_ID + ':2026-11', version: 2, pendingId: new Types.ObjectId(ADVANCE_ID) }
    });
    await expect(service.decideAdvance(adminActor, ADVANCE_ID, { action, expectedVersion: 0, ...input }, 'synthetic-decision-01'))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
    expect(state.advanceRecord).toMatchObject({ status: 'SUBMITTED', version: 0 });
    expect(state.advanceRecord).not.toHaveProperty('decisionReason');
    expect(service.models.SalaryAdvance.findOneAndUpdate).not.toHaveBeenCalled();
    expect(service.models.PayrollMonthGuard.findOneAndUpdate).not.toHaveBeenCalled();
    expect(service.models.PayrollEvent.create).not.toHaveBeenCalled();
    expect(service.models.PayrollCommand.create).not.toHaveBeenCalled();
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  test('SAL-IN-03-UTCID01 allows ADMIN to APPROVE a submitted advance and saves the reason once', async () => {
    const { service, state } = buildPayrollHarness({
      monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 2, pendingId: new Types.ObjectId(ADVANCE_ID) }
    });
    const res = await service.decideAdvance(
      adminActor,
      ADVANCE_ID,
      { action: 'APPROVE', expectedVersion: 0, reason: '  Đủ điều kiện hợp đồng tháng 11  ' },
      'dec-key-0002'
    );
    const decision = { status: 'APPROVED', version: 1, decisionReason: 'Đủ điều kiện hợp đồng tháng 11' };
    expect(res).toMatchObject({ id: ADVANCE_ID, ...decision });
    expect(state.advanceRecord).toMatchObject(decision);
    expect(service.models.SalaryAdvance.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(service.models.SalaryAdvance.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: ADVANCE_ID, version: 0 },
      { $set: expect.objectContaining({ status: 'APPROVED', decisionReason: decision.decisionReason }), $inc: { version: 1 } },
      expect.objectContaining({ returnDocument: 'after' })
    );
    expect(service.models.PayrollEvent.create).toHaveBeenCalledWith(
      [expect.objectContaining({ type: 'ADVANCE_APPROVE', reason: decision.decisionReason })],
      expect.any(Object)
    );
  });

  test('PAYROLL-05-UTCID03 [N] allows ADMIN to REJECT submitted advance with decisionReason', async () => {
    const { service } = buildPayrollHarness({
      monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 2, pendingId: new Types.ObjectId(ADVANCE_ID) }
    });
    const res = await service.decideAdvance(
      adminActor,
      ADVANCE_ID,
      { action: 'REJECT', expectedVersion: 0, reason: 'Chứng từ đề xuất chưa khớp' },
      'dec-key-0003'
    );
    expect(res).toMatchObject({ id: ADVANCE_ID, status: 'REJECTED', version: 1, decisionReason: 'Chứng từ đề xuất chưa khớp' });
  });

  test('PAYROLL-05-UTCID04 [N] allows ADMIN to RECORD_PAYMENT for an APPROVED advance with unique transferReference', async () => {
    const { service, state } = buildPayrollHarness({
      monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 3, approvedId: new Types.ObjectId(ADVANCE_ID) },
      advanceRecord: {
        _id: new Types.ObjectId(ADVANCE_ID),
        employeeId: new Types.ObjectId(SITTER_ID),
        amountVnd: 3_000_000,
        monthKey: '2026-11',
        settlementPeriod: '2026-11',
        status: 'APPROVED',
        version: 1,
        reason: 'Tạm ứng tháng 11',
        requestedAt: NOW
      }
    });
    const res = await service.decideAdvance(
      adminActor,
      ADVANCE_ID,
      { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'VCB-20261115-0001' },
      'dec-key-0004'
    );
    expect(res).toMatchObject({ id: ADVANCE_ID, status: 'PAID', version: 2 });
    expect(state.createdEvents[0].type).toBe('ADVANCE_RECORD_PAYMENT');
  });

  test('PAYROLL-05-UTCID05 [A] rejects PET_SITTER attempting APPROVE with FORBIDDEN', async () => {
    const { service } = buildPayrollHarness();
    await expect(
      service.decideAdvance(sitterActor, ADVANCE_ID, { action: 'APPROVE', expectedVersion: 0, reason: 'Tự duyệt' }, 'dec-key-0005')
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  test('PAYROLL-05-UTCID06 [A] rejects stale expectedVersion with VERSION_CONFLICT', async () => {
    const { service } = buildPayrollHarness({
      monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 2, pendingId: new Types.ObjectId(ADVANCE_ID) }
    });
    await expect(
      service.decideAdvance(adminActor, ADVANCE_ID, { action: 'APPROVE', expectedVersion: 2, reason: 'Sai version' }, 'dec-key-0006')
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  });

  test('PAYROLL-05-UTCID07 [A] rejects RECORD_PAYMENT when advance is still SUBMITTED with INVALID_STATE', async () => {
    const { service } = buildPayrollHarness({
      monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 2, pendingId: new Types.ObjectId(ADVANCE_ID) }
    });
    await expect(
      service.decideAdvance(
        adminActor,
        ADVANCE_ID,
        { action: 'RECORD_PAYMENT', expectedVersion: 0, transferReference: 'VCB-20261115-0002' },
        'dec-key-0007'
      )
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  test('PAYROLL-05-UTCID08 [A] rejects duplicate transferReference with TRANSFER_REFERENCE_ALREADY_USED', async () => {
    const { service } = buildPayrollHarness({
      transferClaimExists: true,
      monthGuard: { _id: `${SITTER_ID}:2026-11`, version: 3, approvedId: new Types.ObjectId(ADVANCE_ID) },
      advanceRecord: {
        _id: new Types.ObjectId(ADVANCE_ID),
        employeeId: new Types.ObjectId(SITTER_ID),
        amountVnd: 3_000_000,
        monthKey: '2026-11',
        settlementPeriod: '2026-11',
        status: 'APPROVED',
        version: 1,
        reason: 'Tạm ứng tháng 11',
        requestedAt: NOW
      }
    });
    await expect(
      service.decideAdvance(
        adminActor,
        ADVANCE_ID,
        { action: 'RECORD_PAYMENT', expectedVersion: 1, transferReference: 'VCB-DUP-0001' },
        'dec-key-0008'
      )
    ).rejects.toMatchObject({ code: 'TRANSFER_REFERENCE_ALREADY_USED', status: 409 });
  });
});
