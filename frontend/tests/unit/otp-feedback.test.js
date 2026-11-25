import { otpFeedback } from '../../src/utils/otp-feedback.js';

describe('otpFeedback', () => {
  test('formats MSG07 when remainingAttempts is positive and keeps fallback otherwise', () => {
    expect(otpFeedback({ code: 'OTP_INCORRECT', remainingAttempts: 4 })).toBe('Mã không đúng. Bạn còn 4 lần thử.');
    expect(otpFeedback({ code: 'OTP_INCORRECT', remainingAttempts: 1 })).toBe('Mã không đúng. Bạn còn 1 lần thử.');
    expect(otpFeedback({ code: 'OTP_INCORRECT' })).toBe('Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email hoặc SMS mới nhất.');
    expect(otpFeedback({ code: 'OTP_INCORRECT', remainingAttempts: 0 })).toBe('Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email hoặc SMS mới nhất.');
    expect(otpFeedback('OTP_INCORRECT')).toBe('Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email hoặc SMS mới nhất.');
  });

  test('formats MSG09 and MSG10 in Vietnam time from retryAfterAt or retryAfterSeconds', () => {
    expect(otpFeedback({
      code: 'OTP_RATE_LIMITED',
      reason: 'TOO_MANY_WRONG_CODES',
      retryAfterAt: '2026-11-24T03:15:00.000Z'
    })).toBe('Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 10:15.');

    expect(otpFeedback({
      code: 'RATE_LIMITED',
      reason: 'TOO_MANY_WRONG_CODES',
      retryAfterAt: '2026-11-24T03:15:00.000Z'
    })).toBe('Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 10:15.');

    expect(otpFeedback({
      code: 'OTP_RATE_LIMITED',
      reason: 'HOURLY_LIMIT',
      retryAfterAt: '2026-11-24T17:05:00.000Z'
    })).toBe('Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau 00:05.');

    const baseNow = Date.parse('2026-11-24T02:00:00.000Z'); // 09:00 VN
    expect(otpFeedback({
      code: 'OTP_RATE_LIMITED',
      reason: 'TOO_MANY_WRONG_CODES',
      retryAfterSeconds: 900
    }, { now: baseNow })).toBe('Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 09:15.');
  });

  test('keeps resend cooldown feedback and returns null for unlabelled rate limit', () => {
    expect(otpFeedback({
      code: 'OTP_RATE_LIMITED',
      reason: 'RESEND_COOLDOWN',
      retryAfterSeconds: 45
    })).toBe('Vui lòng chờ 45 giây trước khi yêu cầu mã mới.');
    expect(otpFeedback({ code: 'OTP_RATE_LIMITED' })).toBeNull();
  });
});
