import { test, expect, jest } from '@jest/globals';
import { createOtpService } from '../../../src/services/otp-verification.service.js';
import { AppError } from '../../../src/utils/app-error.js';

// OTP-01: đúng 24 UTCID SRS-only trong sheet OTP-01_begin.
// Chỉ test begin; không gọi verify hoặc service đăng ký thật.
// SRS: UC-01/04/05, GBR-05/06/07/27, MSG01/02/04/05/06/08/09/10.
const NOW = Date.parse('2026-11-09T03:00:00Z');
const CHALLENGE_ID = '10000000-0000-4000-8000-000000000001';
const LOOKUP_KEY = 'synthetic-srs-contact';
const ACTOR = Object.freeze({ sessionId: 'synthetic-srs-session', userId: '200000000000000000000001' });

function createFixture() {
  const mongoSession = { id: 'synthetic-srs-transaction' };
  const throttleQuery = { select: jest.fn(), session: jest.fn(), lean: jest.fn().mockResolvedValue(null) };
  throttleQuery.select.mockReturnValue(throttleQuery);
  throttleQuery.session.mockReturnValue(throttleQuery);
  const contactQuery = { session: jest.fn(), lean: jest.fn().mockResolvedValue(null) };
  contactQuery.session.mockReturnValue(contactQuery);
  const Contact = { exists: jest.fn().mockResolvedValue(false), findOne: jest.fn(() => contactQuery), create: jest.fn() };
  const OtpThrottle = { findOne: jest.fn(() => throttleQuery), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
  const OtpChallenge = { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }), create: jest.fn().mockResolvedValue([]), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
  const User = { create: jest.fn(), findById: jest.fn() };
  const sessionService = { issueInTransaction: jest.fn() };
  const register = jest.fn();
  const delivery = { send: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }) };
  const connection = { collection: jest.fn(() => ({ insertOne: jest.fn() })), transaction: jest.fn(async work => work(mongoSession)) };
  const { begin } = createOtpService({
    connection, User, models: { Contact, OtpThrottle, OtpChallenge }, contactDelivery: delivery,
    sessionService, contactCrypto: { lookup: jest.fn((_channel, canonicalValue) => ({ canonicalValue, lookupKey: LOOKUP_KEY })), encrypt: jest.fn() },
    otpSecret: 'synthetic-srs-only-secret-'.repeat(2), clock: () => NOW,
    createId: () => CHALLENGE_ID, createCode: () => '004201', verificationHandlers: { REGISTER: register }, logger: () => {},
  });
  const input = { channel: 'EMAIL', contact: 'otp-customer@example.test', purpose: 'LOGIN' };
  return { begin, input, mongoSession, throttleQuery, contactQuery, Contact, OtpThrottle, OtpChallenge, User, sessionService, register, delivery };
}

function expectNoAccountCreated(f) {
  expect(f.User.create).not.toHaveBeenCalled();
  expect(f.Contact.create).not.toHaveBeenCalled();
  expect(f.sessionService.issueInTransaction).not.toHaveBeenCalled();
  expect(f.register).not.toHaveBeenCalled();
}

function expectNoCodeSent(f) {
  expect(f.delivery.send).not.toHaveBeenCalled();
  expect(f.OtpChallenge.create).not.toHaveBeenCalled();
  expect(f.OtpChallenge.updateMany).not.toHaveBeenCalled();
  expect(f.OtpThrottle.updateOne).not.toHaveBeenCalled();
  expectNoAccountCreated(f);
}

