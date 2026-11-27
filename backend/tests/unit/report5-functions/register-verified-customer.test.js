import { test, expect, jest } from '@jest/globals';
import { createCustomerRegistrationHandler } from '../../../src/services/customer-registration.service.js';

// REG-02: 17 ca, UTCID01–UTCID17 khớp sheet REG-02_registerVerifiedCustomer.
// SRS: UC-01; III.1.1.1 Customer Registration; GBR-05/27; MSG01/05/12.
// Hàm thật chạy với dependency giả. OTP đã được caller xác minh trước khi gọi.
// Policy, crypto, session và clock được dựng cố định; không kiểm thử riêng chúng.
const NOW = Date.parse('2026-11-09T03:00:00Z');
const USER_ID = '200000000000000000000001';

function createFixture() {
  const mongoSession = Object.freeze({ id: 'synthetic-registration-transaction' });
  const receipts = [
    { slug: 'terms', versionId: 'unit-terms-v1', contentHash: 'synthetic-terms-hash' },
    { slug: 'privacy', versionId: 'unit-privacy-v1', contentHash: 'synthetic-privacy-hash' },
  ];
  const issuedSession = { sessionId: 'synthetic-issued-session', user: { id: USER_ID, roles: ['CUSTOMER'] } };
  const query = { session: jest.fn(), lean: jest.fn().mockResolvedValue(null) };
  query.session.mockReturnValue(query);
  const User = { create: jest.fn(async ([data]) => [{ _id: USER_ID, ...data }]) };
  const Contact = { findOne: jest.fn(() => query), create: jest.fn().mockResolvedValue([]) };
  const contactCrypto = { encrypt: jest.fn(() => 'synthetic-ciphertext') };
  const sessionService = { issueInTransaction: jest.fn().mockResolvedValue(issuedSession) };
  const policyService = { validateAndBuildReceipt: jest.fn().mockResolvedValue(receipts) };
  const registerVerifiedCustomer = createCustomerRegistrationHandler({
    User, models: { Contact }, contactCrypto, sessionService,
    registrationPolicyService: policyService, clock: () => NOW,
  });
  const input = {
    channel: 'EMAIL', canonicalValue: 'reg02-customer@example.test', contactLookup: 'synthetic-email-lookup',
    displayName: 'Nguyễn Văn An', policyVersions: { terms: 'unit-terms-v1', privacy: 'unit-privacy-v1' },
    session: mongoSession,
  };
  return { registerVerifiedCustomer, input, issuedSession, query, User, Contact, contactCrypto, sessionService };
}

function expectNoAccountCreated(f) {
  expect(f.User.create).not.toHaveBeenCalled();
  expect(f.Contact.create).not.toHaveBeenCalled();
  expect(f.sessionService.issueInTransaction).not.toHaveBeenCalled();
}

async function expectRegistration(f, expectedName = 'Nguyễn Văn An') {
  const result = await f.registerVerifiedCustomer(f.input);

  // UC-01 bước 6 / GBR-27: Customer ACTIVE, một liên hệ đã xác minh, đăng nhập ngay.
  expect(result).toEqual({ session: f.issuedSession });
  expect(result.session).toBe(f.issuedSession);
  expect(f.User.create).toHaveBeenCalledTimes(1);
  const [users] = f.User.create.mock.calls[0];
  expect(users).toEqual([expect.objectContaining({
    displayName: expectedName, roles: ['CUSTOMER'], state: 'ACTIVE',
  })]);
  expect(users[0]).not.toHaveProperty('password');
  expect(f.Contact.create).toHaveBeenCalledTimes(1);
  const [contacts] = f.Contact.create.mock.calls[0];
  expect(contacts).toEqual([expect.objectContaining({
    userId: USER_ID, channel: f.input.channel, lookupKey: f.input.contactLookup,
    canonicalCiphertext: 'synthetic-ciphertext', state: 'VERIFIED',
  })]);
  expect(f.contactCrypto.encrypt).toHaveBeenCalledWith(f.input.canonicalValue);
  expect(f.sessionService.issueInTransaction).toHaveBeenCalledTimes(1);
  expect(f.sessionService.issueInTransaction.mock.calls[0][0]).toEqual(expect.objectContaining({
    _id: USER_ID, displayName: expectedName, roles: ['CUSTOMER'], state: 'ACTIVE',
  }));
}

async function expectInvalidRegistration(f) {
  // Service trả lỗi này; thông báo MSG01/MSG12 trên UI thuộc lớp gọi hàm.
  await expect(f.registerVerifiedCustomer(f.input)).rejects.toMatchObject({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'Registration details are invalid',
  });
  expectNoAccountCreated(f);
}

async function expectContactAlreadyLinked(f) {
  // GBR-05 / UC-01 Alternative 4: liên hệ đã được sử dụng thì không tạo tài khoản.
  await expect(f.registerVerifiedCustomer(f.input)).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'CONTACT_ALREADY_LINKED',
    message: 'Contact verification could not be completed',
  });
  expectNoAccountCreated(f);
}

