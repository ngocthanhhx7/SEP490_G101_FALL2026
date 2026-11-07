import { productSalesModels } from '../../models/product.model.js';
import { PRODUCT_PERMISSIONS } from '../../constants/product-permissions.js';
import { STOCK_LOW_THRESHOLD } from '../../constants/stock-list-fields.js';
import { parseStockQuery, parseStockHistoryQuery, parseStockHistoryPosition } from '../../validators/stock-list.validator.js';
import { parseObjectId } from '../../validators/product.validator.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { paginate } from '../pagination.service.js';
import { productSalesErrors } from './product-sales-errors.js';

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// $ifNull also supports pre-default legacy product records.
const availableExpression = { $subtract: [{ $ifNull: ['$stockOnHand', 0] }, { $ifNull: ['$quantityHeld', 0] }] };
const lowExpression = { $lte: [availableExpression, STOCK_LOW_THRESHOLD] };
function requireStockViewer(actor) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles)
    || typeof actor.userId !== 'string' || !/^[a-f\d]{24}$/iu.test(actor.userId)) throw productSalesErrors.unauthenticated();
  if (!actor.roles.some(role => PRODUCT_PERMISSIONS.VIEW_STOCK.includes(role))) throw productSalesErrors.forbidden();
}
function toStock(doc) {
  const stockOnHand = doc.stockOnHand ?? 0, quantityHeld = doc.quantityHeld ?? 0;
  const available = stockOnHand - quantityHeld;
  return { id: String(doc._id), code: doc.code, name: doc.name, stockOnHand, quantityHeld, available,
    status: available === 0 ? 'OUT_OF_STOCK' : available <= STOCK_LOW_THRESHOLD ? 'LOW_STOCK' : 'IN_STOCK' };
}

// Read models only: no stock reservation, receipt write, or order lifecycle changes.
export function createStockListService({ connection, cursorSecret, clock = Date.now }) {
  const { Product, GoodsReceipt } = productSalesModels(connection);
  // Lazy initialization preserves composition for other product modules that do not use history.
  let historyCursor;
  const cursorCodec = () => (historyCursor ??= createScopedCursor({ secret: cursorSecret, namespace: 'stock-receipt-history', clock }));
  return Object.freeze({
    async list(actor, query) {
      requireStockViewer(actor);
      const { tab, search, page, limit } = parseStockQuery(query);
      const filter = { deletedAt: null };
      if (tab === 'LOW_STOCK') filter.$expr = lowExpression;
      if (search) {
        const pattern = { $regex: escapeRegex(search), $options: 'i' };
        filter.$or = [{ name: pattern }, { code: pattern }];
      }
      const [result, all, low] = await Promise.all([
        paginate(Product, { filter, sort: { code: 1, _id: 1 }, page, limit }),
        Product.countDocuments({ deletedAt: null }),
        Product.countDocuments({ deletedAt: null, $expr: lowExpression })
      ]);
      return { ...result, items: result.items.map(toStock), counts: { ALL: all, LOW_STOCK: low } };
    },
    async history(actor, productId, query) {
      requireStockViewer(actor);
      const id = parseObjectId(productId, 'productId');
      const { limit, cursor } = parseStockHistoryQuery(query);
      const product = await Product.findOne({ _id: id, deletedAt: null }).lean();
      if (!product) throw productSalesErrors.notFound();
      const context = { actor: actor.userId, product: String(product._id) };
      const filter = { 'lines.productId': id };
      if (cursor) {
        const position = parseStockHistoryPosition(cursorCodec().decode(cursor, context));
        filter.$or = [{ createdAt: { $lt: position.createdAt } }, { createdAt: position.createdAt, _id: { $lt: position.id } }];
      }
      const receipts = await GoodsReceipt.find(filter, { code: 1, createdAt: 1, receivedOn: 1, supplierName: 1,
        lines: { $elemMatch: { productId: id } } }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
      const shown = receipts.slice(0, limit), last = shown.at(-1);
      return { product: toStock(product), items: shown.map(receipt => ({ id: String(receipt._id), kind: 'GOODS_RECEIPT',
        referenceCode: receipt.code, occurredAt: receipt.createdAt.toISOString(), receivedOn: receipt.receivedOn,
        supplierName: receipt.supplierName, quantityChange: receipt.lines[0].quantityAccepted })),
      nextCursor: receipts.length > limit ? cursorCodec().encode({ id: String(last._id), createdAt: last.createdAt.toISOString() }, context) : null };
    }
  });
}
