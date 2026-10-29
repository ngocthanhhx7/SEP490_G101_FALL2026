import { settlementModels } from '../../models/settlement.model.js';
import { createMongoSettlementRepository } from './mongo-settlement.repository.js';
import { AppError } from '../../utils/app-error.js';

export function createBookingFinancialHolds({ connection, finance }) {
  const { Earning } = settlementModels(connection);
  const repository = createMongoSettlementRepository({ connection });
  return Object.freeze({ async change({ booking, lockType, reference, actorId, release = false, session }) {
    if (!session || !['CASE', 'REFUND'].includes(lockType) || typeof actorId !== 'string' || !actorId
      || typeof reference !== 'string' || !reference || reference.length > 160) throw new TypeError('Audited transactional hold required');
    await repository.assertIndexesReady();
    const guarded = await finance.touch(booking, session);
    const rows = await Earning.find({ bookingId: String(booking._id) }).session(session).limit(61).lean();
    if (rows.length > 60) throw new AppError(409, 'SOURCE_RECONCILIATION_REQUIRED', 'Booking earning ownership is ambiguous');
    for (const row of rows) {
      const input = { earningId: row.earningId, lockType, reference, actorId };
      if (release) await repository.unlockEarning(input, session);
      else await repository.lockEarning(input, session);
    }
    if (release) await finance.enqueue(guarded, session);
    return guarded;
  } });
}
