import { oid, integer, registerModels, sub } from './model-definitions.js';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_PET_TYPES,
  PRODUCT_RECEIVE_METHODS,
  PRODUCT_PAYMENT_METHODS,
  PRODUCT_ORDER_STATUSES
} from '../constants/product-fields.js';

const cartLine = sub({
  productId: { type: oid, required: true },
  quantity: { ...integer(1, 99), required: true }
});
const orderLine = sub({
  productId: { type: oid, required: true },
  productCode: { type: String, required: true, maxlength: 20 },
  productName: { type: String, required: true, maxlength: 200 },
  quantity: { ...integer(1, 99), required: true },
  // Price at the moment of ordering; later price changes never touch placed orders (GBR-35).
  sellingPriceWhenOrdered: { ...integer(), required: true }
});
const deliveryAddress = sub({
  addressId: { type: oid, required: true },
  label: { type: String, required: true, maxlength: 100 },
  location: { type: String, required: true, maxlength: 500 },
  areaCode: { type: String, required: true, maxlength: 80 }
});

// Collections: products, productcarts, productorders, productcounters (default Mongoose names).
export function productSalesModels(connection) {
  return registerModels(connection, {
    Product: {
      fields: {
        code: { type: String, required: true, maxlength: 20 },
        name: { type: String, required: true, maxlength: 200 },
        category: { type: String, enum: PRODUCT_CATEGORIES, required: true },
        petType: { type: String, enum: PRODUCT_PET_TYPES, required: true },
        description: { type: String, default: '', maxlength: 4000 },
        photos: { type: [String], default: [] },
        sellingPrice: { ...integer(), required: true },
        stockOnHand: { ...integer(), default: 0 },
        // Stock reserved by orders that have not left the shop yet. Sellable = stockOnHand - quantityHeld.
        quantityHeld: { ...integer(), default: 0 },
        visible: { type: Boolean, default: true },
        version: { ...integer(), default: 0 }
      },
      indexes: [
        [{ code: 1 }, { unique: true }],
        [{ visible: 1, category: 1, petType: 1, name: 1 }, {}]
      ]
    },
    ProductCart: {
      fields: {
        customerId: { type: oid, required: true },
        lines: { type: [cartLine], default: [] },
        version: { ...integer(), default: 0 }
      },
      indexes: [[{ customerId: 1 }, { unique: true }]]
    },
    ProductOrder: {
      fields: {
        code: { type: String, required: true, maxlength: 20 },
        customerId: { type: oid, required: true },
        lines: { type: [orderLine], required: true },
        receiveMethod: { type: String, enum: PRODUCT_RECEIVE_METHODS, required: true },
        deliveryAddress: { type: deliveryAddress },
        subtotal: { ...integer(), required: true },
        shippingFee: { ...integer(), required: true },
        total: { ...integer(), required: true },
        paymentMethod: { type: String, enum: PRODUCT_PAYMENT_METHODS, required: true },
        paid: { type: Boolean, default: false },
        trackingCode: { type: String, maxlength: 64 },
        status: { type: String, enum: PRODUCT_ORDER_STATUSES, default: 'PLACED' },
        idempotencyKey: { type: String, required: true, maxlength: 128 },
        requestFingerprint: { type: String, required: true, maxlength: 128 },
        version: { ...integer(), default: 0 }
      },
      indexes: [
        [{ code: 1 }, { unique: true }],
        [{ customerId: 1, createdAt: -1 }, {}],
        [{ customerId: 1, idempotencyKey: 1 }, { unique: true }],
        [{ status: 1, createdAt: -1 }, {}]
      ]
    },
    ProductCounter: {
      fields: {
        _id: { type: String, required: true },
        value: { ...integer(), default: 0 }
      },
      indexes: []
    }
  });
}
