import { digest } from '../../validators/pet-care.validator.js';

// Call inside the domain command's transaction, after its guarded state change.
// Stable event/recipient ids make command retries safe without a second worker.
export function createDomainNotifications({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name);
  async function write(eventId, eventType, recipients, title, message, session) {
    for (const recipient of recipients.filter(row => row.id)) {
      await col('notifications').updateOne({ _id: digest([eventId, String(recipient.id), recipient.role ?? null]) }, { $setOnInsert: {
        eventId, eventType, recipientId: String(recipient.id), role: recipient.role ?? null,
        title, message, channel: 'IN_APP', deepLink: recipient.to, createdAt: new Date(clock()), readAt: null
      } }, { upsert: true, session });
    }
  }
  async function operators(roles, to, session) {
    const rows = await col('users').find({ state: 'ACTIVE', roles: { $in: roles }, synthetic: { $ne: true } },
      { session, projection: { _id: 1 }, maxTimeMS: 5000 }).toArray();
    return rows.map(row => ({ id: row._id, to }));
  }
  return {
    async payment({ eventId, booking, reconciliation }, session) {
      const type = reconciliation ? 'PaymentReconciliationRequired' : 'PaymentVerified';
      const recipients = reconciliation ? await operators(['ADMIN', 'STAFF'], '/staff/dispatch', session)
        : [{ id: booking?.customerId, to: '/account/bookings' }];
      await write(eventId, type, recipients,
        reconciliation ? 'Thanh toán cần đối soát' : 'Đã xác nhận thanh toán',
        reconciliation ? 'Có giao dịch cần nhân viên kiểm tra và đối soát.' : 'Thanh toán cho đơn chăm sóc đã được xác thực. Bạn có thể theo dõi đơn trong tài khoản.', session);
    },
    async payroll({ eventId, employeeId, type }, session) {
      const submitted = type.endsWith('_SUBMITTED');
      const recipients = submitted ? await operators(['ADMIN'], '/admin/payroll', session)
        : [{ id: employeeId, to: '/sitter/payroll' }];
      await write(eventId, type, recipients, submitted ? 'Yêu cầu nhân sự chờ xử lý' : 'Cập nhật lương và tạm ứng',
        submitted ? 'Có yêu cầu mới cần quản trị viên kiểm tra.' : 'Hồ sơ lương hoặc tạm ứng của bạn vừa được cập nhật. Mở chi tiết để xem trạng thái đã ghi nhận.', session);
    },
    async application({ applicationId, ownerId, approved }, session) {
      await write(`application-decision:${applicationId}`, 'ApplicationDecided', [{ id: ownerId, to: '/sitter/application-status' }],
        approved ? 'Hồ sơ ứng tuyển đã được duyệt' : 'Đã có kết quả hồ sơ ứng tuyển',
        approved ? 'Hồ sơ của bạn đã được duyệt. Đăng nhập lại để cập nhật quyền người chăm sóc.' : 'Hồ sơ của bạn đã có kết quả. Vui lòng xem trạng thái hồ sơ.', session);
    },
    async visit({ visitId, version, customerId, operation }, session) {
      const labels = { CHECK_IN: ['Đã bắt đầu chăm sóc', 'Người chăm sóc đã ghi nhận bắt đầu buổi chăm sóc.'],
        CHECK_OUT: ['Đã hoàn thành buổi chăm sóc', 'Người chăm sóc đã ghi nhận hoàn thành. Bạn có thể xem chi tiết trong đơn chăm sóc.'] };
      if (!labels[operation]) return;
      await write(`visit:${visitId}:${version}`, `Visit${operation}`, [{ id: customerId, to: '/account/bookings' }], ...labels[operation], session);
    }
  };
}
