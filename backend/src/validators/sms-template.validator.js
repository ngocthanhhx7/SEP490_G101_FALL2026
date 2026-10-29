// Default matches the enabled testOTP template supplied by the project owner.
export const DEFAULT_SMS_OTP_TEMPLATE = 'Ma xac nhan cua ban la {code}';

export function isSmsOtpTemplate(value) {
  return typeof value === 'string'
    && /^[\x20-\x7e]{1,160}$/.test(value)
    && value.split('{code}').length === 2
    && !/[{}]/.test(value.replace('{code}', ''));
}
