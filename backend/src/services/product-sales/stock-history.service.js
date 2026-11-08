import { productSalesModels } from '../../models/product.model.js';
import { parseStockHistoryPosition } from '../../validators/stock-list.validator.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';

// A total order across collections, including deliberately identical timestamps and ObjectIds.
function afterPosition(position, kind) {
  const conditions = [{ createdAt: { $lt: position.createdAt } }, { createdAt: position.createdAt, _id: { $lt: position.id } }];
  if (kind < (position.kind ?? 'GOODS_RECEIPT')) conditions.push({ createdAt: position.createdAt, _id: position.id });
  return { $or: conditions };
}
function newestFirst(a, b) {
  const time = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  if (time) return time;
  if (a.id !== b.id) return a.id > b.id ? -1 : 1;
  return a.kind === b.kind ? 0 : a.kind > b.kind ? -1 : 1;
}

export function createStockHistoryService({ connection, cursorSecret, clock = Date.now }) {
  const { GoodsReceipt, StockAdjustment } = productSalesModels(connection);
  let codec;
  const cursorCodec = () => (codec ??= createScopedCursor({ secret: cursorSecret, namespace: 'stock-receipt-history', clock }));
  return Object.freeze({
    async page({ actorId, productId, limit, cursor }) {
      const context = { actor: actorId, product: productId };
      const position = cursor ? parseStockHistoryPosition(cursorCodec().decode(cursor, context)) : null;
      const receiptFilter = { 'lines.productId': productId, ...(position ? afterPosition(position, 'GOODS_RECEIPT') : {}) };
      const adjustmentFilter = { productId, ...(position ? afterPosition(position, 'STOCK_ADJUSTMENT') : {}) };
      const [receipts, adjustments] = await Promise.all([
        GoodsReceipt.find(receiptFilter, { code: 1, createdAt: 1, receivedOn: 1, supplierName: 1,
          lines: { $elemMatch: { productId } } }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean(),
        StockAdjustment.find(adjustmentFilter, { code: 1, createdAt: 1, type: 1, quantity: 1, reason: 1, recorderName: 1 })
          .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean()
      ]);
      const candidates = [
        ...receipts.map(doc => ({ id: String(doc._id), kind: 'GOODS_RECEIPT', referenceCode: doc.code,
          occurredAt: doc.createdAt.toISOString(), receivedOn: doc.receivedOn, supplierName: doc.supplierName, quantityChange: doc.lines[0].quantityAccepted })),
        ...adjustments.map(doc => ({ id: String(doc._id), kind: 'STOCK_ADJUSTMENT', referenceCode: doc.code,
          occurredAt: doc.createdAt.toISOString(), reason: doc.reason, recorderName: doc.recorderName,
          quantityChange: doc.type === 'INCREASE' ? doc.quantity : -doc.quantity }))
      ].sort(newestFirst);
      const items = candidates.slice(0, limit), last = items.at(-1);
      return { items, nextCursor: candidates.length > limit
        ? cursorCodec().encode({ id: last.id, createdAt: last.occurredAt, kind: last.kind }, context) : null };
    }
  });
}
