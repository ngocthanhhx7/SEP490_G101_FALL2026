import { createHmac } from 'node:crypto';
import { test, expect, jest } from '@jest/globals';
import { createOtpService } from '../../../src/services/otp-verification.service.js';

// OTP-02: chỉ test verify. Mỗi UTCID bên dưới khớp một cột trong OTP-02_verify.
// Theo UC-01/02/04/05, GBR-04/05/06/07/27 và mô tả màn hình OTP trong SRS.
// Transaction/model/REGISTER/session đều giả; không gọi begin hoặc gửi OTP thật.
const NOW = Date.parse('2026-11-10T03:00:00Z');
const CHALLENGE_ID = '10000000-0000-4000-8000-000000000002';
const USER_ID = '200000000000000000000001';
const OTHER_USER_ID = '200000000000000000000002';
const OLD_CONTACT_ID = '300000000000000000000001';
const NEW_CONTACT_ID = '300000000000000000000002';
const OTP = '004201';
const SECRET = 'synthetic-verify-unit-secret-'.repeat(2);
const ACTOR = { sessionId: 'synthetic-owner-session', userId: USER_ID };

function lookupKey(channel, value) {
  if (value === 'otp-owner@example.test') return 'synthetic-email-lookup';
  if (value === '+84912345678') return 'synthetic-phone-lookup';
  return `synthetic-other-${channel}`;
}

function query(read) {
  const q = { select: jest.fn(), session: jest.fn(), lean: jest.fn(async () => read()) };
  q.select.mockReturnValue(q);
  q.session.mockReturnValue(q);
  return q;
}

