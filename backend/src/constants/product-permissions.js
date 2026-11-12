// Product sales permissions follow the R3 Permission Matrix.
export const PRODUCT_PERMISSIONS = Object.freeze({
  // Prepare, hand to the carrier, delivery status, returns, hand over at the shop, view all orders.
  HANDLE_ORDERS: Object.freeze(['ADMIN', 'SALE_STAFF']),
  CANCEL_ONLINE_ORDERS: Object.freeze(['ADMIN']),
  // Create and edit products, show or hide them on the public Products page. Never Sale Staff.
  MANAGE_PRODUCTS: Object.freeze(['ADMIN']),
  // Add, edit, stop and resume working with suppliers. Admin only.
  MANAGE_SUPPLIERS: Object.freeze(['ADMIN']),
  // Sales staff can record receipts and view stock without managing catalog or suppliers.
  RECORD_GOODS_RECEIPTS: Object.freeze(['ADMIN', 'SALE_STAFF']),
  VIEW_STOCK: Object.freeze(['ADMIN', 'SALE_STAFF'])
});
