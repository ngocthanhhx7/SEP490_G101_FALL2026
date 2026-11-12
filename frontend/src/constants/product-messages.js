// R3 messages in Vietnamese. {n} and {code} are filled by utils/product-format.js.
export const PRODUCT_MESSAGES = Object.freeze({
  MSG01: 'Vui lòng nhập thông tin này.',
  MSG02: 'Vui lòng nhập địa chỉ email hợp lệ.',
  MSG03: 'Vui lòng nhập số điện thoại hợp lệ (10 số, bắt đầu bằng 0).',
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
  MSG106: 'Đơn hàng {code} đã được cập nhật.',
  MSG113: 'Vui lòng nhập số nguyên lớn hơn 0.',
  MSG114: 'Ẩn {product}? Khách hàng sẽ không còn thấy và đặt được sản phẩm này. Các đơn đã đặt không thay đổi.',
  MSG115: 'Sản phẩm {code} đã được lưu.',
  MSG116: 'Đã có nhà cung cấp với tên này.',
  MSG117: 'Nhà cung cấp {name} đã được lưu.',
  MSG118: 'Ngừng hợp tác với {supplier}? Nhà cung cấp này sẽ không còn được chọn ở phiếu nhập mới. Các phiếu nhập cũ được giữ nguyên.',
  MSG119: 'Vui lòng nhập số nguyên từ 0 đến số lượng đã nhận.',
  MSG120: 'Vui lòng ghi lý do hàng bị từ chối.',
  MSG121: 'Phiếu nhập {code} đã được lưu.',
  MSG122: 'Phiếu nhập {code}: từ chối {n} {product}. Lý do: {reason}.',
  MSG123: 'Số giảm không được lớn hơn số có thể bán ({n}).',
  MSG124: 'Phiếu điều chỉnh {code} đã được lưu.',
  MSG125: 'Vui lòng nhập số điện thoại hoặc email.'
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
