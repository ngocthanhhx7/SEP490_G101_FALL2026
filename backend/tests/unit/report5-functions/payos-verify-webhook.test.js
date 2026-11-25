// Mỗi file chỉ gọi verifyWebhook; dữ liệu và khóa đều tổng hợp.
import { test, expect, jest } from '@jest/globals';
import { createPayosProvider } from '../../../src/services/providers/payos/payos.provider.js';

const CONFIG = { clientId: 'report5-synthetic-client', apiKey: 'report5-synthetic-api-key',
  checksumKey: 'report5-synthetic-payos-checksum' };
// Chữ ký fixture tính trước bằng Python hmac; không dùng signer của hàm đang test.
// Canonical theo hợp đồng provider: amount=300000&code=00&currency=VND&orderCode=345001&paymentLinkId=report5-synthetic-link&reference=SYNTHETIC-REF-01
const SIGNED_DATA = {
  "orderCode": 345001,
  "amount": 300000,
  "currency": "VND",
  "code": "00",
  "paymentLinkId": "report5-synthetic-link",
  "reference": "SYNTHETIC-REF-01"
};
const SIGNATURE = '622e638917173ead042bc8cf74549f1607f22a25e50de5f26b60e6ca020eb5c2';
// Chữ ký fixture tính trước bằng Python hmac; không dùng signer của hàm đang test.
// Canonical theo hợp đồng provider: amount=300000&code=99&currency=VND&orderCode=345001&paymentLinkId=report5-synthetic-link&reference=SYNTHETIC-REF-01
const FAILED_SIGNATURE = '3e36a78834c145f1d62d1605fd06bcb8ac381918e28fed7a1aebdb7b14acebe0';
function body() {
  return { success: true, code: '00', data: { ...SIGNED_DATA }, signature: SIGNATURE };
}
function fixture() {
  const fetchImpl = jest.fn();
  const verifyWebhook = createPayosProvider({ ...CONFIG, fetchImpl }).verifyWebhook;
  return { verifyWebhook, fetchImpl };
}

// SRS: API-03 Auth; UC-49 bước 5–6; IV.3 Payment details — chỉ nhận kết quả có chữ ký hợp lệ.
test("PAYOS-03-UTCID01 [N] Webhook có chữ ký hợp lệ trả dữ liệu đã được ký", () => {
  const f = fixture();

  const actual = f.verifyWebhook(body());

  expect(actual).toEqual(SIGNED_DATA);
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

// SRS: API-03 Auth; IV.3 Payment details — không có chữ ký hợp lệ không được nhận.
test("PAYOS-03-UTCID02 [A] Webhook thiếu chữ ký bị từ chối", () => {
  const f = fixture();
  const input = body();
  delete input.signature;

  expect(() => f.verifyWebhook(input)).toThrow(expect.objectContaining({ name: 'AppError', status: 401, code: 'PAYOS_SIGNATURE_INVALID' }));
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

// SRS: API-03 Auth — request with wrong signature is refused; UC-49 bước 6.
test("PAYOS-03-UTCID03 [A] Webhook có chữ ký sai bị từ chối", () => {
  const f = fixture();
  const input = { ...body(), signature: '0'.repeat(64) };

  expect(() => f.verifyWebhook(input)).toThrow(expect.objectContaining({ name: 'AppError', status: 401, code: 'PAYOS_SIGNATURE_INVALID' }));
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

// SRS: API-03 HMAC-SHA256; IV.3 Payment details; UC-49 bước 6 — kiểm tra chữ ký trước nhận kết quả.
test("PAYOS-03-UTCID04 [A] Số tiền bị sửa sau khi ký làm webhook không hợp lệ", () => {
  const f = fixture();
  const input = body();
  input.data.amount = 1;

  expect(() => f.verifyWebhook(input)).toThrow(expect.objectContaining({ name: 'AppError', status: 401, code: 'PAYOS_SIGNATURE_INVALID' }));
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

// SRS: UC-49 Alternative Step 5 — payment fails, bill stays unpaid; API-03/IV.3 — chỉ tin phần có chữ ký; ánh xạ body.data theo hợp đồng provider.
test("PAYOS-03-UTCID05 [N] Flag success chưa ký không thay thế kết quả thất bại đã ký", () => {
  const f = fixture();
  const input = { success: true, code: '00', data: { ...SIGNED_DATA, code: '99' }, signature: FAILED_SIGNATURE };

  const actual = f.verifyWebhook(input);

  expect(actual).toEqual({ ...SIGNED_DATA, code: '99' });
  expect(actual).not.toHaveProperty('success');
  expect(f.fetchImpl).not.toHaveBeenCalled();
});
