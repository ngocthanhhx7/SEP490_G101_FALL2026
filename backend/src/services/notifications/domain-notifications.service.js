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
    async productOrder({ order, previous, placed = false }, session) {
      const id = String(order._id), eventId = `product-order:${id}:${order.version ?? 0}`;
      const states = { PLACED: 'đã được tiếp nhận', READY: 'đã sẵn sàng để nhận tại cửa hàng',
        PICKED_UP: 'đã giao cho bạn', HANDED_TO_CARRIER: 'đã bàn giao cho đơn vị vận chuyển',
        DELIVERED: 'đã giao thành công', BEING_RETURNED: 'đang được hoàn về cửa hàng',
        RETURNED: 'đã được xác nhận hoàn trả', CANCELLED: 'đã hủy' };
      const message = previous && !previous.paid && order.paid
        ? `Đơn ${order.code} đã được ghi nhận thanh toán.`
        : `Đơn ${order.code} ${states[order.status] ?? 'vừa được cập nhật'}.`;
      await write(eventId, placed ? 'ProductOrderPlaced' : 'ProductOrderUpdated',
        [{ id: order.customerId, role: 'CUSTOMER', to: `/customer/product-orders?order=${id}` }],
        placed ? 'Đặt hàng thành công' : 'Cập nhật đơn mua sản phẩm', message, session);
      if (placed) await write(eventId, 'ProductOrderPlaced', await operators(['ADMIN'], '/admin/product-orders', session),
        'Có đơn mua sản phẩm mới', `Đơn ${order.code} đang chờ cửa hàng chuẩn bị.`, session);
    },
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
    async complaint({ eventId, event, record }, session) {
      const code = record.code ?? 'khiếu nại';
      const events = {
        ComplaintOpened: [['STAFF'], 'Có khiếu nại mới', code + ' đang chờ xử lý.'],
        ComplaintRefundProposed: [['ADMIN'], 'Có khoản đề xuất cần duyệt', code + ' đang chờ quyết định về khoản đề xuất.'],
        ComplaintObjected: [['ADMIN'], 'Khiếu nại chuyển quản trị', 'Khách đã gửi ý kiến về kết quả của ' + code + '.'],
        ComplaintRefundDecided: [['STAFF'], 'Đã có quyết định về khoản đề xuất', 'Quản trị viên đã quyết định khoản đề xuất của ' + code + '.']
      };
      const notification = events[event];
      if (notification) {
        const [roles, title, message] = notification;
        await write(eventId, event, await operators(roles, null, session), title, message, session);
      }
      if (['ComplaintResolved', 'ComplaintRefundDecided', 'ComplaintDecided'].includes(event)) {
        const final = event === 'ComplaintDecided';
        await write(eventId, event, [{ id: record.customerId, role: 'CUSTOMER', to: null }],
          final ? 'Kết quả cuối của khiếu nại' : 'Khiếu nại đã có kết quả',
          code + (final ? ' đã có kết quả cuối.' : ' đã có kết quả xử lý.'), session);
      }
    },
    // R3 MSG122: one notice for the Admins for each receipt line that rejected goods. The event id is stable, so saving
    // the same receipt line again never writes a second notice. The link opens the receipt on the Goods Receipt page.
    async goodsReceiptRejected({ code, productId, productName, quantity, reason }, session) {
      await write(`goods-receipt:${code}:${productId}`, 'GoodsReceiptRejected',
        await operators(['ADMIN'], `/admin/goods-receipts?receipt=${code}`, session),
        'Hàng nhập bị từ chối',
        `Phiếu nhập ${code}: từ chối ${quantity} ${productName}. Lý do: ${reason}.`, session);
    },
    async visit({ visitId, version, customerId, operation }, session) {
      const labels = { CHECK_IN: ['Đã bắt đầu chăm sóc', 'Người chăm sóc đã ghi nhận bắt đầu buổi chăm sóc.'],
        CHECK_OUT: ['Đã hoàn thành buổi chăm sóc', 'Người chăm sóc đã ghi nhận hoàn thành. Bạn có thể xem chi tiết trong đơn chăm sóc.'] };
      if (!labels[operation]) return;
      await write(`visit:${visitId}:${version}`, `Visit${operation}`, [{ id: customerId, to: '/account/bookings' }], ...labels[operation], session);
    }
  };
}