function createFixture({ purpose = 'LOGIN', channel = 'EMAIL' } = {}) {
  const contact = channel === 'EMAIL' ? 'otp-owner@example.test' : '+84912345678';
  const contactLookup = lookupKey(channel, contact);
  const mongoSession = { id: 'synthetic-verify-transaction' };
  const state = {
    throttle: null,
    user: { _id: USER_ID, state: 'ACTIVE', authEpoch: 0, synthetic: false, roles: ['CUSTOMER'] },
    linkedContact: purpose === 'LOGIN' ? { userId: USER_ID } : null,
    previousContacts: [], createdContacts: [],
    challenge: { _id: '400000000000000000000001', challengeId: CHALLENGE_ID, contactLookup, purpose,
      codeDigest: createHmac('sha256', SECRET).update(`otp\0${CHALLENGE_ID}\0${contactLookup}\0${purpose}\0${OTP}`).digest('hex'),
      expiresAt: new Date(NOW + 300000), usedAt: null, invalidationReason: null,
      requesterSessionId: purpose === 'CONTACT_CHANGE' ? ACTOR.sessionId : null,
      requesterUserId: purpose === 'CONTACT_CHANGE' ? USER_ID : null },
  };
  const OtpThrottle = {
    findOne: jest.fn(() => query(() => state.throttle)),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const OtpChallenge = {
    // Tôn trọng liên hệ và luồng trong truy vấn; không trả fixture của người khác.
    findOne: jest.fn(filter => query(() => {
      const c = state.challenge;
      return c && c.challengeId === filter.challengeId && c.contactLookup === filter.contactLookup
        && c.purpose === filter.purpose ? c : null;
    })),
    updateOne: jest.fn(async (filter, update) => {
      if (filter.usedAt === null && state.challenge.usedAt !== null) return { modifiedCount: 0 };
      Object.assign(state.challenge, update.$set);
      return { modifiedCount: 1 };
    }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const Contact = {
    findOne: jest.fn(() => query(() => state.linkedContact)),
    find: jest.fn(() => query(() => state.previousContacts)),
    updateMany: jest.fn(async (_filter, update) => {
      state.previousContacts.forEach(c => Object.assign(c, update.$set));
      return { modifiedCount: state.previousContacts.length };
    }),
    create: jest.fn(async ([data]) => {
      const contactRecord = { _id: NEW_CONTACT_ID, ...data };
      state.createdContacts.push(contactRecord);
      return [contactRecord];
    }),
  };
  const AuthSession = { findOne: jest.fn(() => query(() => ({ authEpochAtIssue: 0 }))) };
  const User = {
    create: jest.fn(),
    findById: jest.fn(() => ({ session: jest.fn(async () => state.user) })),
    findOne: jest.fn(() => query(() => state.user)),
  };
  const issuedSession = { sessionId: 'synthetic-issued-session' };
  const sessionService = { issueInTransaction: jest.fn().mockResolvedValue(issuedSession) };
  const register = jest.fn().mockResolvedValue({ session: issuedSession });
  const delivery = { send: jest.fn() };
  const connection = {
    collection: jest.fn(() => ({ insertOne: jest.fn().mockResolvedValue({ acknowledged: true }) })),
    transaction: jest.fn(async work => work(mongoSession)),
  };
  const contactCrypto = {
    lookup: jest.fn((c, canonicalValue) => ({ canonicalValue, lookupKey: lookupKey(c, canonicalValue) })),
    encrypt: jest.fn(() => 'synthetic-contact-ciphertext'),
  };
  const { verify } = createOtpService({ connection, User,
    models: { OtpThrottle, OtpChallenge, Contact, AuthSession }, contactDelivery: delivery,
    sessionService, contactCrypto, otpSecret: SECRET, clock: () => NOW,
    verificationHandlers: { REGISTER: register },
  });
  const input = { challengeId: CHALLENGE_ID, channel, contact, purpose, code: OTP,
    displayName: 'Nguyễn Văn An', policyVersions: { terms: 'unit-terms-v1', privacy: 'unit-privacy-v1' },
    ...(purpose === 'CONTACT_CHANGE' ? { actor: { ...ACTOR } } : {}) };
  return { verify, input, state, OtpThrottle, OtpChallenge, Contact, User, sessionService,
    issuedSession, register, delivery, contactCrypto };
}

function expectNoConfirmation(f) {
  expect(f.register).not.toHaveBeenCalled();
  expect(f.User.create).not.toHaveBeenCalled();
  expect(f.Contact.create).not.toHaveBeenCalled();
  expect(f.Contact.updateMany).not.toHaveBeenCalled();
  expect(f.sessionService.issueInTransaction).not.toHaveBeenCalled();
  expect(f.delivery.send).not.toHaveBeenCalled();
}

function expectConsumed(f) {
  expect(f.OtpChallenge.updateOne).toHaveBeenCalledWith(
    { _id: f.state.challenge._id, usedAt: null },
    { $set: { usedAt: new Date(NOW) } }, expect.anything(),
  );
}

async function expectLogin(f) {
  const result = await f.verify(f.input);
  expect(result).toEqual({ status: 'VERIFIED', authenticated: true, session: f.issuedSession });
  expectConsumed(f);
  expect(f.sessionService.issueInTransaction).toHaveBeenCalledTimes(1);
  expect(f.sessionService.issueInTransaction.mock.calls[0][0]).toBe(f.state.user);
  expect(f.register).not.toHaveBeenCalled();
  expect(f.Contact.create).not.toHaveBeenCalled();
  expect(f.delivery.send).not.toHaveBeenCalled();
}

async function expectRegistrationVerified(f) {
  const result = await f.verify(f.input);
  expect(result).toEqual({ status: 'VERIFIED', authenticated: true, session: f.issuedSession });
  expectConsumed(f);
  expect(f.register).toHaveBeenCalledTimes(1);
  expect(f.register).toHaveBeenCalledWith(expect.objectContaining({
    channel: f.input.channel, canonicalValue: f.input.contact, displayName: f.input.displayName,
  }));
  // Tạo Customer thực tế do registerVerifiedCustomer đảm nhiệm, đã có file test riêng.
  expect(f.sessionService.issueInTransaction).not.toHaveBeenCalled();
  expect(f.delivery.send).not.toHaveBeenCalled();
}

async function expectContactConfirmed(f, replacing) {
  const result = await f.verify(f.input);
  expect(result).toEqual({ status: 'VERIFIED', authenticated: false });
  expectConsumed(f);
  expect(f.Contact.create).toHaveBeenCalledTimes(1);
  expect(f.state.createdContacts).toEqual([expect.objectContaining({
    userId: USER_ID, channel: f.input.channel, state: 'VERIFIED', verifiedAt: new Date(NOW),
    lookupKey: lookupKey(f.input.channel, f.input.contact), canonicalCiphertext: 'synthetic-contact-ciphertext',
  })]);
  expect(f.contactCrypto.encrypt).toHaveBeenCalledWith(f.input.contact);
  if (replacing) expect(f.state.previousContacts[0].state).toBe('REPLACED');
  else expect(f.state.previousContacts).toHaveLength(0);
  expect(f.register).not.toHaveBeenCalled();
  expect(f.sessionService.issueInTransaction).not.toHaveBeenCalled();
  expect(f.delivery.send).not.toHaveBeenCalled();
}

async function expectRejected(f, code, status) {
  const messages = {
    VALIDATION_FAILED: 'OTP verification request is invalid',
    UNAUTHENTICATED: 'Authentication required',
    OTP_RATE_LIMITED: 'Please wait before requesting or entering another code',
    CONTACT_UNAVAILABLE: 'Contact verification could not be completed',
    ACCOUNT_LOCKED: 'Account is locked; contact support',
  };
  await expect(f.verify(f.input)).rejects.toMatchObject({
    name: 'AppError', status, code, message: messages[code] ?? 'Verification could not be completed',
  });
  expectNoConfirmation(f);
}

function expectWrongCount(f, count, locked) {
  expect(f.OtpThrottle.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    $set: expect.objectContaining({ failedCount: count, lockedUntil: locked ? new Date(NOW + 900000) : null }),
  }), expect.anything());
  if (locked) {
    expect(f.OtpChallenge.updateMany).toHaveBeenCalledWith(expect.anything(),
      { $set: { usedAt: new Date(NOW), invalidationReason: 'LOCKED' } }, expect.anything());
  } else expect(f.OtpChallenge.updateMany).not.toHaveBeenCalled();
}

function expectExpired(f) {
  expect(f.OtpChallenge.updateOne).toHaveBeenCalledWith(expect.anything(),
    { $set: { usedAt: new Date(NOW), invalidationReason: 'EXPIRED' } }, expect.anything());
}

// SRS: UC-02 Normal Flow 3–4; UC-05 Normal Flow 3–5; GBR-27.
test("OTP-02-UTCID01 [N] Đúng OTP email: xác minh và cấp session đăng nhập", async () => {
  const f = createFixture();

  await expectLogin(f);
});

// SRS: UC-02 Normal Flow 3–4; UC-05 Normal Flow 1, 3–5.
test("OTP-02-UTCID02 [N] Đúng OTP SMS: xác minh số điện thoại và cấp session", async () => {
  const f = createFixture({ channel: 'PHONE' });

  await expectLogin(f);
});

// SRS: UC-01 Normal Flow 5–6; UC-05 Normal Flow 4–5; GBR-27.
test("OTP-02-UTCID03 [N] Đúng OTP đăng ký email: gọi handler đăng ký và trả session", async () => {
  const f = createFixture({ purpose: 'REGISTER' });

  await expectRegistrationVerified(f);
});

// SRS: UC-01 Normal Flow 5–6; UC-05 Normal Flow 1, 4–5; GBR-27.
test("OTP-02-UTCID04 [N] Đúng OTP đăng ký số điện thoại: gọi handler đăng ký và trả session", async () => {
  const f = createFixture({ purpose: 'REGISTER', channel: 'PHONE' });

  await expectRegistrationVerified(f);
});

// SRS: UC-04 Alternative 1.1; Normal Flow 5–6; GBR-06.
test("OTP-02-UTCID05 [N] Đúng OTP: thêm email còn thiếu cho người đang đăng nhập", async () => {
  const f = createFixture({ purpose: 'CONTACT_CHANGE' });

  await expectContactConfirmed(f, false);
});

// SRS: UC-04 Normal Flow 5–6 / Postconditions; GBR-06.
test("OTP-02-UTCID06 [N] Đúng OTP: thay số điện thoại và đánh dấu liên hệ cũ đã thay thế", async () => {
  const f = createFixture({ purpose: 'CONTACT_CHANGE', channel: 'PHONE' });
  f.state.previousContacts.push({ _id: OLD_CONTACT_ID, state: 'VERIFIED' });

  await expectContactConfirmed(f, true);
});

// SRS: UC-05 Alternative 4; GBR-07; MSG07.
test("OTP-02-UTCID07 [A] Nhập sai lần đầu: không xác minh, ghi nhận 1 lần sai, chưa khóa", async () => {
  const f = createFixture();
  f.input.code = '009999';

  await expectRejected(f, 'OTP_INCORRECT', 400);
  expectWrongCount(f, 1, false);
});

// SRS: UC-05 Alternative 4; GBR-07; MSG07/09.
test("OTP-02-UTCID08 [B] Nhập sai lần thứ 4: chưa chạm ngưỡng khóa 5 lần", async () => {
  const f = createFixture();
  f.state.throttle = { failedCount: 3 };
  f.input.code = '009999';

  await expectRejected(f, 'OTP_INCORRECT', 400);
  expectWrongCount(f, 4, false);
});

// SRS: UC-05 Alternative 4; GBR-07; MSG09.
test("OTP-02-UTCID09 [B] Nhập sai lần thứ 5: khóa liên hệ đúng 15 phút", async () => {
  const f = createFixture();
  f.state.throttle = { failedCount: 4 };
  f.input.code = '009999';

  await expectRejected(f, 'OTP_INCORRECT', 400);
  expectWrongCount(f, 5, true);
});

// SRS: UC-05 Preconditions / Alternative 4; GBR-07; MSG09.
test("OTP-02-UTCID10 [B] Còn 1 ms mới hết khóa 15 phút: không cho xác minh", async () => {
  const f = createFixture();
  f.state.throttle = { failedCount: 5, lockedUntil: new Date(NOW + 1) };

  await expectRejected(f, 'OTP_RATE_LIMITED', 429);
  expect(f.OtpChallenge.updateOne).not.toHaveBeenCalled();
});

// SRS: UC-05 Preconditions / Alternative 4; GBR-07.
test("OTP-02-UTCID11 [B] Đúng thời điểm hết khóa 15 phút: chấp nhận OTP mới còn hạn", async () => {
  const f = createFixture();
  f.state.throttle = { failedCount: 5, lockedUntil: new Date(NOW) };

  await expectLogin(f);
  expect(f.OtpThrottle.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    $set: expect.objectContaining({ failedCount: 0, lockedUntil: null }),
  }), expect.anything());
});

