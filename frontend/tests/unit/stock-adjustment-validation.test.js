import { parseAdjustmentQuantity, validateAdjustmentForm, previewAdjustmentStock } from '../../src/utils/stock-adjustment-validation.js';
const product = { stockOnHand: 9, quantityHeld: 1, available: 8 };
test('AC-33 requires quantity and reason without preselecting a business reason', () => {
  expect(validateAdjustmentForm({ product: null, type: 'DECREASE', quantity: '', reason: '' })).toEqual({ productId: 'REQUIRED', quantity: 'INVALID', reason: 'REQUIRED' });
  expect(validateAdjustmentForm({ product, type: 'DECREASE', quantity: '2', reason: '' }).reason).toBe('REQUIRED');
  expect(validateAdjustmentForm({ product, type: 'DECREASE', quantity: '9', reason: 'DAMAGED' }).quantity).toBe('EXCEEDS_AVAILABLE');
  expect(validateAdjustmentForm({ product, type: 'INCREASE', quantity: '9', reason: 'DAMAGED' })).toEqual({});
  for (const raw of ['', '0', '-1', '1.1', '1e2', 'letters']) expect(parseAdjustmentQuantity(raw)).toEqual({ error: 'INVALID' });
  expect(parseAdjustmentQuantity('100001')).toEqual({ error: 'TOO_LARGE' });
  expect(parseAdjustmentQuantity('100000')).toEqual({ value: 100000 });
});
test('previews only valid stock quantities and never submits preview as authority', () => {
  expect(previewAdjustmentStock(product,'DECREASE','2')).toBe(7);
  expect(previewAdjustmentStock(product,'INCREASE','2')).toBe(11);
  for (const [p,t,q] of [[null,'DECREASE','2'],[product,'DECREASE',''],[product,'DECREASE','9'],[product,'OTHER','2'],[{ ...product, stockOnHand:Number.MAX_SAFE_INTEGER },'INCREASE','1']]) {
    expect(previewAdjustmentStock(p,t,q)).toBeNull();
  }
});
