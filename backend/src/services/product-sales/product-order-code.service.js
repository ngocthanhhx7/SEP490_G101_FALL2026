import { productSalesModels } from '../../models/product.model.js';
import { PRODUCT_ORDER_COUNTER_ID, PRODUCT_ORDER_CODE_PREFIX } from '../../constants/product-fields.js';

// Both channels allocate outside the order transaction; failed attempts may leave DH gaps.
export function createProductOrderCodeService({ connection }) {
  const { ProductCounter } = productSalesModels(connection);
  return {
    async nextCode() {
      let counter;
      try {
        counter = await ProductCounter.findOneAndUpdate({ _id: PRODUCT_ORDER_COUNTER_ID },
          { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        counter = await ProductCounter.findOneAndUpdate({ _id: PRODUCT_ORDER_COUNTER_ID },
          { $inc: { value: 1 } }, { returnDocument: 'after' });
      }
      return `${PRODUCT_ORDER_CODE_PREFIX}${String(counter.value).padStart(4, '0')}`;
    }
  };
}
