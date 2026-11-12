
export const VISIT_WITHDRAWAL_REASON_LABELS = Object.freeze({
  ILLNESS: 'Ốm, không đi được',
  FAMILY_EMERGENCY: 'Việc gia đình đột xuất',
  SCHEDULE_CONFLICT: 'Trùng lịch khác',
  OTHER: 'Lý do khác'
});

const vietnam = { timeZone: 'Asia/Ho_Chi_Minh' };
const date = new Intl.DateTimeFormat('en-GB', { ...vietnam, day: '2-digit', month: '2-digit', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-GB', { ...vietnam, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const formatWithdrawalDate = value => date.format(new Date(value));
export const formatWithdrawalTime = value => time.format(new Date(value));
export const VISIT_WITHDRAWAL_MESSAGES = Object.freeze({
  MSG56: 'Buổi này bắt đầu sau chưa đầy 12 giờ. Yêu cầu của bạn đã được gửi cho nhân viên.',
  MSG57: startAt => `Bạn đã rút khỏi buổi ngày ${formatWithdrawalDate(startAt)} lúc ${formatWithdrawalTime(startAt)}.`
});
