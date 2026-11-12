import { createHash } from 'node:crypto';
import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import { PRODUCT_PERMISSIONS } from '../../constants/product-permissions.js';
import { STOCK_ADJUSTMENT_COUNTER_ID, STOCK_ADJUSTMENT_CODE_PREFIX, STOCK_ADJUSTMENT_LIMITS } from '../../constants/stock-adjustment-fields.js';
import { parseStockAdjustment, parseAdjustmentQuery, parseAdjustmentProductQuery } from '../../validators/stock-adjustment.validator.js';
import { parseObjectId } from '../../validators/product.validator.js';
import { parseIdempotencyKey } from '../../validators/product-order.validator.js';
import { AppError } from '../../utils/app-error.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { paginate } from '../pagination.service.js';
import { productSalesErrors } from './product-sales-errors.js';

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function requireAdjuster(actor) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles) || typeof actor.userId !== 'string'
    || !/^[a-f\d]{24}$/iu.test(actor.userId)) throw productSalesErrors.unauthenticated();
  if (!actor.roles.some(role => PRODUCT_PERMISSIONS.ADJUST_STOCK.includes(role))) throw productSalesErrors.forbidden();
  return actor.userId;
}
const quantityChange = input => input.type === 'INCREASE' ? input.quantity : -input.quantity;
const capacityError = () => new AppError(422, 'VALIDATION_FAILED', 'Stock exceeds the technical limit', { fields: { quantity: 'TOO_LARGE' } });
function toAdjustment(doc) {
  return { id: String(doc._id), code: doc.code, productId: String(doc.productId), productCode: doc.productCode, productName: doc.productName,
    type: doc.type, quantity: doc.quantity, quantityChange: quantityChange(doc), reason: doc.reason,
    recorderId: String(doc.recorderId), recorderName: doc.recorderName, recordedAt: doc.createdAt };
}
function toProduct(doc) {
  const stockOnHand = doc.stockOnHand ?? 0, quantityHeld = doc.quantityHeld ?? 0;
  return { id: String(doc._id), code: doc.code, name: doc.name, visible: doc.visible === true,
    stockOnHand, quantityHeld, available: stockOnHand - quantityHeld };
}
const codeConflict = () => new AppError(409, 'STOCK_ADJUSTMENT_CODE_CONFLICT', 'Adjustment code conflicts; retry with the same key');

