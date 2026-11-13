import { AppError } from '../../utils/app-error.js';
import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import { paginate } from '../pagination.service.js';
import { normalizeVietnamPhone } from '../sms-template.service.js';
import { canonicalizeContact } from '../contact-crypto.service.js';
import { parseCounterContact, parseCounterPreview, parseCounterProductQuery } from '../../validators/counter-sale.validator.js';
import { priceProductOrder, sellableQuantity } from './product-order-pricing.js';
import { productSalesErrors, requireCounterSeller } from './product-sales-errors.js';

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function createCounterCatalogService({ connection, contacts, eligibility }) {
  const { Product } = productSalesModels(connection);
  const User = userModel(connection);
  return Object.freeze({
    async products(actor, query) {
      requireCounterSeller(actor);
      const { page, limit, search } = parseCounterProductQuery(query);
      const filter = { visible: true, deletedAt: null };
      if (search) filter.$or = ['name', 'code'].map(field => ({ [field]: { $regex: escapeRegex(search), $options: 'i' } }));
      const result = await paginate(Product, { filter, page, limit, sort: { code: 1, _id: 1 } });
      return { ...result, items: result.items.map(p => ({ id: String(p._id), code: p.code, name: p.name,
        sellingPrice: p.sellingPrice, available: sellableQuantity(p) })) };
    },
    async preview(actor, body) {
      requireCounterSeller(actor);
      const input = parseCounterPreview(body);
      const lines = [];
      for (const line of input.lines) {
        const p = await Product.findOne({ _id: line.productId, visible: true, deletedAt: null }).lean();
        if (!p) throw productSalesErrors.unavailable(line.productId);
        const available = sellableQuantity(p);
        if (line.quantity > available) throw productSalesErrors.exceedsAvailable(line.productId, available);
        lines.push({ productId: String(p._id), productCode: p.code, productName: p.name,
          quantity: line.quantity, unitPrice: p.sellingPrice, available });
      }
      const pricing = await eligibility.readCounterCustomer(input.customerId);
      const totals = priceProductOrder({ lines, receiveMethod: 'COUNTER', discountBps: pricing.discountBps, allowEmpty: true });
      return { subtotal: totals.subtotal, shippingFee: totals.shippingFee, total: totals.total,
        tierDiscount: totals.tierDiscount, tierCode: pricing.tierCode, customerId: input.customerId ?? null,
        lines: lines.map((line, i) => ({ ...line, lineTotal: totals.lineTotals[i] })) };
    },
    async lookup(actor, body) {
      requireCounterSeller(actor);
      const value = parseCounterContact(body), email = value.includes('@');
      let canonical;
      try { canonical = email ? canonicalizeContact('EMAIL', value) : normalizeVietnamPhone(value); } catch { /* field error below */ }
      if (!canonical) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid contact', { fields: { contact: email ? 'EMAIL' : 'PHONE' } });
      const ids = await (email ? contacts.userIdsByEmail(canonical) : contacts.userIdsByPhone(canonical));
      const user = await User.findOne({ _id: { $in: ids }, state: 'ACTIVE', roles: 'CUSTOMER' }).select('displayName').lean();
      if (!user) return { customer: null };
      const { tierCode } = await eligibility.readCounterCustomer(user._id);
      return { customer: { id: String(user._id), displayName: user.displayName, tierCode } };
    }
  });
}
