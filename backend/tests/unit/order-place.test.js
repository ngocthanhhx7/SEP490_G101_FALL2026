import { describe, expect, test } from '@jest/globals';
import { parsePlaceOrder } from '../../src/validators/product-order.validator.js';

const id = 'a'.repeat(24);
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('ORDER-IN-02 parsePlaceOrder', () => {
  test('accepts DELIVERY/COD with address and PICKUP/PAY_AT_SHOP without address', () => {
    expect(parsePlaceOrder({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: id })).toEqual({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: id });
    expect(parsePlaceOrder({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' })).toEqual({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' });
  });
  test.each([undefined, null, ''])('returns ADDRESS_REQUIRED for missing delivery address %p', (addressId) => {
    const body = addressId === undefined ? { receiveMethod: 'DELIVERY', paymentMethod: 'COD' } : { receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId };
    expect(code(() => parsePlaceOrder(body))).toBe('ADDRESS_REQUIRED');
  });
  test.each([
    { receiveMethod: 'SHIP', paymentMethod: 'COD' },
    { receiveMethod: 'DELIVERY', paymentMethod: 'PAY_AT_SHOP', addressId: id },
    { receiveMethod: 'PICKUP', paymentMethod: 'COD' },
    { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', addressId: id },
    { receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: 'bad' },
    { receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', total: 1 },
    { receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: id, stockOnHand: 1 },
    { paymentMethod: 'COD' },
    { receiveMethod: 'DELIVERY' },
  ])('rejects invalid order DTO %p', (body) => {
    expect(code(() => parsePlaceOrder(body))).toBe('VALIDATION_FAILED');
  });
});
