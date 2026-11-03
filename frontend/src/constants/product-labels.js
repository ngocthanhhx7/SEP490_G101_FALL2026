// Vietnamese labels for the customer product shop. Codes mirror the backend product-sales vocabulary.
export const PRODUCT_CATEGORY_LABELS = Object.freeze({ FOOD: 'Thức ăn', ACCESSORY: 'Phụ kiện' });
export const PRODUCT_PET_LABELS = Object.freeze({ DOG: 'Chó', CAT: 'Mèo' });
export const PRODUCT_RECEIVE_LABELS = Object.freeze({ DELIVERY: 'Giao tận nơi', PICKUP: 'Nhận tại cửa hàng' });
export const PRODUCT_PAYMENT_LABELS = Object.freeze({
  COD: { title: 'Thanh toán khi nhận hàng', hint: 'Trả tiền mặt cho người giao hàng' },
  PAY_AT_SHOP: { title: 'Trả tại cửa hàng', hint: 'Trả khi lấy hàng tại cửa hàng' }
});
export const PRODUCT_ORDER_STATUS_LABELS = Object.freeze({
  PLACED: 'Đã đặt hàng',
  HANDED_TO_CARRIER: 'Đang vận chuyển',
  DELIVERED: 'Đã giao hàng',
  BEING_RETURNED: 'Đang hoàn về',
  RETURNED: 'Đã hoàn về',
  READY: 'Sẵn sàng nhận',
  PICKED_UP: 'Đã nhận hàng',
  CANCELLED: 'Đã huỷ'
});
// Admin sees a new order as work to do, not as "placed" (R3 Order Management).
export const PRODUCT_ADMIN_ORDER_STATUS_LABELS = Object.freeze({ PLACED: 'Cần chuẩn bị' });
