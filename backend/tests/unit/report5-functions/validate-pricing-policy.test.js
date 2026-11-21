import { test, expect } from '@jest/globals';
import { validatePricingPolicy } from '../../../src/services/pricing/pricing-calculation.service.js';

// PRICE-CALC-01: mỗi test khớp đúng một UTCID của sheet PRICE-CALC-01_validatePricingPo.
// Chỉ SRS UC-23 / GBR-20. Tiền, % và khoảng cân nặng là fixture, không phải giá mặc định.
// Không test giới hạn kỹ thuật, cơ chế làm tròn, billing mode khác hoặc phụ phí bậc giá.
// Chưa có schema bảng ngưỡng giảm giá/hạng khách hàng: xem ghi chú phạm vi trong README và sheet.

function makePolicy(overrides = {}) {
  return {
    version: 1,
    billingMode: 'PER_VISIT',
    unitMinutes: 60,
    maxPets: 5,
    extraPetBps: 0,
    maxSurchargeBps: 50000,
    orderStepVnd: 1000000,
    orderStepBps: 0,
    maxOrderTierBps: 50000,
    comboPerVisitBps: 0,
    comboMaxBps: 0,
    rules: [],
    ...overrides,
  };
}

function sizeRule(code, minWeightKg, maxWeightKg, flatVnd, boundaries = {}) {
  return {
    code,
    label: 'Phụ phí nhóm cân nặng mẫu',
    explanation: 'Giá trị tổng hợp để kiểm tra bảng giá, không phải giá được SRS ấn định.',
    scope: 'PET',
    bps: 0,
    flatVnd,
    when: { species: 'DOG', minWeightKg, maxWeightKg, ...boundaries },
  };
}

// SRS: UC-23 Normal Flow 2–4 / Alternative Step 4; III.6.2.2; MSG52.
test("PRICE-CALC-01-UTCID01 [N] Chấp nhận phụ phí dương trong cấu hình mẫu", () => {
  const policy = makePolicy({
    extraPetBps: 2000,
    rules: [sizeRule('DOG_SIZE', 0, 10, 10000)],
  });

  expect(validatePricingPolicy(policy)).toBe(policy);
});

// SRS: UC-23 Normal Flow 2–4 / Alternative Step 4; III.6.2.2; MSG52.
test("PRICE-CALC-01-UTCID02 [B] Chấp nhận phụ phí mỗi pet thêm bằng 0", () => {
  const policy = makePolicy({
    extraPetBps: 0,
    rules: [sizeRule('DOG_SIZE', 0, 10, 10000)],
  });

  expect(validatePricingPolicy(policy)).toBe(policy);
});

// SRS: UC-23 Normal Flow 2–4 / Alternative Step 4; III.6.2.2; MSG52.
test("PRICE-CALC-01-UTCID03 [B] Chấp nhận phụ phí nhóm cân nặng bằng 0", () => {
  const policy = makePolicy({
    extraPetBps: 2000,
    rules: [sizeRule('DOG_SIZE', 0, 10, 0)],
  });

  expect(validatePricingPolicy(policy)).toBe(policy);
});

// SRS: UC-23 Normal Flow 2–4 / Alternative Step 4; III.6.2.2; MSG52.
test("PRICE-CALC-01-UTCID04 [B] Từ chối phụ phí pet thêm âm ngay dưới biên 0", () => {
  const policy = makePolicy({
    extraPetBps: -1,
    rules: [sizeRule('DOG_SIZE', 0, 10, 10000)],
  });

  expect(() => validatePricingPolicy(policy)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  }));
});

// SRS: UC-23 Normal Flow 2–4 / Alternative Step 4; III.6.2.2; MSG52.
test("PRICE-CALC-01-UTCID05 [B] Từ chối phụ phí nhóm cân nặng âm ngay dưới biên 0", () => {
  const policy = makePolicy({
    extraPetBps: 2000,
    rules: [sizeRule('DOG_SIZE', 0, 10, -1)],
  });

  expect(() => validatePricingPolicy(policy)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  }));
});

// SRS: UC-23 Normal Flow 2–4 / Alternative Step 4; III.6.2.2; MSG52.
test("PRICE-CALC-01-UTCID06 [B] Chấp nhận hai nhóm cân nặng tiếp giáp nhưng không chồng lấn", () => {
  const policy = makePolicy({ rules: [
    sizeRule('DOG_SMALL', 0, 5, 10000),
    sizeRule('DOG_LARGE', 5, 10, 20000),
  ] });

  expect(validatePricingPolicy(policy)).toBe(policy);
});

// SRS: UC-23 Normal Flow 2–4 / Alternative Step 4; III.6.2.2; MSG52.
test("PRICE-CALC-01-UTCID07 [A] Từ chối hai khoảng cân nặng chồng lấn trong cùng dịch vụ", () => {
  const policy = makePolicy({ rules: [
    sizeRule('DOG_SMALL', 0, 6, 10000),
    sizeRule('DOG_LARGE', 5, 10, 20000),
  ] });

  expect(() => validatePricingPolicy(policy)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  }));
});

// SRS: UC-23 Normal Flow 2–4 / Alternative Step 4; III.6.2.2; MSG52.
test("PRICE-CALC-01-UTCID08 [B] Từ chối hai nhóm cùng chứa điểm biên 5 kg", () => {
  const policy = makePolicy({ rules: [
    sizeRule('DOG_SMALL', 0, 5, 10000, { maxWeightInclusive: true }),
    sizeRule('DOG_LARGE', 5, 10, 20000),
  ] });

  expect(() => validatePricingPolicy(policy)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  }));
});
