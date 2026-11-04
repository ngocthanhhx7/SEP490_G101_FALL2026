// R3 messages in Vietnamese. {n} and {code} are filled by utils/product-format.js.
export const PRODUCT_MESSAGES = Object.freeze({
  MSG18: 'Rất tiếc, chúng tôi chưa phục vụ địa chỉ này.',
  MSG58: 'Chỉ còn {n} sản phẩm. Vui lòng giảm số lượng.',
  MSG59: 'Đơn hàng {code} đã được đặt.',
  MSG97: 'Không tìm thấy sản phẩm nào.',
  MSG98: 'Sản phẩm này đã hết hàng.',
  MSG99: 'Đã thêm sản phẩm vào giỏ hàng.',
  MSG100: 'Giỏ hàng của bạn đang trống. Vui lòng chọn sản phẩm trước.',
  MSG101: 'Vui lòng chọn địa chỉ nhận hàng.',
  MSG102: 'Bạn chưa có đơn hàng nào.',
  MSG103: 'Vui lòng nhập mã vận đơn.',
  MSG104: 'Số bán lại được không thể lớn hơn số lượng hoàn về.',
  MSG105: 'Đơn hàng này chưa được thanh toán đủ. Vui lòng thu tiền trước.',
  MSG106: 'Đơn hàng {code} đã được cập nhật.'
});

// Backend error code -> message key.
export const PRODUCT_ERROR_MESSAGE_KEYS = Object.freeze({
  PRODUCT_QUANTITY_EXCEEDS_AVAILABLE: 'MSG58',
  PRODUCT_OUT_OF_STOCK: 'MSG98',
  CART_EMPTY: 'MSG100',
  ADDRESS_REQUIRED: 'MSG101',
  ADDRESS_OUT_OF_SERVICE_AREA: 'MSG18',
  TRACKING_CODE_REQUIRED: 'MSG103',
  ORDER_NOT_PAID: 'MSG105',
  RESELLABLE_QUANTITY_INVALID: 'MSG104'
});
