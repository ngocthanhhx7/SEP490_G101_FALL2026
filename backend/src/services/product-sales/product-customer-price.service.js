import { priceProductOrder } from './product-order-pricing.js';
import { requireCustomer } from './product-sales-errors.js';

export function createProductCustomerPriceService({ catalog, eligibility }) {
  return Object.freeze({
    async read(actor, productId) {
      const customerId = requireCustomer(actor);
      const { sellingPrice: unitPrice } = await catalog.read(productId);
      const { tierCode, discountBps } = await eligibility.read(customerId);
      const { unitDiscounts: [unitDiscount] } = priceProductOrder({
        lines: [{ unitPrice, quantity: 1 }], discountBps
      });
      return { unitPrice, unitDiscount, discountedUnitPrice: unitPrice - unitDiscount, tierCode, discountBps };
    }
  });
}
