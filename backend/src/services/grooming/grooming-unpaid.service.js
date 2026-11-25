import { Types } from 'mongoose';
import { fail } from '../../validators/pet-care.validator.js';

// A handed-back shop appointment remains due until the recorded amount covers
// the agreed total. The status alone is not proof of payment.
export async function hasUnpaidGrooming(connection, customerId, session = null) {
  const rows = await connection.db.collection('groomingappointments').find({
    customerId: new Types.ObjectId(String(customerId)),
    handedBackAt: { $type: 'date' }
  }, { session, projection: { 'pricing.totalVnd': 1, 'payment.amountVnd': 1 }, maxTimeMS: 2000 }).limit(201).toArray();
  if (rows.length > 200) fail('GROOMING_PAYMENT_REVIEW_REQUIRED', 'Shop payment history needs review', 503);
  return rows.some(row => {
    const total = row.pricing?.totalVnd, paid = row.payment?.amountVnd ?? 0;
    return !Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(paid) || paid < total;
  });
}

export async function assertNoUnpaidGrooming(connection, customerId, session = null) {
  if (await hasUnpaidGrooming(connection, customerId, session))
    fail('GROOMING_PAYMENT_OUTSTANDING', 'Please pay the shop amount before another booking (MSG21)', 409);
}
