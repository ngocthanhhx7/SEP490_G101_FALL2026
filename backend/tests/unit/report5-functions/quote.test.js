import { test, expect, jest } from '@jest/globals';
import { createPricingService } from '../../../src/services/pricing/pricing.service.js';
import { AppError } from '../../../src/utils/app-error.js';

// QUOTE-01: một test cho mỗi UTCID trong QUOTE-01_quote.
// Chỉ các tình huống SRS được ghi cạnh từng test. Không test TTL/ID sai/DB failure.
// Factory chỉ tạo dependency; không kiểm thử các method khác trong file này.

const OWNER = '111111111111111111111111';
const SERVICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_SERVICE = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const PET_1 = 'cccccccccccccccccccccccc';
const QUOTE_ID = 'eeeeeeeeeeeeeeeeeeeeeeee';
const NOW = Date.parse('2026-11-12T03:00:00Z');

function makeContext({ amountVnd = 100000, surcharges = false } = {}) {
  // Giá và tỷ lệ chỉ là fixture. Không giả định đây là giá mặc định của SRS.
  const pets = [{ _id: PET_1, version: 1, species: 'DOG', breedCode: 'mixed',
    weightKg: surcharges ? 8 : 4, traits: [] }];
  return {
    price: { amountVnd, version: 1 },
    version: { version: 1 },
    servicePolicy: { version: 1, title: 'Chính sách mẫu', body: 'Dữ liệu tổng hợp' },
    pets,
    policy: {
      version: 1, billingMode: 'PER_VISIT', unitMinutes: 60, maxPets: 5,
      extraPetBps: surcharges ? 2000 : 0, maxSurchargeBps: 50000,
      orderStepVnd: 1000000, orderStepBps: 0, maxOrderTierBps: 50000,
      comboPerVisitBps: 0, comboMaxBps: 0,
      rules: surcharges ? [
        { code: 'DOG_SIZE', label: 'Nhóm cân nặng mẫu', explanation: 'Phụ phí mẫu',
          scope: 'PET', bps: 0, flatVnd: 20000,
          when: { species: 'DOG', minWeightKg: 5, maxWeightKg: 10 } },
        { code: 'TRAVEL', label: 'Khu vực mẫu', explanation: 'Caller đã chọn khu vực',
          scope: 'VISIT', bps: 0, flatVnd: 15000, when: {} },
      ] : [],
    },
  };
}

function selection(overrides = {}) {
  return { serviceId: SERVICE, petIds: [PET_1], durationMinutes: 60, visitCount: 1,
    ...overrides };
}

function subject(context = makeContext()) {
  const createSnapshot = jest.fn(async ([document]) => [{ ...document, _id: QUOTE_ID }]);
  const repository = {
    context: jest.fn(async () => globalThis.structuredClone(context)),
    models: { DecisionSnapshot: { create: createSnapshot } },
  };
  // Factory chỉ inject port/clock; từng test chỉ gọi quote.
  const quote = createPricingService({ repository, clock: () => NOW }).quote;
  return { quote, repository, createSnapshot };
}

// SRS: UC-25 bước 3–4; III.7.1 Booking — Summary and price; GBR-20.
test("QUOTE-01-UTCID01 [N] Báo giá một lượt từ bảng giá hiện hành", async () => {
  const { quote } = subject();

  const actual = await quote(OWNER, selection());

  expect(actual).toMatchObject({ totalVnd: 100000, subtotalVnd: 100000, paymentMode: 'POSTPAY' });
});

// SRS: UC-25 bước 3–4; III.7.1 Booking — Summary and price; GBR-20 (một bé mỗi lịch đặt).
test("QUOTE-01-UTCID02 [N] Báo giá cộng đúng phụ phí kích thước và di chuyển cho một bé", async () => {
  const { quote } = subject(makeContext({ surcharges: true }));

  const actual = await quote(OWNER, selection({ petIds: [PET_1] }));

  expect(actual).toMatchObject({ totalVnd: 135000, subtotalVnd: 135000, paymentMode: 'POSTPAY' });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'DOG_SIZE', amountVnd: 20000 }),
    expect.objectContaining({ code: 'TRAVEL', amountVnd: 15000 }),
  ]));
});

// SRS: UC-25; GBR-17; approved-decisions: booking nhiều lượt yêu cầu thanh toán trả trước PREPAY.
test("QUOTE-01-UTCID03 [N] Booking nhiều lượt áp dụng chế độ thanh toán trả trước PREPAY", async () => {
  const { quote } = subject();

  const actual = await quote(OWNER, selection({ visitCount: 3 }));

  expect(actual.totalVnd).toBe(300000);
  expect(actual.paymentMode).toBe('PREPAY');
});

// SRS: III.7.1 Booking — Summary and price thay đổi mỗi khi trường chọn thay đổi; UC-25 bước 1–4.
test("QUOTE-01-UTCID04 [N] Đổi dịch vụ cập nhật tổng giá đang hiển thị", async () => {
  const { quote, repository } = subject();
  repository.context.mockImplementation(async (_ownerId, input) =>
    makeContext({ amountVnd: input.serviceId === SERVICE ? 100000 : 200000 }));

  const first = await quote(OWNER, selection());
  const changed = await quote(OWNER, selection({ serviceId: OTHER_SERVICE }));

  expect(first.totalVnd).toBe(100000);
  expect(changed.totalVnd).toBe(200000);
  expect(repository.context).toHaveBeenLastCalledWith(OWNER,
    expect.objectContaining({ serviceId: OTHER_SERVICE }));
});

// SRS: III.7.1 Booking — Service/Pets bắt buộc; UC-25 bước 1–4; MSG01.
test("QUOTE-01-UTCID05 [A] Thiếu dịch vụ bắt buộc không được trả báo giá", async () => {
  const { quote, repository, createSnapshot } = subject();
  const input = { petIds: [PET_1], durationMinutes: 60, visitCount: 1 };

  await expect(quote(OWNER, input)).rejects.toMatchObject({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  });
  expect(repository.context).not.toHaveBeenCalled();
  expect(createSnapshot).not.toHaveBeenCalled();
});

// SRS: III.7.1 Booking — Service/Pets bắt buộc; UC-25 bước 1–4; MSG01.
test("QUOTE-01-UTCID06 [B] Không chọn pet ở biên 0 pet bị từ chối", async () => {
  const { quote, repository, createSnapshot } = subject();

  await expect(quote(OWNER, selection({ petIds: [] }))).rejects.toMatchObject({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  });
  expect(repository.context).not.toHaveBeenCalled();
  expect(createSnapshot).not.toHaveBeenCalled();
});

// SRS: III.7.1 Booking — chỉ hiển thị dịch vụ Admin đã làm active; UC-25 bước 1–4.
test("QUOTE-01-UTCID07 [A] Tôn trọng quyết định từ chối dịch vụ không còn active của context", async () => {
  const { quote, repository, createSnapshot } = subject();
  const unavailable = new AppError(409, 'SERVICE_UNAVAILABLE', 'Service unavailable');
  repository.context.mockRejectedValue(unavailable);

  await expect(quote(OWNER, selection())).rejects.toBe(unavailable);
  expect(createSnapshot).not.toHaveBeenCalled();
});
