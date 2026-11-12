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
import { SUPPLIER_STATUSES, SUPPLIER_LIMITS } from '../constants/supplier-fields.js';
import { COUNTER_CHANNEL, COUNTER_RECEIVE_METHOD, COUNTER_PAYMENT_METHOD, COUNTER_ORDER_STATUSES } from '../constants/counter-sale-fields.js';
import { GOODS_RECEIPT_LIMITS } from '../constants/goods-receipt-fields.js';

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
// One product of a goods receipt. The code and name are copied when the receipt is saved, like an order line.
const receiptLine = sub({
  productId: { type: oid, required: true },
  productCode: { type: String, required: true, maxlength: 20 },
  productName: { type: String, required: true, maxlength: 200 },
  quantityReceived: { ...integer(1, GOODS_RECEIPT_LIMITS.quantityMax), required: true },
  quantityAccepted: { ...integer(0, GOODS_RECEIPT_LIMITS.quantityMax), required: true },
  quantityRejected: { ...integer(0, GOODS_RECEIPT_LIMITS.quantityMax), required: true },
  rejectReason: { type: String, default: '', maxlength: GOODS_RECEIPT_LIMITS.rejectReasonMax }
});
const deliveryAddress = sub({
  addressId: { type: oid, required: true },
  label: { type: String, required: true, maxlength: 100 },
  location: { type: String, required: true, maxlength: 500 },
  areaCode: { type: String, required: true, maxlength: 80 }
});
const cashPayment = sub({
  amount: { ...integer(), required: true },
  receivedAt: { type: Date, required: true },
  receivedBy: { type: oid, required: true }
});

// Collections: products, productcarts, productorders, productcustomerrefusals, productcounters, suppliers, goodsreceipts (default Mongoose names).
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
        catalogSource: { type: String, maxlength: 100 },
        sampleCatalog: { type: Boolean, default: false },
        sellingPrice: { ...integer(), required: true },
        stockOnHand: { ...integer(), default: 0 },
        // Stock reserved by orders that have not left the shop yet. Sellable = stockOnHand - quantityHeld.
        quantityHeld: { ...integer(), default: 0 },
        visible: { type: Boolean, default: true },
        deletedAt: { type: Date },
        deletedBy: { type: oid },
        deletionReason: { type: String, maxlength: 1000 },
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
    // Suppliers the shop buys from (R3 UC-69). Never deleted, only stopped. `nameKey` is the name as compared for
    // uniqueness (utils/supplier-name.js); the unique index keeps two Admins from saving the same name at once.
    Supplier: {
      fields: {
        name: { type: String, required: true, maxlength: SUPPLIER_LIMITS.nameMax },
        nameKey: { type: String, required: true, maxlength: SUPPLIER_LIMITS.nameMax * 2 },
        contactName: { type: String, default: '', maxlength: SUPPLIER_LIMITS.contactNameMax },
        // Ten digits as saved, e.g. 0936452118; empty when only an email was given.
        phone: { type: String, default: '', maxlength: 10 },
        email: { type: String, default: '', maxlength: SUPPLIER_LIMITS.emailMax },
        // The products this supplier supplies, for the record. A goods receipt is not limited to them.
        productIds: { type: [oid], default: [], validate: (ids) => ids.length <= SUPPLIER_LIMITS.productsMax },
        status: { type: String, enum: SUPPLIER_STATUSES, default: 'ACTIVE' },
        // Set when a goods receipt is saved for this supplier. It makes that save conflict with stopping the supplier at
        // the same moment, and leaves `version` alone so an Admin editing the supplier is not turned away.
        lastReceiptAt: { type: Date },
        version: { ...integer(), default: 0 }
      },
      indexes: [
        [{ nameKey: 1 }, { unique: true }],
        [{ status: 1, nameKey: 1 }, {}]
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
        channel: { type: String, enum: ['ONLINE', COUNTER_CHANNEL], default: 'ONLINE' },
        customerId: { type: oid, required() { return this.channel !== COUNTER_CHANNEL; } },
        counterCreatedBy: { type: oid, required() { return this.channel === COUNTER_CHANNEL; } },
        counterCreatedByName: { type: String, maxlength: 100 },
        counterCustomerName: { type: String, maxlength: 100 },
        cashPayment: { type: cashPayment },
        completedAt: { type: Date },
        cancelledAt: { type: Date },
        tierDiscount: { ...integer(), default: 0 },
        lines: { type: [orderLine], required: true },
        receiveMethod: { type: String, enum: [...PRODUCT_RECEIVE_METHODS, COUNTER_RECEIVE_METHOD], required: true },
        deliveryAddress: { type: deliveryAddress },
        subtotal: { ...integer(), required: true },
        shippingFee: { ...integer(), required: true },
        total: { ...integer(), required: true },
        paymentMethod: { type: String, enum: [...PRODUCT_PAYMENT_METHODS, COUNTER_PAYMENT_METHOD], required: true },
        paid: { type: Boolean, default: false },
        trackingCode: { type: String, maxlength: 64 },
        status: { type: String, enum: [...new Set([...PRODUCT_ORDER_STATUSES, ...COUNTER_ORDER_STATUSES])], default: 'PLACED' },
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
        [{ 'lines.productId': 1 }, {}],
        [{ customerId: 1, idempotencyKey: 1 }, { unique: true }],
        [{ status: 1, createdAt: -1 }, {}],
        [{ counterCreatedBy: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { channel: COUNTER_CHANNEL } }],
        [{ channel: 1, status: 1, createdAt: 1, _id: 1 }, {}]
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
    // A goods receipt (R3 UC-70). Never edited or deleted. `number` is the numeric part of `code` (PN-0012 is 12),
    // kept so the next code is never behind the highest one in use.
    GoodsReceipt: {
      fields: {
        code: { type: String, required: true, maxlength: 20 },
        number: { ...integer(1), required: true },
        supplierId: { type: oid, required: true },
        supplierName: { type: String, required: true, maxlength: SUPPLIER_LIMITS.nameMax },
        // The day of receiving in Vietnam, as YYYY-MM-DD; set by the system when the receipt is saved.
        receivedOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/u },
        recorderId: { type: oid, required: true },
        recorderName: { type: String, required: true, maxlength: 100 },
        lines: { type: [receiptLine], required: true },
        totalReceived: { ...integer(), required: true },
        totalAccepted: { ...integer(), required: true },
        totalRejected: { ...integer(), required: true },
        // D-218, as for orders: the key of the save and a fingerprint of what was sent, so a repeat returns this receipt.
        idempotencyKey: { type: String, required: true, maxlength: 128 },
        requestFingerprint: { type: String, required: true, maxlength: 128 }
      },
      indexes: [
        [{ code: 1 }, { unique: true }],
        [{ number: -1 }, { unique: true }],
        [{ recorderId: 1, idempotencyKey: 1 }, { unique: true }],
        [{ 'lines.productId': 1, createdAt: -1, _id: -1 }, {}]
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
