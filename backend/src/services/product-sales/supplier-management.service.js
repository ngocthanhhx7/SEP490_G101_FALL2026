import { productSalesModels } from '../../models/product.model.js';
import {
  parseSupplierQuery, parseCreateSupplier, parseUpdateSupplier, parseSupplierVersion, requireContact
} from '../../validators/supplier-management.validator.js';
import { parseObjectId } from '../../validators/product.validator.js';
import { paginate } from '../pagination.service.js';
import { productSalesErrors, requireSupplierManager } from './product-sales-errors.js';

const DUPLICATE_KEY = 11000;
// Suppliers are listed in Vietnamese letter order: D, then Đ, then E; a, ă, â. Only the order uses it; names are still compared by `nameKey`.
const NAME_ORDER = Object.freeze({ locale: 'vi' });

// The supplier as the list shows it: how many products it supplies, not which.
export function toSupplier(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    contactName: doc.contactName ?? '',
    phone: doc.phone ?? '',
    email: doc.email ?? '',
    status: doc.status,
    productCount: (doc.productIds ?? []).length,
    version: doc.version ?? 0,
    updatedAt: doc.updatedAt ?? null
  };
}

// Supplier Management for whoever PRODUCT_PERMISSIONS allows (R3 UC-69). Suppliers are never deleted, only stopped.
// The product list of a supplier is a record only: nothing here, or in a goods receipt, limits which products a supplier may deliver.
export function createSupplierManagementService({ connection }) {
  const { Supplier, Product } = productSalesModels(connection);

  // A supplier with the products it supplies, in the order the Admin put them.
  async function withProducts(doc) {
    const ids = doc.productIds ?? [];
    const found = ids.length ? await Product.find({ _id: { $in: ids } }, { code: 1, name: 1, visible: 1 }).lean() : [];
    const byId = new Map(found.map((product) => [String(product._id), product]));
    const products = ids.map((id) => byId.get(String(id))).filter(Boolean)
      .map((product) => ({ id: String(product._id), code: product.code, name: product.name, visible: product.visible === true }));
    return { ...toSupplier(doc), products };
  }

  async function requireProducts(productIds) {
    if (!productIds?.length) return;
    const found = await Product.find({ _id: { $in: productIds } }, { _id: 1 }).lean();
    const known = new Set(found.map((product) => String(product._id)));
    const missing = productIds.filter((id) => !known.has(id));
    if (missing.length) throw productSalesErrors.productNotFound(missing);
  }

  // The unique index on the name key is what stops two Admins saving the same name at the same time.
  function translateDuplicate(error) {
    if (error?.code === DUPLICATE_KEY) throw productSalesErrors.supplierNameTaken();
    throw error;
  }

  // Stop and resume are the same guarded change in opposite directions.
  async function changeStatus(actor, supplierId, body, { from, to }) {
    requireSupplierManager(actor);
    const id = parseObjectId(supplierId, 'supplierId');
    const version = parseSupplierVersion(body);
    const updated = await Supplier.findOneAndUpdate({ _id: id, version, status: from },
      { $set: { status: to }, $inc: { version: 1 } }, { returnDocument: 'after' }).lean();
    if (updated) return withProducts(updated);
    const current = await Supplier.findById(id).lean();
    if (!current) throw productSalesErrors.notFound();
    if (current.status !== from) throw productSalesErrors.supplierStateConflict(current.status);
    throw productSalesErrors.versionConflict('supplier');
  }

  return Object.freeze({
    // One tab of suppliers by name, with the size of every tab.
    async list(actor, query) {
      requireSupplierManager(actor);
      const { status, page, limit } = parseSupplierQuery(query);
      const [result, grouped] = await Promise.all([
        paginate(Supplier, { filter: status === 'ALL' ? {} : { status }, sort: { nameKey: 1, _id: 1 }, collation: NAME_ORDER, page, limit }),
        Supplier.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      ]);
      const counts = { ACTIVE: 0, STOPPED: 0 };
      for (const { _id, count } of grouped) counts[_id] = count;
      return { ...result, items: result.items.map(toSupplier), counts: { ...counts, ALL: counts.ACTIVE + counts.STOPPED } };
    },
    async read(actor, supplierId) {
      requireSupplierManager(actor);
      const doc = await Supplier.findById(parseObjectId(supplierId, 'supplierId')).lean();
      if (!doc) throw productSalesErrors.notFound();
      return withProducts(doc);
    },
    // A new supplier is Đang hợp tác (ACTIVE).
    async create(actor, body) {
      requireSupplierManager(actor);
      const values = parseCreateSupplier(body);
      await requireProducts(values.productIds);
      try {
        const doc = await Supplier.create({ ...values, status: 'ACTIVE', version: 0 });
        return withProducts(doc.toObject());
      } catch (error) {
        return translateDuplicate(error);
      }
    },
    // Only what the Admin sent changes, and it matches the version the Admin saw. A supplier that stopped can still be edited.
    async update(actor, supplierId, body) {
      requireSupplierManager(actor);
      const id = parseObjectId(supplierId, 'supplierId');
      const { version, ...changes } = parseUpdateSupplier(body);
      const current = await Supplier.findById(id).lean();
      if (!current) throw productSalesErrors.notFound();
      // An edit may clear the phone or the email, but not both.
      requireContact({ phone: changes.phone ?? current.phone, email: changes.email ?? current.email });
      await requireProducts(changes.productIds);
      try {
        const updated = await Supplier.findOneAndUpdate({ _id: id, version },
          { $set: changes, $inc: { version: 1 } }, { returnDocument: 'after' }).lean();
        if (updated) return withProducts(updated);
      } catch (error) {
        return translateDuplicate(error);
      }
      throw productSalesErrors.versionConflict('supplier');
    },
    // Stopping keeps the supplier and its history; a goods receipt can no longer choose it (checked there).
    stop: (actor, supplierId, body) => changeStatus(actor, supplierId, body, { from: 'ACTIVE', to: 'STOPPED' }),
    resume: (actor, supplierId, body) => changeStatus(actor, supplierId, body, { from: 'STOPPED', to: 'ACTIVE' })
  });
}
