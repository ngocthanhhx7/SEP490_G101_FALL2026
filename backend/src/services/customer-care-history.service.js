import { Types } from 'mongoose';

// A completed care visit is real service history, including a completed visit in a multi-visit booking.
export async function hasCompletedCustomerCare(db, customerId) {
  return !!await db.collection('visits').findOne({ customerId: new Types.ObjectId(customerId), state: 'COMPLETED' },
    { projection: { _id: 1 }, maxTimeMS: 5000 });
}
