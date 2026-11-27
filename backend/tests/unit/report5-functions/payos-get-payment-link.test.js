// Mỗi file chỉ gọi getPaymentLink; dữ liệu và khóa đều tổng hợp.
import { test, expect, jest } from '@jest/globals';
import { createPayosProvider } from '../../../src/services/providers/payos/payos.provider.js';

const CONFIG = { clientId: 'report5-synthetic-client', apiKey: 'report5-synthetic-api-key',
  checksumKey: 'report5-synthetic-payos-checksum' };
// Chữ ký fixture tính trước bằng Python hmac; không dùng signer của hàm đang test.
// Canonical theo hợp đồng provider: amount=300000&amountPaid=300000&amountRemaining=0&createdAt=2026-11-12T03:00:00.000Z&id=report5-synthetic-link&orderCode=345001&status=PAID
const PAID_DATA = {
  "id": "report5-synthetic-link",
  "orderCode": 345001,
  "amount": 300000,
  "amountPaid": 300000,
  "amountRemaining": 0,
  "status": "PAID",
  "createdAt": "2026-11-12T03:00:00.000Z"
};
const PAID_SIGNATURE = '1f2c6516f3feedf835ccd16459a68aa4094df49033efcbaf04b49d37c912599c';
// Chữ ký fixture tính trước bằng Python hmac; không dùng signer của hàm đang test.
// Canonical theo hợp đồng provider: amount=300000&amountPaid=0&amountRemaining=300000&createdAt=2026-11-12T03:00:00.000Z&id=report5-synthetic-link&orderCode=345001&status=PENDING
const PENDING_SIGNATURE = '79471ef89cf45ce9581b57e188131c4f49d35c3bc6d5a03b80c4523fedb13426';
function fixture(data = PAID_DATA, signature = PAID_SIGNATURE) {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200,
    json: async () => ({ code: '00', data: { ...data }, signature }) }));
  const getPaymentLink = createPayosProvider({ ...CONFIG, fetchImpl }).getPaymentLink;
  return { getPaymentLink, fetchImpl };
}

// SRS: API-02 URL/Auth/Purpose; JOB-03 bước 3; GBR-18 — hỏi provider trước khi đánh dấu Overdue.
test("PAYOS-02-UTCID01 [N] Đọc trạng thái đã trả tiền bằng GET có xác thực", async () => {
  const f = fixture();

  const actual = await f.getPaymentLink(345001);

  expect(actual).toEqual({ orderCode: 345001, amount: 300000, amountPaid: 300000, amountRemaining: 0,
    providerStatus: 'PAID', createdAt: PAID_DATA.createdAt });
  const [url, options] = f.fetchImpl.mock.calls[0];
  expect(url).toBe('https://api-merchant.payos.vn/v2/payment-requests/345001');
  expect(options.method).toBe('GET');
  expect(options.headers).toMatchObject({ 'x-client-id': CONFIG.clientId, 'x-api-key': CONFIG.apiKey });
});

// SRS: API-02 Purpose; JOB-03 bước 3; JOB-04 bước 1; GBR-18.
test("PAYOS-02-UTCID02 [N] Đọc được kết quả chưa thanh toán để caller đối soát", async () => {
  const data = { ...PAID_DATA, amountPaid: 0, amountRemaining: 300000, status: 'PENDING' };
  const f = fixture(data, PENDING_SIGNATURE);

  await expect(f.getPaymentLink(345001)).resolves.toMatchObject({ providerStatus: 'PENDING', amountPaid: 0, amountRemaining: 300000 });
});

// SRS: JOB-03 Failure behavior; API-02; GBR-18 — cannot reach payOS, nothing marked Overdue.
test("PAYOS-02-UTCID03 [A] Không đọc được payOS thì trả lỗi thay vì đoán trạng thái", async () => {
  const f = fixture();
  f.fetchImpl.mockRejectedValueOnce(new Error('SYNTHETIC NETWORK FAILURE'));

  await expect(f.getPaymentLink(345001)).rejects.toMatchObject({ name: 'AppError', status: 503, code: 'PROVIDER_UNAVAILABLE' });
  expect(f.fetchImpl).toHaveBeenCalledTimes(1);
});
