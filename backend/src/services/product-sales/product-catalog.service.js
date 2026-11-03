import { productSalesModels } from '../../models/product.model.js';
import { parseProductQuery, parseObjectId } from '../../validators/product.validator.js';
import { sellableQuantity } from './product-order-pricing.js';
import { productSalesErrors } from './product-sales-errors.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function toProductSummary(doc) {
  const available = sellableQuantity(doc);
  return {
    id: String(doc._id),
    code: doc.code,
    name: doc.name,
    category: doc.category,
    petType: doc.petType,
    sellingPrice: doc.sellingPrice,
    photos: doc.photos ?? [],
    available,
    inStock: available > 0
  };
}

// Public read model: only Shown products are ever returned.
export function createProductCatalogService({ connection }) {
  const { Product } = productSalesModels(connection);
  return Object.freeze({
    async list(query) {
      const { search, category, petType, limit } = parseProductQuery(query);
      const filter = { visible: true };
      if (category) filter.category = category;
      if (petType) filter.petType = petType;
      if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
      const docs = await Product.find(filter).sort({ code: 1 }).limit(limit).lean();
      return { items: docs.map(toProductSummary) };
    },
    async read(productId) {
      const doc = await Product.findOne({ _id: parseObjectId(productId, 'productId'), visible: true }).lean();
      if (!doc) throw productSalesErrors.notFound();
      return { ...toProductSummary(doc), description: doc.description ?? '' };
    }
  });
}
