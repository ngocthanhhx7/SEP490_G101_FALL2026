import { formatAdjustmentDelta, adjustmentReasonText } from '../../src/utils/stock-adjustment-format.js';
test('formats a signed adjustment and the lowercase history reason', () => {
  expect(formatAdjustmentDelta(-2)).toBe('−2'); expect(formatAdjustmentDelta(1200)).toBe('+1.200');
  expect(adjustmentReasonText('DAMAGED')).toBe('hàng hỏng');
  expect(adjustmentReasonText('RECEIPT_CORRECTION')).toBe('phiếu nhập ghi sai');
  expect(adjustmentReasonText('UNKNOWN')).toBe('');
});
