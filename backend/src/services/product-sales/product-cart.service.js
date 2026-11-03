import { productSalesModels } from '../../models/product.model.js';
import { PRODUCT_LIMITS, PRODUCT_DEMO_SHIPPING_FEE_VND } from '../../constants/product-fields.js';
import { parseAddCartLine, parseSetCartLine, parseRemoveCartLine } from '../../validators/product-cart.validator.js';
import { sellableQuantity } from './product-order-pricing.js';
import { productSalesErrors, requireCustomer } from './product-sales-errors.js';

export function createProductCartService({ connection }) {
  const { Product, ProductCart } = productSalesModels(connection);

  async function view(customerId) {
    const cart = await ProductCart.findOne({ customerId }).lean();
    const lines = cart?.lines ?? [];
    const products = lines.length
      ? await Product.find({ _id: { $in: lines.map((line) => line.productId) } }).lean() : [];
    const byId = new Map(products.map((product) => [String(product._id), product]));
    const items = lines.map((line) => {
      const product = byId.get(String(line.productId));
      const purchasable = Boolean(product?.visible);
      const available = purchasable ? sellableQuantity(product) : 0;
      return {
        productId: String(line.productId),
        code: product?.code ?? null,
        name: product?.name ?? null,
        category: product?.category ?? null,
        petType: product?.petType ?? null,
        photos: product?.photos ?? [],
        unitPrice: product?.sellingPrice ?? 0,
        quantity: line.quantity,
        lineTotal: (product?.sellingPrice ?? 0) * line.quantity,
        available,
        purchasable,
        exceedsAvailable: line.quantity > available
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    // deliveryFee is informational for the checkout preview; the placed order carries the authoritative amounts.
    return { lines: items, lineCount: items.length, subtotal, total: subtotal, deliveryFee: PRODUCT_DEMO_SHIPPING_FEE_VND,
      hasUnavailable: items.some((item) => item.exceedsAvailable) };
  }

  // A hidden or missing product is treated as not found; a product with nothing sellable is out of stock (MSG98).
  async function sellableProduct(productId) {
    const product = await Product.findOne({ _id: productId, visible: true }).lean();
    if (!product) throw productSalesErrors.notFound();
    const available = sellableQuantity(product);
    if (available <= 0) throw productSalesErrors.outOfStock(productId);
    return { product, available };
  }

  return Object.freeze({
    async read(actor) {
      return view(requireCustomer(actor));
    },
    // Adds to the existing quantity; nothing is reserved until an order is placed (GBR-35).
    async addLine(actor, body) {
      const customerId = requireCustomer(actor);
      const { productId, quantity } = parseAddCartLine(body);
      const { available } = await sellableProduct(productId);
      await ProductCart.updateOne({ customerId }, { $setOnInsert: { customerId, lines: [], version: 0 } }, { upsert: true });
      const cart = await ProductCart.findOne({ customerId }).lean();
      const existing = cart.lines.find((line) => String(line.productId) === productId);
      const next = (existing?.quantity ?? 0) + quantity;
      if (next > available) throw productSalesErrors.exceedsAvailable(productId, available);
      if (existing) {
        await ProductCart.updateOne({ customerId, 'lines.productId': productId },
          { $set: { 'lines.$.quantity': next }, $inc: { version: 1 } });
      } else {
        if (cart.lines.length >= PRODUCT_LIMITS.maxCartLines) throw productSalesErrors.cartFull();
        await ProductCart.updateOne({ customerId, 'lines.productId': { $ne: productId } },
          { $push: { lines: { productId, quantity } }, $inc: { version: 1 } });
      }
      return view(customerId);
    },
    async setLine(actor, productId, body) {
      const customerId = requireCustomer(actor);
      const input = parseSetCartLine(productId, body);
      const { available } = await sellableProduct(input.productId);
      if (input.quantity > available) throw productSalesErrors.exceedsAvailable(input.productId, available);
      const result = await ProductCart.updateOne({ customerId, 'lines.productId': input.productId },
        { $set: { 'lines.$.quantity': input.quantity }, $inc: { version: 1 } });
      if (result.matchedCount === 0) throw productSalesErrors.cartLineNotFound();
      return view(customerId);
    },
    // Removing an absent line is a no-op, so retries are safe.
    async removeLine(actor, productId) {
      const customerId = requireCustomer(actor);
      const input = parseRemoveCartLine(productId);
      await ProductCart.updateOne({ customerId }, { $pull: { lines: { productId: input.productId } }, $inc: { version: 1 } });
      return view(customerId);
    }
  });
}
