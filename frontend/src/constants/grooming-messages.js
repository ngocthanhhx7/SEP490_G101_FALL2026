// Messages of the shop grooming booking and cancellation (R3 sections 7.2.1, 22.1.1, GBR-40).
export const GROOMING_TIERS = Object.freeze({ MEMBER: 'Thành viên', SILVER: 'Bạc', GOLD: 'Vàng' });
export const GROOMING_CANCEL_MIN_LEAD_MINUTES = 120;
export const GROOMING_STATUS_LABELS = Object.freeze({
  BOOKED: 'Đã đặt',
  CHECKED_IN: 'Đã check-in',
  HANDED_BACK_PAID: 'Đã thanh toán',
  NO_SHOW: 'Không đến',
  CLOSED_NO_CHARGE: 'Đã đóng',
  CANCELLED: 'Đã huỷ'
});

// MSG63: the hotline is only named when the shop has set one.
export const msg63 = hotline => (hotline
  ? `Vui lòng gọi cửa hàng theo số ${hotline} để đặt lịch tắm và cắt tỉa cho thú này.`
  : 'Vui lòng gọi cửa hàng để đặt lịch tắm và cắt tỉa cho thú này.');
export const MSG64 = 'Giờ hẹn này không còn trống. Vui lòng chọn giờ khác.';
export const msg65 = (localDate, time) => {
  const [year, month, day] = localDate.split('-');
  return `Lịch hẹn ngày ${day}/${month}/${year} lúc ${time} đã được đặt. Bạn thanh toán tại cửa hàng khi nhận thú cưng.`;
};
// MSG157: confirmation box before a customer cancels a shop appointment.
export const msg157 = (localDate, time) => {
  const [year, month, day] = localDate.split('-');
  return `Huỷ lịch hẹn lúc ${time} ngày ${day}/${month}/${year}? Không mất phí.`;
};
// MSG158: toast message after a customer cancels a shop appointment.
export const MSG158 = 'Lịch hẹn đã được huỷ.';
// MSG159: in-line message when the appointment starts in less than 2 hours.
export const msg159 = hotline => (hotline
  ? `Lịch hẹn này không còn huỷ được tại đây. Vui lòng gọi cửa hàng theo số ${hotline}.`
  : 'Lịch hẹn này không còn huỷ được tại đây. Vui lòng gọi cửa hàng.');
export const NO_DEPOSIT = 'Không cần đặt cọc. Bạn trả tiền khi đón thú tại cửa hàng, bằng tiền mặt hoặc VietQR.';
export const VERY_RISKY_NOTE = 'Thú rất hung dữ hoặc dễ hoảng sợ không đặt được trên web. Vui lòng gọi cửa hàng để được hẹn riêng.';
export const NO_PETS = 'Bạn chưa có hồ sơ thú cưng nào. Hãy thêm thú cưng trước khi đặt lịch.';
