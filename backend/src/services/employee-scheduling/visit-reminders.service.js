import { Types } from 'mongoose';
import { createVisitReminderJob } from './visit-reminder.policy.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { digest } from '../../validators/pet-care.validator.js';

// JOB-01 / GBR-47. The notifier is the in-app database, not an external provider.
export function createVisitRemindersService({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name), uow = createUnitOfWork(connection);
  const jobs = [120, 30].map(leadMinutes => {
    const marker = `startReminders.m${leadMinutes}`;
    const query = at => ({ state: 'ASSIGNED', sitterId: { $type: 'objectId' },
      startAt: { $gt: at, $lte: new Date(+at + leadMinutes * 60000) },
      $expr: { $ne: [{ $ifNull: [`$${marker}.startAt`, null] }, '$startAt'] } });
    return createVisitReminderJob({ leadMinutes, clock: () => new Date(clock()), limit: 100,
      repository: { async findUpcomingVisits() {
        const rows = await col('visits').find(query(new Date(clock())), { maxTimeMS: 5000 }).sort({ startAt: 1, _id: 1 }).limit(100).toArray();
        return rows.map(row => ({ visitId: String(row._id), bookingId: String(row.bookingId), state: row.state,
          startAt: row.startAt.toISOString(), scheduleVersion: row.version ?? 0,
          sitterId: String(row.sitterId), customerId: row.customerId && String(row.customerId) }));
      } },
      notifier: { async sendVisitReminder(command) {
        return uow.run(async session => {
          const at = new Date(clock());
          const visit = await col('visits').findOneAndUpdate({ _id: new Types.ObjectId(command.visitId),
            $and: [query(at), { startAt: new Date(command.startAt), version: command.scheduleVersion, sitterId: new Types.ObjectId(command.recipients.at(-1)) }] },
          { $set: { [marker]: { startAt: new Date(command.startAt), notifiedAt: at } } }, { session, returnDocument: 'after' });
          if (!visit) return { status: 'ALREADY_EXISTS' };
          const booking = await col('bookings').findOne({ _id: visit.bookingId }, { session });
          if (!booking?.customerId || !['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(booking.state)) throw new Error('Visit booking is not active');
          const recipients = [{ id: String(booking.customerId), role: 'CUSTOMER', to: `/account/bookings/${booking._id}` },
            { id: String(visit.sitterId), role: 'PET_SITTER', to: `/sitter/visits/${visit._id}` }];
          const time = visit.startAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
          const address = visit.snapshots?.serviceAddress;
          const addressText = typeof address === 'string' ? address : address?.addressLine ?? address?.label ?? '';
          const pets = (visit.snapshots?.pets ?? []).map(pet => pet.name).filter(Boolean).join(', ');
          for (const recipient of recipients) await col('notifications').updateOne({ _id: digest([command.idempotencyKey, recipient.id, recipient.role]) }, { $setOnInsert: {
            eventId: command.idempotencyKey, eventType: 'VISIT_REMINDER', recipientId: recipient.id, role: recipient.role,
            channel: 'IN_APP', title: 'Nhắc lịch chăm sóc thú cưng',
            message: `Buổi chăm sóc lúc ${time}. Địa chỉ: ${addressText}. Thú cưng: ${pets}.`,
            deepLink: recipient.to, metadata: { visitId: String(visit._id), leadMinutes }, createdAt: at, readAt: null
          } }, { upsert: true, session });
          return { status: 'ACCEPTED' };
        });
      } }
    });
  });
  return { async runBatch() {
    const results = [];
    for (const job of jobs) results.push(await job.runOnce());
    return { reminded: results.reduce((sum, row) => sum + row.reminded, 0), failed: results.reduce((sum, row) => sum + row.failed, 0) };
  } };
}
