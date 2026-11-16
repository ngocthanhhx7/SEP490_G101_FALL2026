import { Types } from 'mongoose';
import { digest } from '../../validators/pet-care.validator.js';

const messages = {
  VisitWithdrawalRequested: ['Yêu cầu rút ca cần xử lý', 'Người chăm sóc gửi yêu cầu rút ca cận giờ. Ca vẫn giữ người phụ trách đến khi được xử lý.'],
  VisitWithdrawn: ['Ca đang được sắp xếp lại', 'Người chăm sóc đã rút ca. Lịch chỉ định cần khách xác nhận người thay thế.'],
  VisitWithdrawalApproved: ['Đã xử lý yêu cầu rút ca', 'Nhân viên đã chấp nhận yêu cầu rút. Ca được đưa về điều phối; người thay thế chưa được xác nhận.'],
  VisitWithdrawalRejected: ['Kết quả yêu cầu rút ca', 'Yêu cầu rút chưa được chấp nhận. Vui lòng xem kết quả và liên hệ điều phối.'],
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
    if (['VisitWithdrawalRequested', 'VisitWithdrawalApproved', 'VisitWithdrawalRejected', 'VisitWithdrawn'].includes(event.type))
      recipients.push({ id: event.sitterId, role: 'PET_SITTER', to: '/sitter/assignments' });
    if (['VisitWithdrawalApproved', 'VisitWithdrawn'].includes(event.type) && booking?.customerId)
      recipients.push({ id: String(booking.customerId), role: 'CUSTOMER', to: '/account/bookings/' + String(booking._id) });
    if (event.type === 'OfferCreated' || event.type === 'CustomerScheduleConfirmed') recipients.push({ id: event.sitterId, role: 'PET_SITTER', to: '/sitter/invitations' });
    if (['OfferAccepted', 'ScheduleProposed'].includes(event.type) && booking?.customerId) recipients.push({ id: String(booking.customerId), role: 'CUSTOMER',
      to: event.type === 'ScheduleProposed' ? '/account/schedule-proposals/' + event.detail.proposalId : '/account/bookings' });
    if (['DispatchReviewRequired', 'VisitWithdrawalRequested'].includes(event.type)) {
      const staff = await col('users').find({ state: 'ACTIVE', roles: { $in: ['STAFF', 'ADMIN'] }, synthetic: { $ne: true } },
        { session, projection: { _id: 1, roles: 1 }, maxTimeMS: 5000 }).toArray();
      for (const user of staff) recipients.push({ id: String(user._id), role: user.roles.includes('ADMIN') ? 'ADMIN' : 'STAFF',
        to: (user.roles.includes('ADMIN') ? '/admin/dispatch' : '/staff/dispatch')
          + (event.type === 'VisitWithdrawalRequested' ? '?withdrawalId=' + String(event.visitId) : '') });
    }
    const eventId = digest([event.type, event.visitId, event.offerId ?? event.detail?.proposalId ?? event.detail?.version]);
    const [title, message] = messages[event.type];
    for (const recipient of recipients) {
      await col('notifications').updateOne({ _id: digest([eventId, recipient.id, recipient.role]) }, { $setOnInsert: {
        eventId, recipientId: recipient.id, role: recipient.role, eventType: event.type, title,
        message: recipient.role === 'PET_SITTER' && ['VisitWithdrawalApproved', 'VisitWithdrawalRejected'].includes(event.type)
          ? `${message} Lý do: ${event.detail.reason}` : message,
        channel: 'IN_APP', deepLink: recipient.to, metadata: { visitId: String(event.visitId) }, createdAt: new Date(clock()), readAt: null
      } }, { upsert: true, session });
    }
  } };
}