async function expectCodeSent(f, input) {
  const result = await f.begin(input);
  expect(result).toMatchObject({ expiresInSeconds: 300, resendAfterSeconds: 60 });
  expect(f.delivery.send).toHaveBeenCalledTimes(1);
  const sent = f.delivery.send.mock.calls[0][0];
  expect(sent).toMatchObject({ channel: input.channel,
    to: input.channel === 'PHONE' ? '+84912345678' : 'otp-customer@example.test', purpose: input.purpose });
  expect(sent.code).toMatch(/^\d{6}$/);
  expect(sent.expiresAt).toBe(new Date(NOW + 5 * 60 * 1000).toISOString());
  expect(f.OtpChallenge.create).toHaveBeenCalledWith([expect.objectContaining({
    expiresAt: new Date(NOW + 5 * 60 * 1000), resendAt: new Date(NOW + 60 * 1000), usedAt: null,
  })], { session: f.mongoSession });
  expect(f.OtpChallenge.updateMany).toHaveBeenCalledWith({ contactLookup: LOOKUP_KEY, purpose: input.purpose, usedAt: null },
    { $set: { usedAt: new Date(NOW), invalidationReason: 'RESENT' } }, { session: f.mongoSession });
  expect(f.OtpChallenge.updateOne).not.toHaveBeenCalled();
  expectNoAccountCreated(f);
}

async function expectDeliveryFailure(f, input) {
  // SRS không quy định return/throw hoặc HTTP status ở service khi provider lỗi.
  const result = await f.begin(input).catch(() => undefined);
  expect(f.delivery.send).toHaveBeenCalledTimes(1);
  const sent = f.delivery.send.mock.calls[0][0];
  expect(sent).toMatchObject({ channel: input.channel, to: input.channel === 'PHONE' ? '+84912345678' : 'otp-customer@example.test' });
  expect(sent.code).toMatch(/^\d{6}$/);
  expect(sent.expiresAt).toBe(new Date(NOW + 5 * 60 * 1000).toISOString());
  expect(f.OtpChallenge.create).toHaveBeenCalledWith([expect.objectContaining({
    expiresAt: new Date(NOW + 5 * 60 * 1000), resendAt: new Date(NOW + 60 * 1000), usedAt: null,
  })], { session: f.mongoSession });
  expect(f.OtpChallenge.updateOne).toHaveBeenCalledWith({ challengeId: CHALLENGE_ID, usedAt: null },
    { $set: { usedAt: new Date(NOW), invalidationReason: 'DELIVERY_FAILED' } });
  expect(result?.authenticated).not.toBe(true);
  expect(result?.verified).not.toBe(true);
  expectNoAccountCreated(f);
}

// SRS: UC-05 Normal Flow 1; GBR-07.

test("OTP-01-UTCID01 [N] Gửi OTP qua email để đăng nhập", async () => {
  const f = createFixture();

  await expectCodeSent(f, f.input);
});

// SRS: UC-01 bước 5–6 / Alternative 5.1; GBR-27.

test("OTP-01-UTCID02 [N] Gửi OTP để đăng ký: chưa tạo tài khoản khi chưa xác minh", async () => {
  const f = createFixture();
  Object.assign(f.input, { purpose: "REGISTER" });

  await expectCodeSent(f, f.input);
});

// SRS: UC-05 Normal Flow 1; SRS III.1.1.1 Phone number.
// Số SRS 0912345678 đã chuẩn hóa thành +84912345678 trước khi vào service; không test bước chuyển đổi.

test("OTP-01-UTCID03 [N] Gửi OTP qua SMS đến số điện thoại hợp lệ đã chuẩn hóa ở boundary", async () => {
  const f = createFixture();
  Object.assign(f.input, { channel: "PHONE", contact: "+84912345678" });

  await expectCodeSent(f, f.input);
});

// SRS: SRS III.1.1.1 Email address.

test("OTP-01-UTCID04 [N] Chuẩn hóa email có chữ hoa và khoảng trắng", async () => {
  const f = createFixture();
  Object.assign(f.input, { contact: "  Otp-Customer@Example.Test  " });

  await expectCodeSent(f, f.input);
});

// SRS: UC-04 Normal Flow 3–5; GBR-05/06.

test("OTP-01-UTCID05 [N] Người dùng đã đăng nhập yêu cầu đổi sang liên hệ mới chưa ai dùng", async () => {
  const f = createFixture();
  f.input.actor = ACTOR;
  Object.assign(f.input, { purpose: "CONTACT_CHANGE" });

  await expectCodeSent(f, f.input);
});