// UC-01 bước 6 / GBR-27: đăng ký bằng một trong hai kênh đã được xác minh.
test('REG-02-UTCID01 [N] Đăng ký bằng email đã xác minh: tạo Customer ACTIVE và trả session', async () => {
  const f = createFixture();

  await expectRegistration(f);
});

test('REG-02-UTCID02 [N] Đăng ký bằng số điện thoại canonical đã xác minh', async () => {
  const f = createFixture();
  // Số hợp lệ 0912345678 đã được chuẩn hóa trước khi gọi service.
  Object.assign(f.input, { channel: 'PHONE', canonicalValue: '+84912345678', contactLookup: 'synthetic-phone-lookup' });

  await expectRegistration(f);
});

// III.1.1.1 Full name / MSG12: 2–50 chữ cái và dấu cách.
test('REG-02-UTCID03 [B] Họ tên đúng biên dưới 2 ký tự', async () => {
  const f = createFixture();
  f.input.displayName = 'An';

  await expectRegistration(f, 'An');
});

test('REG-02-UTCID04 [B] Họ tên đúng biên trên 50 ký tự', async () => {
  const f = createFixture();
  f.input.displayName = 'A'.repeat(50);

  await expectRegistration(f, 'A'.repeat(50));
});

// DEF_REG02_01: giữ kỳ vọng SRS dù code hiện tại vẫn tạo tài khoản.
test('REG-02-UTCID05 [B] Từ chối họ tên 1 ký tự theo MSG12', async () => {
  const f = createFixture();
  f.input.displayName = 'A';

  await expectInvalidRegistration(f);
});

// DEF_REG02_02: SRS giới hạn 50, không dùng giới hạn 100 trong code làm expected.
test('REG-02-UTCID06 [B] Từ chối họ tên 51 ký tự theo MSG12', async () => {
  const f = createFixture();
  f.input.displayName = 'A'.repeat(51);

  await expectInvalidRegistration(f);
});

// DEF_REG02_03: MSG12 không cho phép chữ số hoặc ký hiệu.
test('REG-02-UTCID07 [A] Từ chối họ tên chứa chữ số theo MSG12', async () => {
  const f = createFixture();
  f.input.displayName = 'An123';

  await expectInvalidRegistration(f);
});

test('REG-02-UTCID08 [A] Từ chối họ tên chứa ký hiệu theo MSG12', async () => {
  const f = createFixture();
  f.input.displayName = 'An@';

  await expectInvalidRegistration(f);
});

// UC-01 Alternative 4 / MSG01: họ tên là trường bắt buộc.
test('REG-02-UTCID09 [A] Từ chối họ tên rỗng', async () => {
  const f = createFixture();
  f.input.displayName = '';

  await expectInvalidRegistration(f);
});

test('REG-02-UTCID10 [A] Từ chối thiếu displayName', async () => {
  const f = createFixture();
  delete f.input.displayName;

  await expectInvalidRegistration(f);
});

// III.1.1.1 Contact method/Email / MSG01: phải chọn phương thức và cung cấp liên hệ.
test('REG-02-UTCID11 [A] Từ chối thiếu channel', async () => {
  const f = createFixture();
  delete f.input.channel;

  await expectInvalidRegistration(f);
});

test('REG-02-UTCID12 [B] Từ chối canonicalValue rỗng', async () => {
  const f = createFixture();
  f.input.canonicalValue = '';

  await expectInvalidRegistration(f);
});

test('REG-02-UTCID13 [A] Từ chối thiếu canonicalValue', async () => {
  const f = createFixture();
  delete f.input.canonicalValue;

  await expectInvalidRegistration(f);
});

// UC-01 Alternative 4 / GBR-05 / MSG05: liên hệ duy nhất, bất kể vai trò.
test('REG-02-UTCID14 [A] Email đã thuộc Customer khác: không tạo tài khoản', async () => {
  const f = createFixture();
  f.query.lean.mockResolvedValue({ userId: '200000000000000000000002' });

  await expectContactAlreadyLinked(f);
});

test('REG-02-UTCID15 [A] Phone đã thuộc Staff: không tạo tài khoản', async () => {
  const f = createFixture();
  Object.assign(f.input, { channel: 'PHONE', canonicalValue: '+84912345678', contactLookup: 'synthetic-phone-lookup' });
  f.query.lean.mockResolvedValue({ userId: '200000000000000000000003' });

  await expectContactAlreadyLinked(f);
});

test('REG-02-UTCID16 [A] Email đã thuộc Pet Sitter: không tạo tài khoản', async () => {
  const f = createFixture();
  f.query.lean.mockResolvedValue({ userId: '200000000000000000000004' });

  await expectContactAlreadyLinked(f);
});

// UC-01 Alternative 4 / MSG01: khoảng trắng không thay thế cho họ tên bắt buộc.
test('REG-02-UTCID17 [B] Tên chỉ có whitespace phải bị từ chối', async () => {
  const f = createFixture();
  f.input.displayName = ' \t\n ';

  await expectInvalidRegistration(f);
});
