import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOtp,
  generateToken,
  hmacOtp,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhoneVN,
  sha256,
  validateFullName,
  verifyOtpHmac,
} from '../../src/utils/registration.js';
import { AppError } from '../../src/errors/app-error.js';

test('normalizeEmail lowercases without rewriting dot or plus aliases', () => {
  assert.equal(normalizeEmail('A.B+tag@Example.COM'), 'a.b+tag@example.com');
  assert.notEqual(normalizeEmail('a.b@example.com'), normalizeEmail('ab@example.com'));
  assert.notEqual(normalizeEmail('a+tag@example.com'), normalizeEmail('a@example.com'));
});

test('normalizeEmail rejects malformed and non-string input', () => {
  assert.throws(() => normalizeEmail('bad-address'), AppError);
  assert.throws(() => normalizeEmail({ $ne: null }), AppError);
});

test('normalizePhoneVN converts national and E.164 inputs to Vietnam E.164', () => {
  assert.equal(normalizePhoneVN('090 123 4567'), '+84901234567');
  assert.equal(normalizePhoneVN('+84901234567'), '+84901234567');
});

test('normalizePhoneVN rejects invalid or non-Vietnam numbers', () => {
  assert.throws(() => normalizePhoneVN('123'), AppError);
  assert.throws(() => normalizePhoneVN('+14155552671'), AppError);
});

test('validateFullName trims and accepts Unicode letters and combining marks', () => {
  assert.equal(validateFullName('  Nguyễn Văn A  '), 'Nguyễn Văn A');
  assert.equal(validateFullName('A\u0301n'), 'A\u0301n');
  assert.equal(validateFullName("O'Connor-Smith"), "O'Connor-Smith");
});

test('validateFullName rejects empty, oversized, numeric and punctuated names', () => {
  for (const value of ['', ' A ', '12345', 'Name_One', 'x'.repeat(101)]) {
    assert.throws(() => validateFullName(value), AppError);
  }
});

test('generateToken returns an opaque 256-bit bearer token and SHA-256 digest', () => {
  const token = generateToken();
  assert.match(token.raw, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(token.hash, sha256(token.raw));
  assert.notEqual(generateToken().raw, token.raw);
});

test('generateOtp always returns six decimal digits including leading zeroes', () => {
  for (let attempt = 0; attempt < 100; attempt += 1) assert.match(generateOtp(), /^\d{6}$/);
});

test('OTP HMAC is registration-scoped and compared using verifier helper', () => {
  const verifier = hmacOtp('012345', 'registration-a');
  assert.equal(verifyOtpHmac('012345', 'registration-a', verifier), true);
  assert.equal(verifyOtpHmac('012345', 'registration-b', verifier), false);
  assert.equal(verifyOtpHmac('999999', 'registration-a', verifier), false);
});

test('contact masking matches BR-24 examples', () => {
  assert.equal(maskEmail('alice@example.com'), 'a**@example.com');
  assert.equal(maskPhone('+84901234567'), '090****567');
});
