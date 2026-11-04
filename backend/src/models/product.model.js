import { oid, integer, registerModels, sub } from './model-definitions.js';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_PET_TYPES,
  PRODUCT_RECEIVE_METHODS,
  PRODUCT_PAYMENT_METHODS,
  PRODUCT_ORDER_STATUSES,
  PRODUCT_RETURN_REASONS,
  PRODUCT_RETURN_LIMITS,
  PRODUCT_REFUSAL_REASONS
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
  sellingPriceWhenOrdered: { ...integer(), required: true },
  // Set when a returned order is confirmed: how many of this line go back on sale (0 to quantity).
  resellableQuantity: { ...integer(0, 99) }
});
const deliveryAddress = sub({
  addressId: { type: oid, required: true },
  label: { type: String, required: true, maxlength: 100 },
  location: { type: String, required: true, maxlength: 500 },
  areaCode: { type: String, required: true, maxlength: 80 }
});

// Collections: products, productcarts, productorders, productcustomerrefusals, productcounters (default Mongoose names).
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
        // Guards stock changes (orders, returns). Product Management has its own, so a customer ordering while an Admin
        // edits the product does not make the Admin's save a conflict.
        version: { ...integer(), default: 0 },
        detailsVersion: { ...integer(), default: 0 }
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
        deliveredAt: { type: Date },
        // Entered when the order goes back (the carrier's own words), then the shop's reason when it confirms the return.
        carrierReturnReason: { type: String, maxlength: PRODUCT_RETURN_LIMITS.carrierReasonMax },
        returnReason: { type: String, enum: PRODUCT_RETURN_REASONS },
        returnNote: { type: String, maxlength: PRODUCT_RETURN_LIMITS.noteMax },
        returnedAt: { type: Date },
        // A paid advance payment on an order that was cancelled or returned; accounting works out and pays the money outside PWC.
        refundMarked: { type: Boolean, default: false },
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
    // One record per refused order (the order id is unique, so a refusal is never counted twice).
    // A customer's refusal count is the number of their records.
    ProductCustomerRefusal: {
      fields: {
        customerId: { type: oid, required: true },
        orderId: { type: oid, required: true },
        reason: { type: String, enum: PRODUCT_REFUSAL_REASONS, required: true },
        occurredAt: { type: Date, required: true }
      },
      indexes: [
        [{ orderId: 1 }, { unique: true }],
        [{ customerId: 1 }, {}]
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
