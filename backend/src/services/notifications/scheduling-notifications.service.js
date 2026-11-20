import { Types } from 'mongoose';
import { digest } from '../../validators/pet-care.validator.js';

const messages = {
  VisitWithdrawalRequested: ['Yêu cầu rút ca cần xử lý', 'Người chăm sóc gửi yêu cầu rút ca cận giờ. Ca vẫn giữ người phụ trách đến khi được xử lý.'],
  VisitWithdrawn: ['Ca đang được sắp xếp lại', 'Người chăm sóc đã rút ca. Lịch chỉ định cần khách xác nhận người thay thế.'],
  VisitWithdrawalApproved: ['Đã xử lý yêu cầu rút ca', 'Nhân viên đã chấp nhận yêu cầu rút. Ca được đưa về điều phối; người thay thế chưa được xác nhận.'],
  VisitWithdrawalRejected: ['Kết quả yêu cầu rút ca', 'Yêu cầu rút chưa được chấp nhận. Vui lòng xem kết quả và liên hệ điều phối.'],
  VisitClosureVerificationRequired: ['Buổi chờ xác minh dịch vụ', 'Nhân viên đã đóng buổi thiếu check-out. Quản trị cần đối chiếu bằng chứng và giờ làm thực tế.'],
  VisitClosureVerified: ['Đã đối chiếu buổi chăm sóc', 'Quản trị đã ghi nhận kết quả đối chiếu bằng chứng. Xem thông tin buổi để kiểm tra kết quả.'],
  VisitEndingSoon: ['Sắp kết thúc buổi chăm sóc', 'Còn khoảng 5 phút đến giờ kết thúc. Hãy kiểm tra công việc và hoàn tất báo cáo, ảnh check-out khi xong.'],
  VisitCheckOutReminder: ['Nhắc hoàn tất check-out', 'Buổi đã quá giờ dự kiến 15 phút nhưng chưa có check-out. Hãy hoàn tất báo cáo thực tế hoặc liên hệ điều phối nếu cần hỗ trợ.'],
  VisitCompletionReviewRequired: ['Cần xác minh kết thúc buổi', 'Buổi đã quá giờ kết thúc 2 giờ nhưng chưa có check-out. Cần nhân viên hoặc quản trị xác minh; chưa tự xác nhận hoàn thành.'],
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
    if (['VisitEndingSoon', 'VisitCheckOutReminder', 'VisitCompletionReviewRequired', 'VisitClosureVerified', 'VisitWithdrawalRequested', 'VisitWithdrawalApproved', 'VisitWithdrawalRejected', 'VisitWithdrawn'].includes(event.type))
      recipients.push({ id: event.sitterId, role: 'PET_SITTER', to: ['VisitWithdrawalApproved', 'VisitWithdrawn'].includes(event.type) ? '/sitter/invitations' : '/sitter/visits/' + String(event.visitId) });
    if (['VisitWithdrawalApproved', 'VisitWithdrawn'].includes(event.type) && booking?.customerId)
      recipients.push({ id: String(booking.customerId), role: 'CUSTOMER', to: '/account/bookings/' + String(booking._id) });
    if (event.type === 'OfferCreated' || event.type === 'CustomerScheduleConfirmed') recipients.push({ id: event.sitterId, role: 'PET_SITTER',
      to: /^[a-f0-9]{24}$/.test(event.offerId ?? '') ? '/sitter/invitations?offerId=' + event.offerId : '/sitter/invitations' });
    if (['OfferAccepted', 'ScheduleProposed'].includes(event.type) && booking?.customerId) recipients.push({ id: String(booking.customerId), role: 'CUSTOMER',
      to: event.type === 'ScheduleProposed' ? '/account/schedule-proposals/' + event.detail.proposalId : '/account/bookings/' + String(booking._id) });
    if (['DispatchReviewRequired', 'VisitCompletionReviewRequired', 'VisitClosureVerificationRequired', 'VisitWithdrawalRequested'].includes(event.type)) {
      const staff = await col('users').find({ state: 'ACTIVE', roles: { $in: event.type === 'VisitClosureVerificationRequired' ? ['ADMIN'] : ['STAFF', 'ADMIN'] }, synthetic: { $ne: true } },
        { session, projection: { _id: 1, roles: 1 }, maxTimeMS: 5000 }).toArray();
      for (const user of staff) recipients.push({ id: String(user._id), role: user.roles.includes('ADMIN') ? 'ADMIN' : 'STAFF',
        to: (user.roles.includes('ADMIN') ? '/admin/dispatch' : '/staff/dispatch')
          + (event.type === 'VisitWithdrawalRequested' ? '?withdrawalId=' + String(event.visitId) : event.type !== 'DispatchReviewRequired' ? '?closureId=' + String(event.visitId) : '') });
    }
    const eventId = digest([event.type, event.visitId, event.offerId ?? event.detail?.proposalId ?? event.detail?.noticeKey ?? event.detail?.version]);
    const [title, message] = messages[event.type];
    for (const recipient of recipients) {
      await col('notifications').updateOne({ _id: digest([eventId, recipient.id, recipient.role]) }, { $setOnInsert: {
        eventId, recipientId: recipient.id, role: recipient.role, eventType: event.type, title,
        message: recipient.role === 'PET_SITTER' && ['VisitWithdrawalApproved', 'VisitWithdrawalRejected'].includes(event.type)
          ? `${message} Lý do: ${event.detail.reason}` : message,
        channel: 'IN_APP', deepLink: recipient.to, metadata: { visitId: String(event.visitId), ...(event.offerId ? { offerId: String(event.offerId) } : {}) }, createdAt: new Date(clock()), readAt: null
      } }, { upsert: true, session });
    }
  } };
}
