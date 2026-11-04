// Product Management (Admin). The limits mirror backend/src/constants/product-fields.js; the backend enforces them.
export const PRODUCT_FORM_LIMITS = Object.freeze({ nameMax: 200, descriptionMax: 4000, priceMax: 100000000 });
// "100.000.000" is 11 characters, so the price box needs no more room than this.
export const PRICE_INPUT_MAX_LENGTH = 11;
export const PRODUCT_PAGE_SIZE = 20;

// Texts R3 has no message for. They are chosen by the developer and listed in the code status for review.
export const PRODUCT_MANAGEMENT_TEXT = Object.freeze({
  priceTooLarge: 'Giá bán tối đa 100.000.000 đ.',
  versionConflict: 'Sản phẩm vừa được người khác sửa. Vui lòng tải lại.',
  codesExhausted: 'Đã hết mã sản phẩm. Vui lòng liên hệ quản trị hệ thống.',
  loadFailed: 'Chưa tải được danh sách sản phẩm',
  noPermission: 'Bạn không có quyền quản lý sản phẩm.',
  codeOnSave: 'Mã sản phẩm do hệ thống cấp khi lưu.',
  hiddenOnCreate: 'Sản phẩm mới được lưu ở trạng thái ẩn. Mở lại sản phẩm để bật hiển thị.'
});