// SRS: UC-05 Normal Flow 1, 4; GBR-07.
test("OTP-02-UTCID12 [B] OTP còn 1 ms trước hạn 5 phút: vẫn xác minh được", async () => {
  const f = createFixture();
  f.state.challenge.expiresAt = new Date(NOW + 1);

  await expectLogin(f);
});

// SRS: UC-05 Alternative 4; GBR-07; MSG08.
test("OTP-02-UTCID13 [B] OTP đúng mốc 5 phút: hết hạn và không đăng nhập", async () => {
  const f = createFixture();
  f.state.challenge.expiresAt = new Date(NOW);

  await expectRejected(f, 'OTP_EXPIRED', 400);
  expectExpired(f);
});

// SRS: UC-05 Alternative 4; GBR-07; MSG08.
test("OTP-02-UTCID14 [B] OTP quá hạn 5 phút 1 ms: không xác minh", async () => {
  const f = createFixture();
  f.state.challenge.expiresAt = new Date(NOW - 1);

  await expectRejected(f, 'OTP_EXPIRED', 400);
  expectExpired(f);
});

// SRS: UC-05 Alternative 2.1 / 4; GBR-07; MSG08.
test("OTP-02-UTCID15 [A] Đã gửi lại mã: mã cũ không còn được chấp nhận", async () => {
  const f = createFixture();
  f.state.challenge.usedAt = new Date(NOW - 1000);
  f.state.challenge.invalidationReason = 'RESENT';

  await expectRejected(f, 'OTP_REPLACED', 400);
});

