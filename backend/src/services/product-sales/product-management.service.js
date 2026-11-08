import { productSalesModels } from '../../models/product.model.js';
import {
  PRODUCT_CODE_COUNTER_ID, PRODUCT_CODE_PREFIX, PRODUCT_CODE_MAX_NUMBER
} from '../../constants/product-fields.js';
import { parseAdminProductQuery, parseCreateProduct, parseUpdateProduct, parseDeleteProduct } from '../../validators/product-management.validator.js';
import { AppError } from '../../utils/app-error.js';
import { parseObjectId } from '../../validators/product.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { paginate } from '../pagination.service.js';
import { productSalesErrors, requireProductManager } from './product-sales-errors.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CODE_SHAPE = /^SP-\d{4}$/u;

// Stock is deliberately not part of this DTO: Product Management never shows or changes it.
export function toAdminProduct(doc) {
  return {
    id: String(doc._id),
    code: doc.code,
    name: doc.name,
    category: doc.category,
    petType: doc.petType,
    description: doc.description ?? '',
    photos: doc.photos ?? [],
    sellingPrice: doc.sellingPrice,
    visible: doc.visible === true,
    // The version of the details (name, price, ...), not the stock version; products made before it existed count as 0.
    version: doc.detailsVersion ?? 0,
    updatedAt: doc.updatedAt ?? null
  };
}

// Product Management for whoever PRODUCT_PERMISSIONS allows (R3 UC-57). Deletion retains its audit and code, and cannot discard stock or order history.
export function createProductManagementService({ connection }) {
  const { Product, ProductCounter, ProductOrder } = productSalesModels(connection);
  const unitOfWork = createUnitOfWork(connection);

  // The next SP-xxxx, handed out in the same transaction as the insert so a failed save leaves no gap.
  // The counter never falls behind the highest code in use (the demo products were created with their codes).
  async function nextCode(session) {
    const [last] = await Product.find({ code: CODE_SHAPE }).sort({ code: -1 }).limit(1).session(session).lean();
    const floor = last ? Number(last.code.slice(PRODUCT_CODE_PREFIX.length)) : 0;
    const counter = await ProductCounter.findOneAndUpdate({ _id: PRODUCT_CODE_COUNTER_ID },
      [{ $set: { value: { $add: [{ $max: [{ $ifNull: ['$value', 0] }, floor] }, 1] } } }],
      { upsert: true, returnDocument: 'after', updatePipeline: true, session });
    if (counter.value > PRODUCT_CODE_MAX_NUMBER) throw productSalesErrors.productCodesExhausted();
    return `${PRODUCT_CODE_PREFIX}${String(counter.value).padStart(4, '0')}`;
  }

  return Object.freeze({
    // Every product, hidden ones too. Search is a part of the name or of the code, whatever the case.
    async list(actor, query) {
      requireProductManager(actor);
      const { search, category, petType, page, limit } = parseAdminProductQuery(query);
      const filter = { deletedAt: null };
      if (category) filter.category = category;
      if (petType) filter.petType = petType;
      if (search) {
        const pattern = { $regex: escapeRegex(search), $options: 'i' };
        filter.$or = [{ name: pattern }, { code: pattern }];
      }
      // Code is globally unique; keep filtered shapes unchanged after skew benchmarks.
      const sort = search || category || petType ? { code: 1, _id: 1 } : { code: 1 };
      const result = await paginate(Product, { filter, sort, page, limit });
      const [summary] = await Product.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: null, total: { $sum: 1 },
          visible: { $sum: { $cond: [{ $eq: ['$visible', true] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $lte: [{ $subtract: [{ $ifNull: ['$stockOnHand', 0] }, { $ifNull: ['$quantityHeld', 0] }] }, 0] }, 1, 0] } }
        } }
      ]);
      const total = summary?.total ?? 0, visible = summary?.visible ?? 0;
      return { ...result, items: result.items.map(toAdminProduct),
        summary: { total, visible, hidden: total - visible, outOfStock: summary?.outOfStock ?? 0 } };
    },
    async read(actor, productId) {
      requireProductManager(actor);
      const doc = await Product.findOne({ _id: parseObjectId(productId, 'productId'), deletedAt: null }).lean();
      if (!doc) throw productSalesErrors.notFound();
      return toAdminProduct(doc);
    },
    // A new product is saved Hidden with no stock; the Admin shows it later (R3 UC-57).
    async create(actor, body) {
      requireProductManager(actor);
      const values = parseCreateProduct(body);
      const created = await unitOfWork.run(async (session) => {
        const code = await nextCode(session);
        const [doc] = await Product.create([{ ...values, code, visible: false, stockOnHand: 0, quantityHeld: 0, photos: [], version: 0, detailsVersion: 0 }], { session });
        return doc.toObject();
      });
      return toAdminProduct(created);
    },
    // Only what the Admin sent changes. The update matches the version the Admin saw, so a second Admin cannot overwrite the first.
    async update(actor, productId, body) {
      requireProductManager(actor);
      const id = parseObjectId(productId, 'productId');
      const { version, ...changes } = parseUpdateProduct(body);
      const seen = version === 0 ? { $or: [{ detailsVersion: 0 }, { detailsVersion: { $exists: false } }] } : { detailsVersion: version };
      const updated = await Product.findOneAndUpdate({ _id: id, deletedAt: null, ...seen },
        { $set: changes, $inc: { detailsVersion: 1 } }, { returnDocument: 'after' }).lean();
      if (updated) return toAdminProduct(updated);
      if (!(await Product.exists({ _id: id, deletedAt: null }))) throw productSalesErrors.notFound();
      throw productSalesErrors.versionConflict();
    },
    async remove(actor, productId, body) {
      const deletedBy = requireProductManager(actor);
      const id = parseObjectId(productId, 'productId');
      const { version, reason } = parseDeleteProduct(body);
      return unitOfWork.run(async session => {
        const product = await Product.findOne({ _id: id, deletedAt: null }).session(session).lean();
        if (!product) throw productSalesErrors.notFound();
        if ((product.detailsVersion ?? 0) !== version) throw productSalesErrors.versionConflict();
        const hasOrders = Boolean(await ProductOrder.exists({ 'lines.productId': id }).session(session));
        const hasStock = product.stockOnHand > 0 || product.quantityHeld > 0;
        if (hasOrders || hasStock) throw new AppError(409, 'PRODUCT_DELETE_BLOCKED',
          'Hide this product instead: it has stock, reserved stock or order history.', { hasOrders, hasStock });
        // Shares a write lock with order reservations and stock changes; transaction retry rechecks history.
        const updated = await Product.updateOne({ _id: id, deletedAt: null, version: product.version ?? { $exists: false } },
          { $set: { visible: false, deletedAt: new Date(), deletedBy, deletionReason: reason },
            $inc: { version: 1, detailsVersion: 1 } }, { session });
        if (updated.modifiedCount !== 1) throw productSalesErrors.versionConflict();
        return { id: String(id), deleted: true };
      });
    }
  });
}
