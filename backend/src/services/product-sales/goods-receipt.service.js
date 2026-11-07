import { createHash } from 'node:crypto';
import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import { GOODS_RECEIPT_COUNTER_ID, GOODS_RECEIPT_CODE_PREFIX, GOODS_RECEIPT_LIMITS } from '../../constants/goods-receipt-fields.js';
import {
  parseCreateReceipt, parseReceiptCode, parseRecentReceiptsQuery, parseReceiptProductQuery
} from '../../validators/goods-receipt.validator.js';
import { parseIdempotencyKey } from '../../validators/product-order.validator.js';
import { vietnamDate } from '../../utils/vietnam-date.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';
import { paginate } from '../pagination.service.js';
import { productSalesErrors, requireReceiptRecorder } from './product-sales-errors.js';

const DUPLICATE_KEY = 11000;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Suppliers are listed in Vietnamese letter order, as on the Supplier Management screen.
const NAME_ORDER = Object.freeze({ locale: 'vi' });

const toLine = (line) => ({
  productId: String(line.productId),
  productCode: line.productCode,
  productName: line.productName,
  quantityReceived: line.quantityReceived,
  quantityAccepted: line.quantityAccepted,
  quantityRejected: line.quantityRejected,
  rejectReason: line.rejectReason ?? ''
});

// What the list of recent receipts shows.
export function toReceiptSummary(doc) {
  return {
    id: String(doc._id),
    code: doc.code,
    supplierName: doc.supplierName,
    receivedOn: doc.receivedOn,
    recordedAt: doc.createdAt ?? null,
    totalReceived: doc.totalReceived,
    totalAccepted: doc.totalAccepted,
    totalRejected: doc.totalRejected
  };
}

export function toReceipt(doc) {
  return { ...toReceiptSummary(doc), supplierId: String(doc.supplierId), recorderName: doc.recorderName, lines: doc.lines.map(toLine) };
}

// What was sent, after cleaning: the same key with the same content is a repeat, with other content it is a mistake.
const fingerprintOf = (recorderId, input) => createHash('sha256').update(JSON.stringify([
  recorderId, input.supplierId.toLowerCase(),
  input.lines.map((line) => [line.productId.toLowerCase(), line.quantityReceived, line.quantityAccepted, line.rejectReason])
])).digest('hex');

