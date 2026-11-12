// Product sales permissions follow the R3 Permission Matrix.
export const PRODUCT_PERMISSIONS = Object.freeze({
  // Prepare, hand to the carrier, delivery status, returns, hand over at the shop, view all orders.
  HANDLE_ORDERS: Object.freeze(['ADMIN', 'SALE_STAFF']),
  CANCEL_ONLINE_ORDERS: Object.freeze(['ADMIN']),
  VIEW_SALE_STAFF_DASHBOARD: Object.freeze(['SALE_STAFF']),
  // Create and edit products, show or hide them on the public Products page. Never Sale Staff.
  MANAGE_PRODUCTS: Object.freeze(['ADMIN']),
  // Add, edit, stop and resume working with suppliers. Admin only.
  MANAGE_SUPPLIERS: Object.freeze(['ADMIN']),
  // Sales staff can sell and receive stock, without catalog or adjustment administration.
  SELL_AT_COUNTER: Object.freeze(['ADMIN', 'SALE_STAFF']),
  RECORD_GOODS_RECEIPTS: Object.freeze(['ADMIN', 'SALE_STAFF']),
  VIEW_STOCK: Object.freeze(['ADMIN', 'SALE_STAFF']),
  ADJUST_STOCK: Object.freeze(['ADMIN'])
});
