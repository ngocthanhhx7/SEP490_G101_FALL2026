// Mỗi file chỉ gọi createPaymentLink; dữ liệu và khóa đều tổng hợp.
import { createHmac } from 'node:crypto';
import { test, expect, jest, afterEach } from '@jest/globals';
import { createPayosProvider } from '../../../src/services/providers/payos/payos.provider.js';

const CONFIG = { clientId: 'report5-synthetic-client', apiKey: 'report5-synthetic-api-key',
  checksumKey: 'report5-synthetic-payos-checksum' };
const NOW = Date.parse('2026-11-12T03:00:00.000Z');
afterEach(() => { jest.restoreAllMocks(); });
function paymentInput() {
  // Caller đã kiểm tra booking kết thúc, bill final >0 và không hold.
  return { orderCode: 345001, amount: 300000, description: 'PWC000001',
    returnUrl: 'https://paw.example.test/payments/return', cancelUrl: 'https://paw.example.test/payments/cancel',
    expiredAt: Math.floor((NOW + 48 * 3600000) / 1000) };
}
// Chữ ký fixture tính trước bằng Python hmac; không dùng signer của hàm đang test.
// Canonical theo hợp đồng provider: accountName=SYNTHETIC ACCOUNT&accountNumber=SYNTHETIC-ACCOUNT&amount=300000&checkoutUrl=https://pay.payos.vn/web/report5-synthetic-link&currency=VND&orderCode=345001&paymentLinkId=report5-synthetic-link&qrCode=SYNTHETIC-VIETQR&status=PENDING
const LINK_DATA = {
  "orderCode": 345001,
  "amount": 300000,
  "currency": "VND",
  "status": "PENDING",
  "paymentLinkId": "report5-synthetic-link",
  "checkoutUrl": "https://pay.payos.vn/web/report5-synthetic-link",
  "qrCode": "SYNTHETIC-VIETQR",
  "accountNumber": "SYNTHETIC-ACCOUNT",
  "accountName": "SYNTHETIC ACCOUNT"
};
const LINK_SIGNATURE = '50724882d21d98f49f31431ad4a925ecff29895c39e225863bea11afbef5e308';
function response() {
  return { ok: true, status: 200, json: async () => ({ code: '00', data: { ...LINK_DATA }, signature: LINK_SIGNATURE }) };
}
function fixture(fetchImpl = jest.fn(async () => response())) {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  const createPaymentLink = createPayosProvider({ ...CONFIG, fetchImpl }).createPaymentLink;
  return { createPaymentLink, fetchImpl };
}

// SRS: API-01 Purpose/Auth/URL; UC-49 bước 3; GBR-17; IV.3 Payment details.
test("PAYOS-01-UTCID01 [N] Tạo link VietQR bằng request có chữ ký và thời hạn của bill", async () => {
  const f = fixture();
  const input = paymentInput();

  const actual = await f.createPaymentLink(input);

  expect(actual).toEqual({ orderCode: input.orderCode, amount: 300000, currency: 'VND', providerStatus: 'PENDING',
    paymentLinkId: 'report5-synthetic-link', checkoutUrl: LINK_DATA.checkoutUrl, qrCode: 'SYNTHETIC-VIETQR' });
  const [url, options] = f.fetchImpl.mock.calls[0];
  expect(url).toBe('https://api-merchant.payos.vn/v2/payment-requests');
  expect(options.method).toBe('POST');
  expect(options.headers).toMatchObject({ 'x-client-id': CONFIG.clientId, 'x-api-key': CONFIG.apiKey });
  const sent = JSON.parse(options.body);
  expect(sent).toMatchObject({ orderCode: input.orderCode, amount: input.amount, expiredAt: input.expiredAt });
  const canonical = 'amount=300000&cancelUrl=https://paw.example.test/payments/cancel&description=PWC000001'
    + '&orderCode=345001&returnUrl=https://paw.example.test/payments/return';
  expect(sent.signature).toBe(createHmac('sha256', CONFIG.checksumKey).update(canonical, 'utf8').digest('hex'));
  // Return PENDING chưa phải bằng chứng đã trả tiền; kết quả không đưa bank fields ra caller.
  expect(actual).not.toHaveProperty('accountNumber');
});

// SRS: UC-49 Alternative 1.2; GBR-17 — bill 0 closes booking, nothing paid.
test("PAYOS-01-UTCID02 [B] Bill bằng 0 không gửi yêu cầu thanh toán sang payOS", async () => {
  const f = fixture();
  const input = { ...paymentInput(), amount: 0 };

  await expect(f.createPaymentLink(input)).rejects.toMatchObject({ name: 'AppError', status: 400, code: 'PAYOS_INVALID_REQUEST' });
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

// SRS: UC-49 Alternative Step 3 — payOS cannot create link, bill stays unpaid, can try again.
test("PAYOS-01-UTCID03 [A] payOS từ chối tạo link thì trả lỗi về caller", async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ code: '99', desc: 'SYNTHETIC REJECTION' }) }));
  const f = fixture(fetchImpl);

  await expect(f.createPaymentLink(paymentInput())).rejects.toMatchObject({ name: 'AppError', status: 503, code: 'PAYOS_REQUEST_REJECTED' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

// SRS: UC-49 Alternative Step 3; API-01 — payOS không tạo được link.
test("PAYOS-01-UTCID04 [A] Không kết nối được payOS thì không trả link thành công", async () => {
  const fetchImpl = jest.fn(async () => { throw new Error('SYNTHETIC NETWORK FAILURE'); });
  const f = fixture(fetchImpl);

  await expect(f.createPaymentLink(paymentInput())).rejects.toMatchObject({ name: 'AppError', status: 503, code: 'PROVIDER_UNAVAILABLE' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

// SRS: UC-49 Alternative Step 3 — customer can try again; không suy rộng retry khi kết quả provider chưa rõ.
test("PAYOS-01-UTCID05 [N] Sau lần từ chối rõ ràng có thể yêu cầu tạo link lại", async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ code: '99', desc: 'SYNTHETIC REJECTION' }) })
    .mockImplementationOnce(async () => response());
  const f = fixture(fetchImpl);
  const input = paymentInput();

  await expect(f.createPaymentLink(input)).rejects.toMatchObject({ code: 'PAYOS_REQUEST_REJECTED' });
  await expect(f.createPaymentLink(input)).resolves.toMatchObject({ checkoutUrl: LINK_DATA.checkoutUrl, providerStatus: 'PENDING' });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
