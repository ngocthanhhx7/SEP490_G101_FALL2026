// Supplier Management (Admin). The limits mirror backend/src/constants/supplier-fields.js; the backend enforces them.
export const SUPPLIER_FORM_LIMITS = Object.freeze({ nameMax: 200, contactNameMax: 100, emailMax: 254, productsMax: 200 });
// "0936 452 118" is 12 characters; a little room for a dotted or hyphenated number.
export const SUPPLIER_PHONE_INPUT_MAX_LENGTH = 16;
export const SUPPLIER_STATUS_LABELS = Object.freeze({ ACTIVE: 'Đang hợp tác', STOPPED: 'Ngừng hợp tác' });
export const SUPPLIER_TABS = Object.freeze([['ACTIVE', 'Đang hợp tác'], ['STOPPED', 'Ngừng hợp tác'], ['ALL', 'Tất cả']]);

// Texts R3 has no message for. They are chosen by the developer and listed in the code status for review (D-244).
export const SUPPLIER_MANAGEMENT_TEXT = Object.freeze({
  empty: 'Chưa có nhà cung cấp nào trong mục này.',
  loadFailed: 'Chưa tải được danh sách nhà cung cấp',
  noPermission: 'Bạn không có quyền quản lý nhà cung cấp.',
  versionConflict: 'Nhà cung cấp vừa được người khác sửa. Vui lòng tải lại.',
  stateConflict: 'Trạng thái hợp tác vừa được thay đổi. Vui lòng tải lại.',
  productNotFound: 'Có sản phẩm không còn trong danh mục. Vui lòng chọn lại.',
  notFound: 'Không tìm thấy nhà cung cấp này.',
  tooManyProducts: 'Tối đa 200 sản phẩm.',
  saveFirst: 'Lưu hoặc bỏ thay đổi trước khi đổi trạng thái hợp tác.',
  productsNote: 'Danh sách này chỉ để ghi nhận, không giới hạn phiếu nhập.',
  noProducts: 'Chưa chọn sản phẩm nào.',
  hiddenProduct: 'đang ẩn',
  searchProducts: 'Tìm sản phẩm theo tên hoặc mã',
  noProductFound: 'Không tìm thấy sản phẩm nào.'
});
