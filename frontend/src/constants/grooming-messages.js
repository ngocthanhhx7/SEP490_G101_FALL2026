// Messages of the shop grooming booking (R3 section 22.1.1). MSG63 and MSG64 are shown in line, MSG65 after a booking.
export const GROOMING_TIERS = Object.freeze({ MEMBER: 'Thành viên', SILVER: 'Bạc', GOLD: 'Vàng' });

// MSG63: the hotline is only named when the shop has set one.
export const msg63 = hotline => (hotline
  ? `Vui lòng gọi cửa hàng theo số ${hotline} để đặt lịch tắm và cắt tỉa cho thú này.`
  : 'Vui lòng gọi cửa hàng để đặt lịch tắm và cắt tỉa cho thú này.');
export const MSG64 = 'Giờ hẹn này không còn trống. Vui lòng chọn giờ khác.';
export const msg65 = (localDate, time) => {
  const [year, month, day] = localDate.split('-');
  return `Lịch hẹn ngày ${day}/${month}/${year} lúc ${time} đã được đặt. Bạn thanh toán tại cửa hàng khi nhận thú cưng.`;
};
export const NO_DEPOSIT = 'Không cần đặt cọc. Bạn trả tiền khi đón thú tại cửa hàng, bằng tiền mặt hoặc VietQR.';
export const VERY_RISKY_NOTE = 'Thú rất hung dữ hoặc dễ hoảng sợ không đặt được trên web. Vui lòng gọi cửa hàng để được hẹn riêng.';
export const NO_PETS = 'Bạn chưa có hồ sơ thú cưng nào. Hãy thêm thú cưng trước khi đặt lịch.';
