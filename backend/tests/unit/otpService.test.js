const test = require('node:test');
const assert = require('node:assert/strict');
const { createOtpService, isValidGmail } = require('../../src/services/otpService');

test('accepts only gmail addresses', () => {
  assert.equal(isValidGmail('user@gmail.com'), true);
  assert.equal(isValidGmail('user@example.com'), false);
});

test('rejects an OTP after five wrong attempts and accepts the sent OTP', async () => {
  let sentOtp;
  const service = createOtpService({ sendEmail: async (_email, otp) => { sentOtp = otp; }, secret: 'test-secret' });
  await service.issue('user@gmail.com');

  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.throws(() => service.verify('user@gmail.com', '000000'), { code: 'OTP_INVALID' });
  }
  assert.throws(() => service.verify('user@gmail.com', '000000'), { code: 'OTP_ATTEMPTS_EXHAUSTED' });
  assert.equal(service.size(), 0);

  await service.issue('user@gmail.com');
  assert.deepEqual(service.verify('user@gmail.com', sentOtp), { verified: true });
});
