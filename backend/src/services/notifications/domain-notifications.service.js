import { digest } from '../../validators/pet-care.validator.js';

const pickupDeadlineFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
  day: '2-digit', month: '2-digit', year: 'numeric'
});

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
    async productOrder({ order, previous, placed = false, pickupExpired = false, paymentExpired = false }, session) {
      const id = String(order._id), eventId = `product-order:${id}:${order.version ?? 0}`;
      const states = { PLACED: 'đã được tiếp nhận', READY: 'đã sẵn sàng để nhận tại cửa hàng',
        PICKED_UP: 'đã giao cho bạn', HANDED_TO_CARRIER: 'đã bàn giao cho đơn vị vận chuyển',
        DELIVERED: 'đã giao thành công', BEING_RETURNED: 'đang được hoàn về cửa hàng',
        RETURNED: 'đã được xác nhận hoàn trả', CANCELLED: 'đã hủy' };
      let message = `Đơn ${order.code} ${states[order.status] ?? 'vừa được cập nhật'}.`;
      if (order.status === 'DELIVERED' && previous?.status !== 'DELIVERED') {
        if (order.deliveredBy === 'CUSTOMER') return;
        message = order.deliveredBy === 'SYSTEM'
          ? `Đơn ${order.code} đã được tự xác nhận là đã nhận hàng sau 7 ngày vận chuyển. Nếu bạn chưa nhận được hàng, hãy liên hệ cửa hàng.`
          : `Đơn ${order.code} đã giao thành công.`;
      } else if (pickupExpired && order.status === 'CANCELLED') {
        message = `Đơn ${order.code} đã huỷ vì quá hạn lấy hàng.`;
      } else if (paymentExpired && order.status === 'CANCELLED') {
        message = `Đơn ${order.code} đã huỷ vì quá hạn thanh toán.`;
      } else if (previous && !previous.paid && order.paid) {
        message = `Đơn ${order.code} đã được ghi nhận thanh toán.`;
      } else if (order.status === 'READY' && previous?.status !== 'READY' && order.pickupDeadlineAt) {
        const parts = pickupDeadlineFormat.formatToParts(order.pickupDeadlineAt);
        const { hour, minute, day, month, year } = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
        message += ` Vui lòng đến lấy trước ${hour}:${minute} ${day}/${month}/${year}.`;
      }
      if (placed && order.paymentMethod === 'PREPAID' && !order.paid && order.paymentDeadlineAt) {
        const { hour, minute, day, month, year } = Object.fromEntries(
          pickupDeadlineFormat.formatToParts(order.paymentDeadlineAt).map(({ type, value }) => [type, value]));
        message += ` Vui lòng thanh toán trước ${hour}:${minute} ${day}/${month}/${year}.`;
      }
      await write(eventId, placed ? 'ProductOrderPlaced' : 'ProductOrderUpdated',
        [{ id: order.customerId, role: 'CUSTOMER', to: `/customer/product-orders?order=${id}` }],
        placed ? 'Đặt hàng thành công' : 'Cập nhật đơn mua sản phẩm', message, session);
      if (placed) await write(eventId, 'ProductOrderPlaced', await operators(['ADMIN'], '/admin/product-orders', session),
        'Có đơn mua sản phẩm mới', `Đơn ${order.code} đang chờ cửa hàng chuẩn bị.`, session);
    },
    async payment({ eventId, booking, reconciliation }, session) {
      const type = reconciliation ? 'PaymentReconciliationRequired' : 'PaymentVerified';
      const recipients = reconciliation ? await operators(['ADMIN', 'STAFF'], '/staff/dispatch', session)
        : [{ id: booking?.customerId, to: booking?._id ? '/account/bookings/' + String(booking._id) : '/account/bookings' }];
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
        const area = roles.includes('ADMIN') ? 'admin' : 'staff';
        const to = event === 'ComplaintRefundProposed'
          ? '/admin/refunds?complaint=' + encodeURIComponent(record.id)
          : '/' + area + '/complaints?complaint=' + encodeURIComponent(record.id);
        await write(eventId, event, await operators(roles, to, session), title, message, session);
      }
      if (['ComplaintResolved', 'ComplaintRefundDecided', 'ComplaintDecided'].includes(event)) {
        const final = event === 'ComplaintDecided';
        const to = '/account/bookings/' + encodeURIComponent(String(record.bookingId)) +
          '/complaints/new?complaint=' + encodeURIComponent(record.id);
        await write(eventId, event, [{ id: record.customerId, role: 'CUSTOMER', to }],
          final ? 'Kết quả cuối của khiếu nại' : 'Khiếu nại đã có kết quả',
          code + (final ? ' đã có kết quả cuối.' : ' đã có kết quả xử lý.'), session);
      }
    },
    async incidentRefundDecided({ eventId, record, outcome }, session) {
      const cleanIncidentId = String(record.id ?? '').replaceAll('-', '').toUpperCase();
      const code = record.code ?? ('SC-' + (cleanIncidentId.length > 12 ? cleanIncidentId.slice(-12) : cleanIncidentId));
      const to = '/cases/' + encodeURIComponent(record.id);
      const amount = record.moneyDecision?.amountVnd;
      const fmt = value => `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
      let staffMessage = `Quản trị viên đã duyệt đề xuất hoàn ${fmt(amount ?? 0)} cho sự cố ${code}.`;
      if (outcome === 'REDUCE') {
        staffMessage = `Quản trị viên đã hạ số tiền hoàn cho sự cố ${code} từ ${fmt(record.proposal?.amountVnd ?? 0)} xuống ${fmt(amount ?? 0)}.`;
      } else if (outcome === 'REJECT') {
        staffMessage = `Quản trị viên đã từ chối đề xuất hoàn tiền cho sự cố ${code}.${record.moneyDecision?.reason ? ' Lý do: ' + record.moneyDecision.reason : ''}`;
      }
      await write(eventId, 'IncidentRefundDecided', await operators(['STAFF'], to, session),
        'Đã có quyết định về khoản hoàn sự cố', staffMessage, session);
      const customerMessage = outcome === 'REJECT'
        ? `Sự cố ${code} đã được giải quyết. Xem kết quả xử lý trong chi tiết sự cố.`
        : `Sự cố ${code} đã được giải quyết với khoản hoàn tiền ${fmt(amount ?? 0)}.`;
      if (record.customerId) {
        await write(eventId, 'IncidentResolved', [{ id: record.customerId, role: 'CUSTOMER', to }],
          'Sự cố đã được giải quyết', customerMessage, session);
      }
      if (record.sitterId) {
        await write(eventId, 'IncidentResolved', [{ id: record.sitterId, role: 'PET_SITTER', to }],
          'Sự cố đã được giải quyết', `Sự cố ${code} đã được giải quyết. Vui lòng xem kết quả xử lý.`, session);
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
    async visit({ visitId, version, customerId, bookingId, operation }, session) {
      const labels = { CHECK_IN: ['Đã bắt đầu chăm sóc', 'Người chăm sóc đã ghi nhận bắt đầu buổi chăm sóc.'],
        CHECK_OUT: ['Đã hoàn thành buổi chăm sóc', 'Người chăm sóc đã ghi nhận hoàn thành. Bạn có thể xem chi tiết trong đơn chăm sóc.'] };
      if (!labels[operation]) return;
      const to = /^[a-f0-9]{24}$/.test(bookingId ?? '') && /^[a-f0-9]{24}$/.test(visitId ?? '')
        ? '/account/bookings/' + bookingId + '/visits/' + visitId : '/account/bookings';
      await write(`visit:${visitId}:${version}`, `Visit${operation}`, [{ id: customerId, to }], ...labels[operation], session);
    },
    async bookingCancelled({ eventId, sitters }, session) {
      for (const row of sitters ?? []) {
        const count = row.visitIds?.length ?? 1;
        await write(eventId, 'VisitCancelledByCustomer',
          [{ id: row.sitterId, role: 'PET_SITTER', to: '/sitter/visits' }],
          'Khách hàng đã huỷ buổi chăm sóc',
          count > 1
            ? `Khách hàng đã huỷ ${count} buổi chăm sóc mà bạn đã nhận.`
            : 'Khách hàng đã huỷ một buổi chăm sóc mà bạn đã nhận.',
          session);
      }
    }
  };
}
