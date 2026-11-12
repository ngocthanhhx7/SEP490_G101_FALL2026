// Who may do what in product sales, from the Permission Matrix. Checks read this table instead of naming a role,
// so adding the Sale Staff role later means adding it here and giving it to the person.
// Only roles that already exist can be listed: ADMIN covers every Sale Staff task until then.
export const PRODUCT_PERMISSIONS = Object.freeze({
  // Prepare, hand to the carrier, delivery status, returns, hand over at the shop, view all orders.
  HANDLE_ORDERS: Object.freeze(['ADMIN']),
  // Create and edit products, show or hide them on the public Products page. Never Sale Staff.
  MANAGE_PRODUCTS: Object.freeze(['ADMIN']),
  // Add, edit, stop and resume working with suppliers. Admin only.
  MANAGE_SUPPLIERS: Object.freeze(['ADMIN']),
  // Sale Staff will be added here when that role exists.
  SELL_AT_COUNTER: Object.freeze(['ADMIN']),
  // Record a goods receipt, and read the active suppliers and the products it needs. Sale Staff is added here when the role exists (D-221).
  RECORD_GOODS_RECEIPTS: Object.freeze(['ADMIN']),
  VIEW_STOCK: Object.freeze(['ADMIN']),
  // Admin only, never Sale Staff.
  ADJUST_STOCK: Object.freeze(['ADMIN'])
});