// SRS: UC-04 Preconditions.

test("OTP-01-UTCID06 [A] Chưa đăng nhập không được yêu cầu đổi liên hệ", async () => {
  const f = createFixture();
  Object.assign(f.input, { purpose: "CONTACT_CHANGE" });

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-04 Alternative 4; GBR-05; MSG05.

test("OTP-01-UTCID07 [A] Liên hệ mới thuộc tài khoản khác: không gửi mã", async () => {
  const f = createFixture();
  f.input.actor = ACTOR;
  Object.assign(f.input, { purpose: "CONTACT_CHANGE" });
  f.Contact.exists.mockResolvedValue(true);

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-04 Alternative 4; MSG04.
// Sheet ghi DEF_OTP_SRS_01: phải chặn liên hệ trùng giá trị hiện tại theo MSG04.

test("OTP-01-UTCID08 [A] Liên hệ nhập lại chính là liên hệ hiện tại: không gửi mã", async () => {
  const f = createFixture();
  f.input.actor = ACTOR;
  Object.assign(f.input, { purpose: "CONTACT_CHANGE" });
  const currentContact = { userId: ACTOR.userId, channel: f.input.channel, lookupKey: LOOKUP_KEY, state: 'VERIFIED' };
  f.contactQuery.lean.mockResolvedValue(currentContact);
  // exists() được hỏi contact của người khác: contact của chính actor không khớp $ne.
  f.Contact.exists.mockImplementation(async filter =>
    currentContact.channel === filter.channel && currentContact.lookupKey === filter.lookupKey
    && currentContact.userId !== String(filter.userId.$ne));

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-01 Alternative 4; MSG01.

test("OTP-01-UTCID09 [A] Email bắt buộc bị để trống: không gửi mã", async () => {
  const f = createFixture();
  Object.assign(f.input, { contact: "" });

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-01 Alternative 4; MSG02.

test("OTP-01-UTCID10 [A] Email sai định dạng: không gửi mã", async () => {
  const f = createFixture();
  Object.assign(f.input, { contact: "not-an-email" });

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-05 Alternative 2.1; GBR-07.

test("OTP-01-UTCID11 [B] Chưa đủ 60 giây (59.999 ms): không gửi lại", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    lastSentAt: new Date(NOW - 59999),
  });

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-05 Alternative 2.1; GBR-07; MSG08.

test("OTP-01-UTCID12 [B] Đúng 60 giây: gửi mã mới và vô hiệu mã cũ", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    lastSentAt: new Date(NOW - 60000),
  });

  await expectCodeSent(f, f.input);
});

// SRS: UC-05 Alternative 2.1; GBR-07.

test("OTP-01-UTCID13 [B] Sau 60 giây (60.001 ms): được gửi lại", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    lastSentAt: new Date(NOW - 60001),
  });

  await expectCodeSent(f, f.input);
});

// SRS: UC-05 Alternative 2.2; GBR-07.

test("OTP-01-UTCID14 [B] Đã có 4 mã trong giờ: cho gửi mã thứ 5", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    sentAt: [new Date(NOW - 600000), new Date(NOW - 480000), new Date(NOW - 360000), new Date(NOW - 120000)],
    lastSentAt: new Date(NOW - 120000),
  });

  await expectCodeSent(f, f.input);
});

// SRS: UC-05 Alternative 2.2; GBR-07; MSG10.

test("OTP-01-UTCID15 [B] Đã có 5 mã trong giờ: từ chối mã thứ 6", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    sentAt: [new Date(NOW - 600000), new Date(NOW - 480000), new Date(NOW - 360000), new Date(NOW - 240000), new Date(NOW - 120000)],
    lastSentAt: new Date(NOW - 120000),
  });

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-05 Alternative 2.2; GBR-07; MSG10.