// Immutable adjustments and their stock effect are committed together. No hold or order writes occur here.
export function createStockAdjustmentService({ connection, clock = Date.now }) {
  const { Product, StockAdjustment, ProductCounter } = productSalesModels(connection);
  const User = userModel(connection), unitOfWork = createUnitOfWork(connection);
  async function replay(recorderId, key, fingerprint, session) {
    const doc = await StockAdjustment.findOne({ recorderId, idempotencyKey: key }).session(session ?? null).lean();
    if (doc && doc.requestFingerprint !== fingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Key used with different adjustment content');
    return doc;
  }
  async function nextNumber(session) {
    const [last] = await StockAdjustment.find().sort({ number: -1 }).limit(1).session(session).lean();
    const current = await ProductCounter.findById(STOCK_ADJUSTMENT_COUNTER_ID).session(session).lean();
    if (Math.max(current?.value ?? 0, last?.number ?? 0) >= Number.MAX_SAFE_INTEGER) throw capacityError();
    const counter = await ProductCounter.findOneAndUpdate({ _id: STOCK_ADJUSTMENT_COUNTER_ID },
      [{ $set: { value: { $add: [{ $max: [{ $ifNull: ['$value', 0] }, last?.number ?? 0] }, 1] } } }],
      { upsert: true, returnDocument: 'after', updatePipeline: true, session });
    return counter.value;
  }
  async function applyStock(input, session) {
    const condition = input.type === 'DECREASE'
      ? { $gte: [{ $subtract: [{ $ifNull: ['$stockOnHand', 0] }, { $ifNull: ['$quantityHeld', 0] }] }, input.quantity] }
      : { $lte: [{ $ifNull: ['$stockOnHand', 0] }, Number.MAX_SAFE_INTEGER - input.quantity] };
    const updated = await Product.findOneAndUpdate({ _id: input.productId, deletedAt: null, $expr: condition },
      { $inc: { stockOnHand: quantityChange(input), version: 1 } }, { returnDocument: 'after', session }).lean();
    if (updated) return updated;
    const current = await Product.findOne({ _id: input.productId, deletedAt: null }).session(session).lean();
    if (!current) throw productSalesErrors.productNotFound([input.productId]);
    if (input.type === 'INCREASE') throw capacityError();
    throw new AppError(409, 'STOCK_ADJUSTMENT_EXCEEDS_AVAILABLE', 'Decrease exceeds available stock',
      { available: (current.stockOnHand ?? 0) - (current.quantityHeld ?? 0) });
  }
  return Object.freeze({
    async searchProducts(actor, query) {
      requireAdjuster(actor);
      const { search, page, limit } = parseAdjustmentProductQuery(query), filter = { deletedAt: null };
      if (search) {
        const pattern = { $regex: escapeRegex(search), $options: 'i' };
        filter.$or = [{ name: pattern }, { code: pattern }];
      }
      const result = await paginate(Product, { filter, page, limit, sort: { code: 1, _id: 1 } });
      return { ...result, items: result.items.map(doc => ({ id: String(doc._id), code: doc.code, name: doc.name, visible: doc.visible === true })) };
    },
    async readProduct(actor, productId) {
      requireAdjuster(actor);
      const doc = await Product.findOne({ _id: parseObjectId(productId, 'productId'), deletedAt: null }).lean();
      if (!doc) throw productSalesErrors.notFound();
      return toProduct(doc);
    },
    async list(actor, query) {
      requireAdjuster(actor);
      const { page, limit } = parseAdjustmentQuery(query);
      const result = await paginate(StockAdjustment, { page, limit, sort: { createdAt: -1, _id: -1 } });
      return { ...result, items: result.items.map(toAdjustment) };
    },
    async create(actor, body, commandKey) {
      const recorderId = requireAdjuster(actor), key = parseIdempotencyKey(commandKey), input = parseStockAdjustment(body);
      const fingerprint = createHash('sha256').update(JSON.stringify([recorderId, input.productId, input.type, input.quantity, input.reason])).digest('hex');
      const now = new Date(clock());
      for (let attempt = 0; attempt <= STOCK_ADJUSTMENT_LIMITS.conflictRetries; attempt++) {
        try {
          const doc = await unitOfWork.run(async session => {
            const earlier = await replay(recorderId, key, fingerprint, session);
            if (earlier) return earlier;
            const recorder = await User.findById(recorderId).select('displayName roles state').session(session).lean();
            if (!recorder) throw productSalesErrors.unauthenticated();
            requireAdjuster({ ...recorder, userId: recorderId });
            const product = await applyStock(input, session), number = await nextNumber(session);
            const checked = new StockAdjustment({ ...input, number, code: `${STOCK_ADJUSTMENT_CODE_PREFIX}${String(number).padStart(4, '0')}`,
              productCode: product.code, productName: product.name, recorderId, recorderName: recorder.displayName,
              idempotencyKey: key, requestFingerprint: fingerprint });
            await checked.validate();
            // A driver insert preserves the original transaction error under the existing strict schema options.
            const plain = { ...checked.toObject(), createdAt: now, updatedAt: now };
            await StockAdjustment.collection.insertOne(plain, { session });
            return plain;
          });
          return toAdjustment(doc);
        } catch (error) {
          if (error?.code !== 11000) throw error;
          const earlier = await replay(recorderId, key, fingerprint);
          if (earlier) return toAdjustment(earlier);
          if (attempt === STOCK_ADJUSTMENT_LIMITS.conflictRetries) throw codeConflict();
        }
      }
    }
  });
}
