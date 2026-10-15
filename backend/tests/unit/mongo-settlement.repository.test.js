import { test, expect } from '@jest/globals';
import { createMongoSettlementRepository } from '../../src/services/settlements/mongo-settlement.repository.js';

function chain(value) {
  return {
    sort() { return this; },
    lean() { return this; },
    session() { return this; },
    exec: async () => value
  };
}

function models({ earningRows, ledgerRows }) {
  return {
    SettlementRequest: { find: () => chain([]) },
    SettlementWeekClaim: { findOne: () => chain(null) },
    Earning: { find: () => chain(earningRows) },
    EarningLedgerEntry: { find: () => chain(ledgerRows) },
    FinancialLock: {}, SettlementCommand: {}, SettlementEvent: {}, SettlementOutbox: {},
    SettlementTransfer: {}, SettlementEvidence: {}
  };
}

const earning = {
  earningId: 'earning-pending', sitterId: 'sitter-1', visitId: 'visit-1',
  earningPeriodKey: '2026-10-12', accruedVnd: 100, pendingVnd: 100,
  heldVnd: 0, availableVnd: 0, reservedVnd: 0, paidVnd: 0
};

test('readOwn includes pending/held/reserved/paid rows instead of filtering to available', async () => {
  const repository = createMongoSettlementRepository({ connection: {}, models: models({
    earningRows: [earning], ledgerRows: [{ earningId: earning.earningId, sitterId: earning.sitterId,
      amountVnd: 100, fromBucket: null, toBucket: 'PENDING' }]
  }) });
  const projection = await repository.readOwn({ sitterId: earning.sitterId, requestWeekKey: '2026-10-12' });
  expect(projection.ledgerReady).toBe(true);
  expect(projection.earnings).toHaveLength(1);
  expect(projection.earnings[0]).toMatchObject({ id: earning.earningId, pendingVnd: 100, availableVnd: 0 });
  expect(projection.balances).toMatchObject({ accrued: 100, pending: 100, held: 0, available: 0 });
});

test('readOwn fails closed when a persisted earning bucket is malformed', async () => {
  const repository = createMongoSettlementRepository({ connection: {}, models: models({
    earningRows: [{ ...earning, heldVnd: -1 }], ledgerRows: []
  }) });
  await expect(repository.readOwn({ sitterId: earning.sitterId, requestWeekKey: '2026-10-12' }))
    .resolves.toEqual({ ledgerReady: false });
});
