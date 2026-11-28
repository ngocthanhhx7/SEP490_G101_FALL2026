import { test, expect, jest } from '@jest/globals';
import { createPricingService } from '../../../src/services/pricing/pricing.service.js';

// QUOTE-02: một test cho mỗi UTCID trong QUOTE-02_basket.
// Chỉ các tình huống SRS được ghi cạnh từng test. Không test TTL/ID sai/DB failure.
// Factory chỉ tạo dependency; không kiểm thử các method khác trong file này.

const OWNER = '111111111111111111111111';
const SERVICE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
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
    readTier: jest.fn(async () => ({ tierCode: 'MEMBER', tierPolicyVersion: null, discountBps: 0 })),
    models: { DecisionSnapshot: { create: createSnapshot } },
  };
  // Factory chỉ inject port/clock; từng test chỉ gọi basket.
  const basket = createPricingService({ repository, clock: () => NOW }).basket;
  return { basket, repository, createSnapshot };
}

// SRS: UC-25 bước 3–4; III.7.1 Booking — Summary and price; GBR-20.
test("QUOTE-02-UTCID01 [N] Một dòng dịch vụ báo đúng giá của booking một lượt", async () => {
  const { basket } = subject();

  const actual = await basket(OWNER, { items: [selection()] });

  expect(actual).toMatchObject({ baseVnd: 100000, totalVnd: 100000,
    visitCount: 1, paymentMode: 'PREPAY' });
  expect(actual.items).toHaveLength(1);
  expect(actual.items[0]).toMatchObject({ serviceId: SERVICE, totalVnd: 100000 });
});

// SRS: UC-25 bước 3–4; III.7.1 Booking — Summary and price; GBR-20 (một bé mỗi lịch đặt).
test("QUOTE-02-UTCID02 [N] Một dòng dịch vụ cộng đúng các phụ phí áp dụng", async () => {
  const { basket } = subject(makeContext({ surcharges: true }));

  const actual = await basket(OWNER, {
    items: [selection({ petIds: [PET_1] })],
  });

  expect(actual).toMatchObject({ baseVnd: 100000, surchargeVnd: 35000,
    totalVnd: 135000, paymentMode: 'PREPAY' });
  expect(actual.items[0].totalVnd).toBe(135000);
});

// SRS: UC-25; GBR-17; approved-decisions: giỏ dịch vụ nhiều lượt áp dụng trả trước PREPAY.
test("QUOTE-02-UTCID03 [N] Một dịch vụ nhiều lượt áp dụng chế độ thanh toán trả trước PREPAY", async () => {
  const { basket } = subject();

  const actual = await basket(OWNER, { items: [selection({ visitCount: 3 })] });

  expect(actual.totalVnd).toBe(300000);
  expect(actual.visitCount).toBe(3);
  expect(actual.paymentMode).toBe('PREPAY');
});

// SRS: III.7.1 Booking — Service/Pets bắt buộc; UC-25 bước 1–4; MSG01.
test("QUOTE-02-UTCID04 [B] Không có dòng dịch vụ ở biên 0 lựa chọn bị từ chối", async () => {
  const { basket, repository, createSnapshot } = subject();

  await expect(basket(OWNER, { items: [] })).rejects.toMatchObject({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  });
  expect(repository.context).not.toHaveBeenCalled();
  expect(createSnapshot).not.toHaveBeenCalled();
});

// SRS: III.7.1 Booking — Service/Pets bắt buộc; UC-25 bước 1–4; MSG01.
test("QUOTE-02-UTCID05 [B] Dòng dịch vụ không chọn pet bị từ chối", async () => {
  const { basket, repository, createSnapshot } = subject();

  await expect(basket(OWNER, { items: [selection({ petIds: [] })] })).rejects.toMatchObject({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  });
  expect(repository.context).not.toHaveBeenCalled();
  expect(createSnapshot).not.toHaveBeenCalled();
});
