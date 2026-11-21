import { otpFeedback } from '../../src/utils/otp-feedback.js';

describe('FE-OTP-01 otpFeedback', () => {
  test.each([
    ['OTP_INCORRECT', 'Mã OTP không đúng. Vui lòng kiểm tra lại mã trong email hoặc SMS mới nhất.'],
    ['OTP_EXPIRED', 'Mã OTP đã hết hạn sau 5 phút. Vui lòng yêu cầu mã mới.'],
    ['OTP_ALREADY_USED', 'Mã OTP này đã được sử dụng. Vui lòng yêu cầu mã mới.'],
    ['OTP_REPLACED', 'Bạn đã yêu cầu mã mới. Vui lòng dùng mã trong email hoặc SMS mới nhất.'],
    ['OTP_INVALID_OR_EXPIRED', 'Không thể xác thực mã này. Vui lòng dùng mã mới nhất hoặc yêu cầu gửi lại.'],
    ['OTP_DELIVERY_UNAVAILABLE', 'Chưa thể gửi mã OTP. Vui lòng thử lại sau.'],
  ])('returns the configured guidance for the %s OTP failure code', (code, expectedMessage) => {
    // Arrange
    const input = code;

    // Act
    const result = otpFeedback(input);

    // Assert
    expect(result).toBe(expectedMessage);
  });

  test.each([
    ['OTP_RATE_LIMITED', 'Vui lòng thử lại sau'],
    ['RATE_LIMITED', 'Vui lòng thử lại sau'],
    ['PROVIDER_UNAVAILABLE', 'Chưa thể gửi mã OTP'],
  ])('returns actionable SRS guidance for %s', (code, expectedMessagePart) => {
    // Arrange
    const input = code;

    // Act
    const result = otpFeedback(input);

    // Assert
    expect(result).toEqual(expect.stringContaining(expectedMessagePart));
  });

  test('returns null for an unrecognized code so the caller can render its fallback', () => {
    // Arrange
    const input = 'UNRECOGNIZED_OTP_ERROR';

    // Act
    const result = otpFeedback(input);

    // Assert
    expect(result).toBeNull();
  });

  test.each([undefined, null, '', 'otp_incorrect', 429, {}])(
    'does not throw and returns null for malformed or boundary input %p',
    input => {
      // Act / Assert
      expect(() => otpFeedback(input)).not.toThrow();
      expect(otpFeedback(input)).toBeNull();
    }
  );
});
