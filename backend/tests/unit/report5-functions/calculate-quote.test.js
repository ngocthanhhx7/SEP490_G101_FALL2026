import { test, expect } from '@jest/globals';
import { calculateQuote } from '../../../src/services/pricing/pricing-calculation.service.js';

// PRICE-CALC-02: mỗi test khớp đúng một UTCID của sheet PRICE-CALC-02_calculateQuote.
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

function pet(id = 'synthetic-pet-1', weightKg = 4) {
  return { _id: id, species: 'DOG', breedCode: 'mixed', weightKg, traits: [] };
}

function travelRule() {
  return {
    code: 'TRAVEL',
    label: 'Phụ phí di chuyển của khu vực mẫu',
    explanation: 'Caller đã chọn khu vực và đưa đúng phụ phí vào policy.',
    scope: 'VISIT',
    bps: 0,
    flatVnd: 15000,
    when: {},
  };
}

function quoteInput(overrides = {}) {
  return {
    baseAmountVnd: 100000,
    priceVersion: 1,
    policy: makePolicy(),
    pets: [pet()],
    durationMinutes: 60,
    visitCount: 1,
    ...overrides,
  };
}

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID01 [N] Một pet một lượt không có phụ phí trả đúng giá gốc", () => {
  const actual = calculateQuote(quoteInput());

  expect(actual).toMatchObject({ totalVnd: 100000, subtotalVnd: 100000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'BASE', amountVnd: 100000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID02 [N] Ba lượt không có phụ phí cộng đúng giá từng lượt", () => {
  const actual = calculateQuote(quoteInput({ visitCount: 3 }));

  expect(actual).toMatchObject({ totalVnd: 300000, subtotalVnd: 300000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'BASE', amountVnd: 300000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID03 [N] Cộng phụ phí khi cân nặng nằm trong nhóm đã cấu hình", () => {
  const input = quoteInput({
    pets: [pet('synthetic-pet-1', 8)],
    policy: makePolicy({ rules: [sizeRule('DOG_SIZE', 5, 10, 20000)] }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 120000, subtotalVnd: 120000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'DOG_SIZE', amountVnd: 20000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID04 [B] Không cộng phụ phí ngay dưới biên dưới 5 kg của nhóm mẫu", () => {
  const input = quoteInput({
    pets: [pet('synthetic-pet-1', 4.999)],
    policy: makePolicy({ rules: [sizeRule('DOG_SIZE', 5, 10, 20000)] }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 100000, subtotalVnd: 100000 });
  expect(actual.lines.some(line => line.code === 'DOG_SIZE')).toBe(false);
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID05 [B] Cộng phụ phí tại biên dưới đóng 5 kg của nhóm mẫu", () => {
  const input = quoteInput({
    pets: [pet('synthetic-pet-1', 5)],
    policy: makePolicy({ rules: [sizeRule('DOG_SIZE', 5, 10, 20000)] }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 120000, subtotalVnd: 120000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'DOG_SIZE', amountVnd: 20000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID06 [B] Cộng phụ phí ngay dưới biên trên mở 10 kg của nhóm mẫu", () => {
  const input = quoteInput({
    pets: [pet('synthetic-pet-1', 9.999)],
    policy: makePolicy({ rules: [sizeRule('DOG_SIZE', 5, 10, 20000)] }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 120000, subtotalVnd: 120000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'DOG_SIZE', amountVnd: 20000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID07 [B] Không cộng phụ phí tại biên trên mở 10 kg của nhóm mẫu", () => {
  const input = quoteInput({
    pets: [pet('synthetic-pet-1', 10)],
    policy: makePolicy({ rules: [sizeRule('DOG_SIZE', 5, 10, 20000)] }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 100000, subtotalVnd: 100000 });
  expect(actual.lines.some(line => line.code === 'DOG_SIZE')).toBe(false);
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID08 [N] Hai pet cộng phụ phí đúng một pet thêm", () => {
  const input = quoteInput({
    pets: [pet('pet-1'), pet('pet-2')],
    policy: makePolicy({ extraPetBps: 2000 }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 120000, subtotalVnd: 120000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'ADDITIONAL_PETS', amountVnd: 20000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID09 [N] Ba pet cộng phụ phí đúng hai pet thêm", () => {
  const input = quoteInput({
    pets: [pet('pet-1'), pet('pet-2'), pet('pet-3')],
    policy: makePolicy({ extraPetBps: 2000 }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 140000, subtotalVnd: 140000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'ADDITIONAL_PETS', amountVnd: 40000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID10 [N] Phụ phí di chuyển của khu vực đã chọn tính một lần cho mỗi lượt", () => {
  const input = quoteInput({
    pets: [pet('pet-1'), pet('pet-2')],
    policy: makePolicy({ rules: [travelRule()] }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 115000, subtotalVnd: 115000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'TRAVEL', amountVnd: 15000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID11 [N] Cộng giá gốc cùng phụ phí kích thước pet thêm và di chuyển", () => {
  const input = quoteInput({
    pets: [pet('pet-1', 8), pet('pet-2', 4)],
    policy: makePolicy({
      extraPetBps: 2000,
      rules: [sizeRule('DOG_SIZE', 5, 10, 20000), travelRule()],
    }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 155000, subtotalVnd: 155000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'BASE', amountVnd: 100000 }),
    expect.objectContaining({ code: 'DOG_SIZE', amountVnd: 20000 }),
    expect.objectContaining({ code: 'ADDITIONAL_PETS', amountVnd: 20000 }),
    expect.objectContaining({ code: 'TRAVEL', amountVnd: 15000 }),
  ]));
});

// SRS: UC-23 Description; III.7.1 Create Booking — Booking summary; GBR-20.
test("PRICE-CALC-02-UTCID12 [N] Cộng đầy đủ các khoản áp dụng cho ba lượt", () => {
  const input = quoteInput({
    visitCount: 3,
    pets: [pet('pet-1', 8), pet('pet-2', 4)],
    policy: makePolicy({
      extraPetBps: 2000,
      rules: [sizeRule('DOG_SIZE', 5, 10, 20000), travelRule()],
    }),
  });

  const actual = calculateQuote(input);

  expect(actual).toMatchObject({ totalVnd: 465000, subtotalVnd: 465000 });
  expect(actual.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'BASE', amountVnd: 300000 }),
    expect.objectContaining({ code: 'DOG_SIZE', amountVnd: 60000 }),
    expect.objectContaining({ code: 'ADDITIONAL_PETS', amountVnd: 60000 }),
    expect.objectContaining({ code: 'TRAVEL', amountVnd: 45000 }),
  ]));
});

// SRS: UC-23 Normal Flow 4 / Alternative Step 4: base price above 0.
test("PRICE-CALC-02-UTCID13 [B] Từ chối giá gốc bằng 0", () => {
  const input = quoteInput({ baseAmountVnd: 0 });

  expect(() => calculateQuote(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  }));
});

// SRS: UC-23 Normal Flow 4 / Alternative Step 4: base price above 0.
test("PRICE-CALC-02-UTCID14 [A] Từ chối giá gốc âm", () => {
  const input = quoteInput({ baseAmountVnd: -1 });

  expect(() => calculateQuote(input)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
  }));
});

// SRS: UC-23 Normal Flow 4: base price above 0; fixture theo đơn vị VND của project.
test("PRICE-CALC-02-UTCID15 [B] Chấp nhận giá gốc dương nhỏ nhất theo đơn vị nguyên VND hiện tại", () => {
  const actual = calculateQuote(quoteInput({ baseAmountVnd: 1 }));

  expect(actual).toMatchObject({ totalVnd: 1, subtotalVnd: 1 });
});
