// Goods Receipt (Admin). The limits mirror backend/src/constants/goods-receipt-fields.js; the backend enforces them.
export const GOODS_RECEIPT_FORM_LIMITS = Object.freeze({ linesMax: 50, quantityMax: 100000, reasonMax: 300 });
// "100000" is 6 digits, so a quantity box needs no more room than this.
export const RECEIPT_QUANTITY_INPUT_MAX_LENGTH = 6;

// Texts R3 has no message for. They are chosen by the developer and listed in the code status for review (D-244).
export const GOODS_RECEIPT_TEXT = Object.freeze({
  lead: 'Ghi phiếu nhập cho mỗi lần nhà cung cấp giao hàng, theo số kiểm thực tế.',
  rejectNotice: 'Hàng từ chối sẽ được báo cho Quản trị viên và trả lại nhà cung cấp ngoài PWC.',
  supplierPlaceholder: 'Chọn nhà cung cấp',
  noActiveSupplier: 'Chưa có nhà cung cấp nào đang hợp tác.',
  linesRequired: 'Chọn ít nhất một sản phẩm.',
  tooManyLines: 'Tối đa 50 sản phẩm mỗi phiếu.',
  duplicateProduct: 'Sản phẩm này đã có trong phiếu.',
  quantityTooLarge: 'Tối đa 100.000.',
  reasonTooLong: 'Tối đa 300 ký tự.',
  supplierNotActive: 'Nhà cung cấp này đã ngừng hợp tác nên không chọn được. Vui lòng chọn nhà cung cấp khác.',
  supplierNotFound: 'Không tìm thấy nhà cung cấp này. Vui lòng chọn lại.',
  productNotFound: 'Có sản phẩm không còn trong danh mục. Vui lòng bỏ dòng đó.',
  codeConflict: 'Mã phiếu bị trùng ở cùng thời điểm. Chưa lưu gì, vui lòng lưu lại.',
  notSure: 'Chưa nhận được xác nhận lưu phiếu. Bạn có thể bấm Lưu phiếu nhập lại: nếu phiếu đã được lưu, hệ thống trả lại đúng phiếu đó và không cộng tồn lần nữa.',
  noPermission: 'Bạn không có quyền ghi phiếu nhập.',
  loadFailed: 'Chưa tải được dữ liệu nhập hàng',
  recentEmpty: 'Chưa có phiếu nhập nào.',
  receiptNotFound: 'Không tìm thấy phiếu nhập này.',
  noLines: 'Chưa có sản phẩm nào. Bấm Thêm sản phẩm để bắt đầu.',
  newReceipt: 'Ghi phiếu nhập mới'
});
