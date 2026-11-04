import { formatVnd, formatPhone, formatOrderDate, productMessage, productErrorText, isUncertainOutcome, parsePriceInput, formatPriceInput } from '../../src/utils/product-format.js';

test('formats integer VND like the mockups', () => {
  expect(formatVnd(250000)).toBe('250.000 đ');
  expect(formatVnd(0)).toBe('0 đ');
  expect(formatVnd(1.5)).toBe('');
});

test('formats order dates in Vietnam time', () => {
  expect(formatOrderDate('2026-10-18T05:00:00.000Z')).toBe('18/10/2026');
  expect(formatOrderDate('not a date')).toBe('');
});

test('fills message placeholders', () => {
  expect(productMessage('MSG58', { n: 3 })).toBe('Chỉ còn 3 sản phẩm. Vui lòng giảm số lượng.');
  expect(productMessage('MSG59', { code: 'DH-0031' })).toBe('Đơn hàng DH-0031 đã được đặt.');
});

test('maps backend error codes to the R3 messages', () => {
  expect(productErrorText({ code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE' }, { available: 2 })).toContain('Chỉ còn 2');
  expect(productErrorText({ code: 'PRODUCT_OUT_OF_STOCK' })).toBe('Sản phẩm này đã hết hàng.');
  expect(productErrorText({ code: 'CART_EMPTY' })).toContain('Giỏ hàng của bạn đang trống');
  expect(productErrorText({ code: 'ADDRESS_OUT_OF_SERVICE_AREA' })).toContain('chưa phục vụ');
  expect(productErrorText({ code: 'SOMETHING_ELSE' })).toBe('Chưa thể hoàn tất. Vui lòng thử lại sau.');
});

test('treats network and server failures as uncertain outcomes', () => {
  expect(isUncertainOutcome({ code: 'TIMEOUT' })).toBe(true);
  expect(isUncertainOutcome({ code: 'X', status: 503 })).toBe(true);
  expect(isUncertainOutcome({ code: 'CART_EMPTY', status: 409 })).toBe(false);
});

test('D-236 shows a mobile number as 0912 345 678 and leaves anything else as stored', () => {
  expect(formatPhone('0912345678')).toBe('0912 345 678');
  expect(formatPhone('+84912345678')).toBe('+84912345678');
  expect(formatPhone('')).toBe('');
  expect(formatPhone(null)).toBe('');
});

test('AC-04 maps a too-high resellable quantity to MSG104', () => {
  expect(productErrorText({ code: 'RESELLABLE_QUANTITY_INVALID' })).toBe('Số bán lại được không thể lớn hơn số lượng hoàn về.');
});

test('AC-29 reads a price typed as 250000 or 250.000 and flags anything else as MSG113 (WHOLE_NUMBER)', () => {
  for (const [typed, value] of [['250000', 250000], ['250.000', 250000], [' 1.000.000 ', 1000000], ['1', 1], ['100.000.000', 100000000]]) {
    expect(parsePriceInput(typed)).toEqual({ value });
  }
  for (const typed of ['', ' ', '0', '-5', '1,5', '12.5', '1.00', '1.0000', '.500', '1..000', '250,000', 'abc', '0250', undefined, null, 250000]) {
    expect(parsePriceInput(typed)).toEqual({ error: 'WHOLE_NUMBER' });
  }
});

test('a price above 100.000.000 is TOO_LARGE, never MSG113', () => {
  for (const typed of ['100000001', '100.000.001', '999.999.999']) expect(parsePriceInput(typed)).toEqual({ error: 'TOO_LARGE' });
});

test('shows a saved price the way the price box takes it', () => {
  expect(formatPriceInput(250000)).toBe('250.000');
  expect(formatPriceInput(60000)).toBe('60.000');
  expect(formatPriceInput(900)).toBe('900');
  expect(formatPriceInput(0)).toBe('');
  expect(formatPriceInput(undefined)).toBe('');
  expect(parsePriceInput(formatPriceInput(1234567))).toEqual({ value: 1234567 });
});

test('MSG01, MSG113, MSG114 and MSG115 are filled in Vietnamese', () => {
  expect(productMessage('MSG01')).toBe('Vui lòng nhập thông tin này.');
  expect(productMessage('MSG113')).toBe('Vui lòng nhập số nguyên lớn hơn 0.');
  expect(productMessage('MSG114', { product: 'Dây dắt chó' })).toBe('Ẩn Dây dắt chó? Khách hàng sẽ không còn thấy và đặt được sản phẩm này. Các đơn đã đặt không thay đổi.');
  expect(productMessage('MSG115', { code: 'SP-0038' })).toBe('Sản phẩm SP-0038 đã được lưu.');
});