// SRS: SRS Glossary OTP (one-time password); UC-05 / GBR-07.
test("OTP-02-UTCID16 [A] OTP đã dùng thành công không được dùng lần nữa", async () => {
  const f = createFixture();
  f.state.challenge.usedAt = new Date(NOW - 1000);

  await expectRejected(f, 'OTP_ALREADY_USED', 400);
});

// SRS: SRS III.1.2.2 OTP Verification — Code (required); MSG01.
test("OTP-02-UTCID17 [A] Chưa nhập mã: từ chối trường bắt buộc", async () => {
  const f = createFixture();
  f.input.code = '';

  await expectRejected(f, 'VALIDATION_FAILED', 422);
});

// SRS: SRS III.1.2.2 OTP Verification — Code / Confirm; GBR-07.
test("OTP-02-UTCID18 [B] Mã chỉ có 5 chữ số: chưa đủ 6 chữ số", async () => {
  const f = createFixture();
  f.input.code = '00420';

  await expectRejected(f, 'VALIDATION_FAILED', 422);
});

// SRS: SRS III.1.2.2 OTP Verification — Code / Confirm; GBR-07.
test("OTP-02-UTCID19 [B] Mã có 7 chữ số: vượt độ dài 6 chữ số", async () => {
  const f = createFixture();
  f.input.code = '0042011';

  await expectRejected(f, 'VALIDATION_FAILED', 422);
});

