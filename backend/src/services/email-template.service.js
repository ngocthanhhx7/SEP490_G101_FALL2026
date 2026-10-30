import { isMailbox } from '../utils/mailbox.js';
export { isMailbox } from '../utils/mailbox.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSES = new Set(['REGISTER', 'LOGIN', 'CONTACT_CHANGE', 'APPLICATION_STATUS']);

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]
  );
}

// This private server command is not an HTTP DTO. P06 owns OTP generation and purpose binding.
export function renderEmail(command, now) {
  if (
    !command ||
    command.channel !== 'EMAIL' ||
    !isMailbox(command.to) ||
    typeof command.operationId !== 'string' ||
    !UUID.test(command.operationId)
  )
    return { error: 'INVALID_REQUEST' };
  if (command.kind === 'OTP') {
    const expiry =
      typeof command.expiresAt === 'string'
        ? Date.parse(command.expiresAt)
        : NaN;
    if (
      !Number.isFinite(expiry) ||
      typeof command.code !== 'string' ||
      !/^\d{6}$/.test(command.code) ||
      !PURPOSES.has(command.purpose)
    )
      return { error: 'INVALID_REQUEST' };
    if (expiry <= now) return { error: 'EXPIRED' };
    if (expiry - now > 300000) return { error: 'INVALID_REQUEST' };
    const text = `Mã xác thực Paw World Care: ${command.code}\nMục đích: ${command.purpose}\nHết hạn lúc ${new Date(expiry).toISOString()} (UTC).\nKhông chia sẻ mã OTP với bất kỳ ai. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.`;
    return {
      to: command.to,
      operationId: command.operationId.toLowerCase(),
      expiry,
      subject: 'Paw World Care — Mã xác thực',
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`
    };
  }
  if (
    command.kind !== 'SYSTEM' ||
    typeof command.title !== 'string' ||
    command.title.length < 1 ||
    command.title.length > 120 ||
    /[\r\n\x00-\x1f\x7f]/.test(command.title) ||
    typeof command.message !== 'string' ||
    command.message.length < 1 ||
    command.message.length > 4000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(command.message)
  )
    return { error: 'INVALID_REQUEST' };
  return {
    to: command.to,
    operationId: command.operationId.toLowerCase(),
    expiry: Infinity,
    subject: `Paw World Care — ${command.title}`,
    text: command.message,
    html: `<p>${escapeHtml(command.message).replace(/\n/g, '<br>')}</p>`
  };
}
