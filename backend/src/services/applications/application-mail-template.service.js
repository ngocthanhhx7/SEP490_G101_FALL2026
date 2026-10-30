const COPY = {
  PENDING: ['Hồ sơ đã được tiếp nhận', 'Cảm ơn bạn đã chọn đồng hành cùng PawWorld.', 'Chúng mình đã nhận hồ sơ ứng tuyển Pet Sitter của bạn. Đội ngũ tuyển dụng sẽ kiểm tra thông tin và cập nhật tiến trình trong hồ sơ.'],
  UNDER_REVIEW: ['Hồ sơ đang được thẩm định', 'Một bước gần hơn với hành trình chăm sóc thú cưng.', 'Đội ngũ PawWorld đang xem xét thông tin và giấy tờ bạn cung cấp. Hãy theo dõi hồ sơ để biết các cập nhật tiếp theo.'],
  INTERVIEW: ['Hồ sơ đã chuyển sang phỏng vấn', 'Cùng chuẩn bị cho bước tiếp theo.', 'Hồ sơ của bạn đã qua bước thẩm định và chuyển sang phỏng vấn. PawWorld sẽ trao đổi với bạn về thông tin và lịch phỏng vấn; email này không tự xác nhận một lịch hẹn.'],
  APPROVED: ['Chúc mừng Pet Sitter mới của PawWorld!', 'Chào mừng bạn đến với đội ngũ PawWorld.', 'Hồ sơ của bạn đã được duyệt và tài khoản đã được cấp quyền Pet Sitter. Cảm ơn bạn đã mang sự tận tâm đến với những người bạn nhỏ. Vui lòng đăng nhập lại để cập nhật quyền và tiếp tục hoàn thiện thông tin nhân sự, lịch làm việc theo hướng dẫn.'],
  REJECTED: ['Đã có kết quả hồ sơ ứng tuyển', 'Cảm ơn bạn đã dành thời gian cho PawWorld.', 'Rất tiếc, hồ sơ của bạn chưa được duyệt trong lần này. Bạn có thể xem lý do và thời hạn nộp lại trong trang theo dõi hồ sơ. Chúng mình trân trọng sự quan tâm của bạn.']
};
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function renderApplicationMail(command) {
  const copy = Object.hasOwn(COPY, command.applicationState) ? COPY[command.applicationState] : null;
  let origin;
  try { origin = new URL(command.webOrigin); } catch { return { error: 'INVALID_REQUEST' }; }
  if (!copy || origin.protocol !== 'https:' || origin.username || origin.password) return { error: 'INVALID_REQUEST' };
  const approved = command.applicationState === 'APPROVED';
  const statusUrl = origin.origin + '/sitter/application-status';
  const actionUrl = approved ? origin.origin + '/sign-in' : statusUrl;
  const action = approved ? 'Đăng nhập với quyền Pet Sitter' : 'Theo dõi hồ sơ của bạn';
  const [title, lead, message] = copy;
  const text = `PawWorldCare\n${title}\n\nChào bạn,\n${lead}\n\n${message}\n\n${action}: ${actionUrl}\nTheo dõi hồ sơ: ${statusUrl}\n\nGiấy tờ và ghi chú nội bộ không được gửi kèm email. Nếu cần hỗ trợ, hãy liên hệ PawWorld qua ${origin.origin}/contact.\nPawWorld Care · Gắn kết từ sự quan tâm`;
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f5f2fa;color:#342153;font-family:Arial,sans-serif;line-height:1.65">
<div style="display:none;max-height:0;overflow:hidden">${escape(lead)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 12px" align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:white;border:1px solid #e7e0ef;border-radius:20px;overflow:hidden">
<tr><td style="padding:28px 32px;background:#eee6f8"><span style="font-size:24px;font-weight:800;color:#38175a">PawWorld<span style="color:#9566ae">Care</span></span><div style="font-size:12px;letter-spacing:2px;margin-top:6px">GẮN KẾT TỪ SỰ QUAN TÂM</div></td></tr>
<tr><td style="padding:32px"><span style="display:inline-block;padding:6px 12px;border-radius:20px;background:${approved ? '#e4f3eb' : '#fff2bd'};font-size:12px;font-weight:bold">HỒ SƠ PET SITTER</span>
<h1 style="font-size:26px;line-height:1.35;margin:20px 0 12px">${escape(title)}</h1><p>Chào bạn,</p><p style="font-weight:bold">${escape(lead)}</p>
<p style="color:#645571">${escape(message)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;width:100%"><tr><td align="center" style="background:#ffcf38;border-radius:12px"><a href="${escape(actionUrl)}" style="display:block;padding:15px 18px;color:#342153;text-decoration:none;font-weight:bold">${escape(action)} →</a></td></tr></table>
<p style="font-size:13px;color:#786987">Bạn có thể xem tiến trình tại <a href="${escape(statusUrl)}" style="color:#59327d">trang theo dõi hồ sơ</a>. Trạng thái mới nhất trên hệ thống là thông tin hiện hành.</p>
<div style="border-top:1px solid #eee7f4;padding-top:20px;font-size:12px;color:#786987">Giấy tờ và ghi chú nội bộ không được gửi kèm email. Cần hỗ trợ? <a href="${escape(origin.origin + '/contact')}" style="color:#59327d">Liên hệ PawWorld</a>.</div>
</td></tr><tr><td style="padding:20px 32px;background:#faf8fd;font-size:12px;color:#8a7b99">PawWorld Care · Mỗi lượt chăm sóc, một vòng tay an tâm.</td></tr></table>
</td></tr></table></body></html>`;
  return { to: command.to, operationId: command.operationId.toLowerCase(), expiry: Infinity,
    subject: `PawWorld Care — ${title}`, text, html };
}