// SRS: SRS III.1.2.2 OTP Verification — Code (digits only); GBR-07.
test("OTP-02-UTCID20 [A] Mã có chữ cái: từ chối vì mã chỉ gồm chữ số", async () => {
  const f = createFixture();
  f.input.code = '00420A';

  await expectRejected(f, 'VALIDATION_FAILED', 422);
});

// SRS: UC-04 Preconditions; GBR-01/06.
test("OTP-02-UTCID21 [A] Chưa đăng nhập: không được xác minh thay đổi liên hệ", async () => {
  const f = createFixture({ purpose: 'CONTACT_CHANGE' });
  delete f.input.actor;

  await expectRejected(f, 'UNAUTHENTICATED', 401);
});

// SRS: UC-04 Alternative 4; GBR-05/06; MSG05.
test("OTP-02-UTCID22 [A] Liên hệ mới đã thuộc người khác: không lưu dù OTP đúng", async () => {
  const f = createFixture({ purpose: 'CONTACT_CHANGE' });
  f.state.linkedContact = { userId: OTHER_USER_ID };

  await expectRejected(f, 'CONTACT_UNAVAILABLE', 409);
});

// SRS: UC-01 Alternative 5.1; UC-05 Alternative 4; MSG07.
test("OTP-02-UTCID23 [A] Đăng ký với OTP sai: không gọi handler tạo tài khoản", async () => {
  const f = createFixture({ purpose: 'REGISTER' });
  f.input.code = '009999';

  await expectRejected(f, 'OTP_INCORRECT', 400);
  expectWrongCount(f, 1, false);
});

// SRS: UC-04 Normal Flow 5–6; GBR-06; UC-05 Alternative 4.
test("OTP-02-UTCID24 [A] Đổi liên hệ với OTP sai: giữ liên hệ cũ", async () => {
  const f = createFixture({ purpose: 'CONTACT_CHANGE' });
  f.state.previousContacts.push({ _id: OLD_CONTACT_ID, state: 'VERIFIED' });
  f.input.code = '009999';

  await expectRejected(f, 'OTP_INCORRECT', 400);
  expectWrongCount(f, 1, false);
  expect(f.state.previousContacts[0].state).toBe('VERIFIED');
});

// SRS: UC-01 Alternative 5.1; UC-05 Alternative 4; MSG08.
test("OTP-02-UTCID25 [A] Đăng ký với OTP hết hạn: không tạo tài khoản", async () => {
  const f = createFixture({ purpose: 'REGISTER' });
  f.state.challenge.expiresAt = new Date(NOW);

  await expectRejected(f, 'OTP_EXPIRED', 400);
  expectExpired(f);
});

// SRS: UC-04 Normal Flow 5–6; GBR-06; UC-05 Alternative 4; MSG08.
test("OTP-02-UTCID26 [A] Đổi liên hệ với OTP hết hạn: giữ liên hệ cũ", async () => {
  const f = createFixture({ purpose: 'CONTACT_CHANGE' });
  f.state.previousContacts.push({ _id: OLD_CONTACT_ID, state: 'VERIFIED' });
  f.state.challenge.expiresAt = new Date(NOW);

  await expectRejected(f, 'OTP_EXPIRED', 400);
  expectExpired(f);
  expect(f.state.previousContacts[0].state).toBe('VERIFIED');
});

// SRS: UC-02 Alternative 2.1; GBR-04; MSG17.
test("OTP-02-UTCID27 [A] Tài khoản bị khóa: OTP đúng vẫn không cấp session", async () => {
  const f = createFixture();
  f.state.user.state = 'LOCKED';

  await expectRejected(f, 'ACCOUNT_LOCKED', 403);
});

// SRS: UC-05 Description / Normal Flow 1, 4; GBR-27.
test("OTP-02-UTCID28 [A] Mã gửi đến liên hệ khác không xác minh được liên hệ đang nhập", async () => {
  const f = createFixture();
  f.input.contact = 'another-owner@example.test';

  await expectRejected(f, 'OTP_INVALID_OR_EXPIRED', 400);
});
