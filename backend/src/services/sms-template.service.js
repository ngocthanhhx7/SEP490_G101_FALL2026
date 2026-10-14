const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSES = new Set(['REGISTER', 'LOGIN', 'CONTACT_CHANGE']);

export function normalizeVietnamPhone(value) {
  if (typeof value !== 'string' || value.length > 32) return null;
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+?[0-9]+$/.test(compact)) return null;

  let national;
  if (/^0[35789]\d{8}$/.test(compact)) national = compact.slice(1);
  else if (/^\+84[35789]\d{8}$/.test(compact)) national = compact.slice(3);
  else if (/^84[35789]\d{8}$/.test(compact)) national = compact.slice(2);
  else return null;
  return `+84${national}`;
}

// Private P06 command only. This adapter sends OTPs; P06 owns generation and verification.
export function renderSms(command, now) {
  if (!command || command.channel !== 'SMS' || command.kind !== 'OTP'
    || typeof command.operationId !== 'string' || !UUID.test(command.operationId)
    || typeof command.code !== 'string' || !/^\d{6}$/.test(command.code)
    || !PURPOSES.has(command.purpose)) return { error: 'INVALID_REQUEST' };

  const to = normalizeVietnamPhone(command.to);
  if (!to) return { error: 'INVALID_PHONE' };

  const expiry = typeof command.expiresAt === 'string' ? Date.parse(command.expiresAt) : NaN;
  if (!Number.isFinite(expiry) || expiry <= now) return { error: 'EXPIRED' };
  if (expiry - now > 300000) return { error: 'INVALID_REQUEST' };

  // ASCII text stays in the GSM-7 alphabet and avoids the higher Unicode SMS segment cost.
  return {
    to,
    operationId: command.operationId.toLowerCase(),
    purpose: command.purpose,
    expiry,
    content: `Paw World Care code: ${command.code} (${command.purpose}). Expires in ${Math.ceil((expiry - now) / 60000)} minutes. Never share it.`
  };
}