// Goods Receipt for whoever PRODUCT_PERMISSIONS.RECORD_GOODS_RECEIPTS allows (R3 UC-70). A receipt is never edited or deleted.
// Reading the suppliers and the products here is part of that permission, so a Sale Staff does not need to manage either.
export function createGoodsReceiptService({ connection, clock = Date.now, notifications }) {
  const { Product, Supplier, GoodsReceipt, ProductCounter } = productSalesModels(connection);
  const User = userModel(connection);
  const unitOfWork = createUnitOfWork(connection);
  const notice = notifications ?? createDomainNotifications({ connection, clock: () => new Date(clock()).getTime() });

  // The next PN-xxxx, handed out in the same transaction as the receipt so a failed save leaves no gap. The counter never
  // falls behind the highest number in use. From PN-10000 the code simply has five digits.
  async function nextNumber(session) {
    const [last] = await GoodsReceipt.find().sort({ number: -1 }).limit(1).session(session).lean();
    const counter = await ProductCounter.findOneAndUpdate({ _id: GOODS_RECEIPT_COUNTER_ID },
      [{ $set: { value: { $add: [{ $max: [{ $ifNull: ['$value', 0] }, last?.number ?? 0] }, 1] } } }],
      { upsert: true, returnDocument: 'after', updatePipeline: true, session });
    return counter.value;
  }

  // The receipt is checked against its schema, then inserted through the driver. When a Mongoose transaction fails it resets
  // the documents it created, and on this schema's strict sub-documents that reset throws a StrictModeError for `__v` that
  // hides the real error (a duplicate key, a failed notice). A driver insert is not tracked, so the real error comes through.
  async function insertReceipt(values, session, now) {
    const checked = new GoodsReceipt(values);
    await checked.validate();
    const plain = { ...checked.toObject(), createdAt: now, updatedAt: now };
    await GoodsReceipt.collection.insertOne(plain, { session });
    return plain;
  }

  // The receipt an earlier request with this key saved (D-218), or null. The key belongs to the recorder who sent it.
  async function replay(recorderId, key, fingerprint, session) {
    const existing = await GoodsReceipt.findOne({ recorderId, idempotencyKey: key }).session(session).lean();
    if (!existing) return null;
    if (existing.requestFingerprint !== fingerprint) throw productSalesErrors.receiptIdempotencyConflict();
    return existing;
  }

  return Object.freeze({
    // The suppliers that can be chosen on a new receipt: only those that still work with the shop.
    async listSuppliers(actor) {
      requireReceiptRecorder(actor);
      const docs = await Supplier.find({ status: 'ACTIVE' }).collation(NAME_ORDER).sort({ nameKey: 1, _id: 1 })
        .limit(GOODS_RECEIPT_LIMITS.suppliersMax).select('name').lean();
      return { items: docs.map((doc) => ({ id: String(doc._id), name: doc.name })) };
    },
    // AC-31 / D-262: hidden products remain receivable; deleted products are no longer in the catalog.
    async searchProducts(actor, query) {
      requireReceiptRecorder(actor);
      const { search, page, limit } = parseReceiptProductQuery(query);
      const filter = { deletedAt: null };
      if (search) {
        const pattern = { $regex: escapeRegex(search), $options: 'i' };
        filter.$or = [{ name: pattern }, { code: pattern }];
      }
      const result = await paginate(Product, { filter, sort: { code: 1, _id: 1 }, page, limit });
      return { ...result, items: result.items.map((doc) => ({ id: String(doc._id), code: doc.code, name: doc.name, visible: doc.visible === true })) };
    },
    // The newest receipts first, for the "Phiếu nhập gần đây" column.
    async listRecent(actor, query) {
      requireReceiptRecorder(actor);
      parseRecentReceiptsQuery(query);
      const docs = await GoodsReceipt.find().sort({ number: -1 }).limit(GOODS_RECEIPT_LIMITS.recentCount).lean();
      return { items: docs.map(toReceiptSummary) };
    },
    async read(actor, code) {
      requireReceiptRecorder(actor);
      const shaped = parseReceiptCode(code);
      const doc = shaped ? await GoodsReceipt.findOne({ code: shaped }).lean() : null;
      if (!doc) throw productSalesErrors.notFound();
      return toReceipt(doc);
    },
    // Saving a receipt, stock and notices are one transaction: the receipt, the stock added for what was taken into the shop,
    // and one MSG122 per rejecting line either all happen or none does. A receipt that rejects everything is still saved and
    // leaves the stock as it was. The same Idempotency-Key with the same content returns the receipt already saved (no second
    // receipt, no stock added twice); with other content it is 409 IDEMPOTENCY_CONFLICT.
    async create(actor, body, idempotencyKey) {
      const recorderId = requireReceiptRecorder(actor);
      const key = parseIdempotencyKey(idempotencyKey);
      const input = parseCreateReceipt(body);
      const fingerprint = fingerprintOf(recorderId, input);
      const recorder = await User.findById(recorderId).select('displayName').lean();
      if (!recorder) throw productSalesErrors.unauthenticated();
      const now = new Date(clock());
      try {
        const saved = await unitOfWork.run(async (session) => {
          // Looked up inside the transaction: when two requests with one key run together, the one that loses is retried and
          // finds the receipt the other saved. A repeat does not need the supplier to be active any more.
          const earlier = await replay(recorderId, key, fingerprint, session);
          if (earlier) return earlier;
          // Only a supplier that is still working with the shop. Touching it makes this save and a stop of the same
          // supplier take turns instead of both succeeding, and leaves `version` alone.
          const supplier = await Supplier.findOneAndUpdate({ _id: input.supplierId, status: 'ACTIVE' },
            { $set: { lastReceiptAt: now } }, { returnDocument: 'after', session }).lean();
          if (!supplier) {
            throw (await Supplier.exists({ _id: input.supplierId }).session(session))
              ? productSalesErrors.supplierNotActive() : productSalesErrors.supplierNotFound();
          }
          const ids = input.lines.map((line) => line.productId);
          const products = new Map((await Product.find({ _id: { $in: ids }, deletedAt: null }).session(session).lean())
            .map((doc) => [String(doc._id), doc]));
          const missing = ids.filter((id) => !products.has(id));
          if (missing.length) throw productSalesErrors.productNotFound(missing);

          const number = await nextNumber(session);
          const code = `${GOODS_RECEIPT_CODE_PREFIX}${String(number).padStart(4, '0')}`;
          const lines = input.lines.map((line) => ({ ...line,
            productCode: products.get(line.productId).code, productName: products.get(line.productId).name }));
          const total = (name) => lines.reduce((sum, line) => sum + line[name], 0);
          const receipt = await insertReceipt({ code, number, supplierId: supplier._id, supplierName: supplier.name,
            receivedOn: vietnamDate(now), recorderId, recorderName: recorder.displayName, lines,
            totalReceived: total('quantityReceived'), totalAccepted: total('quantityAccepted'), totalRejected: total('quantityRejected'),
            idempotencyKey: key, requestFingerprint: fingerprint },
          session, now);

          for (const line of lines) {
            if (line.quantityAccepted > 0) {
              const applied = await Product.updateOne({ _id: line.productId, deletedAt: null },
                { $inc: { stockOnHand: line.quantityAccepted, version: 1 } }, { session });
              if (applied.matchedCount !== 1) throw productSalesErrors.productNotFound([line.productId]);
            }
            if (line.quantityRejected > 0) {
              await notice.goodsReceiptRejected({ code, productId: line.productId, productName: line.productName,
                quantity: line.quantityRejected, reason: line.rejectReason }, session);
            }
          }
          return receipt;
        });
        return toReceipt(saved);
      } catch (error) {
        // Two saves raced for the same number (or key); nothing was written. Sending the same key again is safe: it saves
        // the receipt, or returns the one that won.
        if (error?.code === DUPLICATE_KEY) throw productSalesErrors.receiptCodeConflict();
        throw error;
      }
    }
  });
}