test("OTP-01-UTCID16 [B] Mã cũ nhất còn trong cửa sổ giờ 1 ms: vẫn đủ 5 mã, phải chặn", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    sentAt: [new Date(NOW - 3599999), new Date(NOW - 480000), new Date(NOW - 360000), new Date(NOW - 240000), new Date(NOW - 120000)],
    lastSentAt: new Date(NOW - 120000),
  });

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-05 Alternative 2.2; GBR-07.

test("OTP-01-UTCID17 [B] Mã cũ nhất đúng 1 giờ: không tính vào 5 mã trong giờ nữa", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    sentAt: [new Date(NOW - 3600000), new Date(NOW - 480000), new Date(NOW - 360000), new Date(NOW - 240000), new Date(NOW - 120000)],
    lastSentAt: new Date(NOW - 120000),
  });

  await expectCodeSent(f, f.input);
});

// SRS: UC-05 Alternative 2.2; GBR-07.

test("OTP-01-UTCID18 [B] Mã cũ nhất đã quá 1 giờ thêm 1 ms: được yêu cầu mã mới", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    sentAt: [new Date(NOW - 3600001), new Date(NOW - 480000), new Date(NOW - 360000), new Date(NOW - 240000), new Date(NOW - 120000)],
    lastSentAt: new Date(NOW - 120000),
  });

  await expectCodeSent(f, f.input);
});

// SRS: UC-05 Preconditions / Alternative 4; GBR-07; MSG09.

test("OTP-01-UTCID19 [B] Khóa do 5 lần sai còn 1 ms mới đủ 15 phút: không gửi", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    lockedUntil: new Date(NOW + 1),
    failedCount: 5,
  });

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});

// SRS: UC-05 Preconditions / Alternative 4; GBR-07.

test("OTP-01-UTCID20 [B] Đủ 15 phút: khóa hết hạn, được gửi mã", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    lockedUntil: new Date(NOW),
    failedCount: 5,
  });

  await expectCodeSent(f, f.input);
});

// SRS: UC-05 Preconditions / Alternative 4; GBR-07.

test("OTP-01-UTCID21 [B] Qua thời điểm hết khóa 1 ms: được gửi mã", async () => {
  const f = createFixture();
  f.throttleQuery.lean.mockResolvedValue({
    lockedUntil: new Date(NOW - 1),
    failedCount: 5,
  });

  await expectCodeSent(f, f.input);
});

// SRS: UC-05 Alternative 1.1 / Postconditions.

test("OTP-01-UTCID22 [A] Email service không trả lời: không có xác minh thành công", async () => {
  const f = createFixture();
  f.delivery.send.mockRejectedValue(new Error('Synthetic provider unavailable'));

  await expectDeliveryFailure(f, f.input);
});

// SRS: UC-05 Alternative 1.1 / Postconditions.

test("OTP-01-UTCID23 [A] SMS gateway không trả lời: không có xác minh thành công", async () => {
  const f = createFixture();
  Object.assign(f.input, { channel: "PHONE", contact: "+84912345678" });
  f.delivery.send.mockRejectedValue(new Error('Synthetic provider unavailable'));

  await expectDeliveryFailure(f, f.input);
});

// SRS: GBR-07: tối đa 5 mã/giờ cho một liên hệ.

test("OTP-01-UTCID24 [A] Cùng liên hệ đã đủ 5 mã: đổi luồng đăng nhập sang đăng ký vẫn bị chặn", async () => {
  const f = createFixture();
  Object.assign(f.input, { purpose: "REGISTER" });
  f.throttleQuery.lean.mockResolvedValue({
    sentAt: [new Date(NOW - 600000), new Date(NOW - 480000), new Date(NOW - 360000), new Date(NOW - 240000), new Date(NOW - 120000)],
    lastSentAt: new Date(NOW - 120000),
  });

  await expect(f.begin(f.input)).rejects.toBeInstanceOf(AppError);
  expectNoCodeSent(f);
});
