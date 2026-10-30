import { Types } from 'mongoose';
import { digest } from '../../validators/pet-care.validator.js';

const messages = {
  OfferCreated: ['Lời mời chăm sóc mới', 'Bạn có lời mời nhận ca đang chờ phản hồi.'],
  OfferAccepted: ['Đã nhận ca chăm sóc', 'Người chăm sóc đã xác nhận nhận ca.'],
  DispatchReviewRequired: ['Ca chăm sóc cần điều phối', 'Hệ thống chưa tìm được người nhận ca. Vui lòng kiểm tra và sắp xếp người chăm sóc.'],
  ScheduleProposed: ['Xác nhận lịch chăm sóc mới', 'Nhân viên đã đề xuất lịch thay thế. Vui lòng kiểm tra và xác nhận.'],
  CustomerScheduleConfirmed: ['Đã xác nhận lịch thay thế', 'Khách hàng đã xác nhận lịch mới. Lời mời nhận ca đã được tạo.']
};

// Runs in the same transaction as the operational event; command replay cannot
// create a second notification or commit a notification for a rolled back offer.
export function createSchedulingNotifications({ col, clock = Date.now }) {
  return { async publish(event, session) {
    if (!messages[event.type]) return;
    const visit = await col('visits').findOne({ _id: new Types.ObjectId(event.visitId) }, { session });
    if (!visit) return;
    const booking = await col('bookings').findOne({ _id: visit.bookingId }, { session });
    const recipients = [];
    if (event.type === 'OfferCreated' || event.type === 'CustomerScheduleConfirmed') recipients.push({ id: event.sitterId, role: 'PET_SITTER', to: '/sitter/invitations' });
    if (['OfferAccepted', 'ScheduleProposed'].includes(event.type) && booking?.customerId) recipients.push({ id: String(booking.customerId), role: 'CUSTOMER',
      to: event.type === 'ScheduleProposed' ? '/account/schedule-proposals/' + event.detail.proposalId : '/account/bookings' });
    if (event.type === 'DispatchReviewRequired') {
      const staff = await col('users').find({ state: 'ACTIVE', roles: { $in: ['STAFF', 'ADMIN'] } },
        { session, projection: { _id: 1, roles: 1 }, maxTimeMS: 5000 }).toArray();
      for (const user of staff) recipients.push({ id: String(user._id), role: user.roles.includes('ADMIN') ? 'ADMIN' : 'STAFF', to: '/staff/dispatch' });
    }
    const eventId = digest([event.type, event.visitId, event.offerId ?? event.detail?.proposalId ?? event.detail?.version]);
    const [title, message] = messages[event.type];
    for (const recipient of recipients) {
      await col('notifications').updateOne({ _id: digest([eventId, recipient.id, recipient.role]) }, { $setOnInsert: {
        eventId, recipientId: recipient.id, role: recipient.role, eventType: event.type, title, message,
        channel: 'IN_APP', deepLink: recipient.to, metadata: { visitId: String(event.visitId) }, createdAt: new Date(clock()), readAt: null
      } }, { upsert: true, session });
    }
  } };
}
