import { Types } from 'mongoose';
import { createVisitReminderJob } from './visit-reminder.policy.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { digest } from '../../validators/pet-care.validator.js';

const sameInstant = (left, right) => (left?.getTime() ?? null) === (right?.getTime() ?? null);

// JOB-01 / GBR-47. The notifier is the in-app database, not an external provider.
export function createVisitRemindersService({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name), uow = createUnitOfWork(connection);
  const jobs = [120, 30].map(leadMinutes => {
    const marker = `startReminders.m${leadMinutes}`;
    const query = at => ({ state: 'ASSIGNED', sitterId: { $type: 'objectId' },
      startAt: { $gt: at, $lte: new Date(+at + leadMinutes * 60000) },
      $expr: { $or: [
        { $ne: [{ $ifNull: [`$${marker}.startAt`, null] }, '$startAt'] },
        { $ne: [{ $ifNull: [`$${marker}.sitter.startAt`, null] }, '$startAt'] },
        { $ne: [{ $ifNull: [`$${marker}.sitter.recipientId`, null] }, '$sitterId'] },
        { $ne: [{ $ifNull: [`$${marker}.sitter.assignedAt`, null] }, { $ifNull: ['$assignedAt', null] }] },
        { $ne: [{ $ifNull: [`$${marker}.sitter.assignmentVersion`, -1] }, { $ifNull: ['$assignmentVersion', 0] }] }
      ] } });
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
          const filter = { _id: new Types.ObjectId(command.visitId),
            $and: [query(at), { startAt: new Date(command.startAt), version: command.scheduleVersion, sitterId: new Types.ObjectId(command.recipients.at(-1)) }] };
          const visit = await col('visits').findOne(filter, { session });
          if (!visit) return { status: 'ALREADY_EXISTS' };
          const booking = await col('bookings').findOne({ _id: visit.bookingId }, { session });
          if (!booking?.customerId || !['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(booking.state)) throw new Error('Visit booking is not active');
          const sent = visit.startReminders?.[`m${leadMinutes}`];
          const customerSent = sameInstant(sent?.startAt, visit.startAt);
          const assignmentVersion = visit.assignmentVersion ?? 0;
          let sitterSent = sameInstant(sent?.sitter?.startAt, visit.startAt)
            && String(sent?.sitter?.recipientId) === String(visit.sitterId)
            && sameInstant(sent?.sitter?.assignedAt, visit.assignedAt)
            && sent?.sitter?.assignmentVersion === assignmentVersion;
          // Old markers described both recipients but did not store assignment
          // identity. Preserve their customer delivery and adopt a sitter's
          // original notification only if this assignment predates that send.
          if (!sent?.sitter && customerSent && assignmentVersion === 0 && sent.notifiedAt instanceof Date
            && (!visit.assignedAt || visit.assignedAt <= sent.notifiedAt)) {
            sitterSent = Boolean(await col('notifications').findOne({ eventType: 'VISIT_REMINDER', role: 'PET_SITTER',
              recipientId: String(visit.sitterId), 'metadata.visitId': String(visit._id),
              'metadata.leadMinutes': leadMinutes, createdAt: sent.notifiedAt }, { session, projection: { _id: 1 } }));
          }
          const claimed = await col('visits').updateOne(filter, { $set: { [marker]: {
            startAt: visit.startAt, customerId: booking.customerId, notifiedAt: customerSent ? sent.notifiedAt : at,
            sitter: { startAt: visit.startAt, recipientId: visit.sitterId, assignedAt: visit.assignedAt ?? null,
              assignmentVersion, notifiedAt: sitterSent ? sent?.sitter?.notifiedAt ?? sent.notifiedAt : at }
          } } }, { session });
          if (!claimed.matchedCount) return { status: 'ALREADY_EXISTS' };
          const recipients = [
            ...(!customerSent ? [{ id: String(booking.customerId), role: 'CUSTOMER', to: `/account/bookings/${booking._id}` }] : []),
            ...(!sitterSent ? [{ id: String(visit.sitterId), role: 'PET_SITTER', to: `/sitter/visits/${visit._id}` }] : [])
          ];
          const time = visit.startAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
          const address = visit.snapshots?.serviceAddress;
          const addressText = typeof address === 'string' ? address : address?.addressLine ?? address?.label ?? '';
          const pets = (visit.snapshots?.pets ?? []).map(pet => pet.name).filter(Boolean).join(', ');
          for (const recipient of recipients) {
            // A customer's reminder follows the schedule. A sitter's reminder
            // follows the assignment, not unrelated writes to visit.version.
            const eventId = `visit-reminder:v2:${digest([String(visit._id), visit.startAt.toISOString(), leadMinutes,
              recipient.id, recipient.role, ...(recipient.role === 'PET_SITTER'
                ? [assignmentVersion, visit.assignedAt?.toISOString() ?? null] : [])])}`;
            await col('notifications').updateOne({ _id: digest([eventId, recipient.id, recipient.role]) }, { $setOnInsert: {
              eventId, eventType: 'VISIT_REMINDER', recipientId: recipient.id, role: recipient.role,
              channel: 'IN_APP', title: 'Nhắc lịch chăm sóc thú cưng',
              message: `Buổi chăm sóc lúc ${time}. Địa chỉ: ${addressText}. Thú cưng: ${pets}.`,
              deepLink: recipient.to, metadata: { visitId: String(visit._id), leadMinutes, startAt: visit.startAt.toISOString(),
                ...(recipient.role === 'PET_SITTER' ? { assignmentVersion, assignedAt: visit.assignedAt ?? null } : {}) }, createdAt: at, readAt: null
            } }, { upsert: true, session });
          }
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
