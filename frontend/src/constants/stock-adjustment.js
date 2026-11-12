export const STOCK_ADJUSTMENT_PAGE_SIZE = 20;
export const STOCK_ADJUSTMENT_QUANTITY_MAX = 100000;
export const STOCK_ADJUSTMENT_TYPES = Object.freeze([['DECREASE','Giảm tồn'],['INCREASE','Tăng tồn']]);
export const STOCK_ADJUSTMENT_REASON_LABELS = Object.freeze({
  DAMAGED: 'Hàng hỏng', LOST: 'Mất', INTERNAL_USE: 'Dùng nội bộ', RECEIPT_CORRECTION: 'Phiếu nhập ghi sai'
});
export const STOCK_ADJUSTMENT_TEXT = Object.freeze({
  failed: 'Chưa thể hoàn tất. Vui lòng thử lại sau.',
  quantityMax: 'Số lượng tối đa 100.000 cho mỗi phiếu.',
  immutable: 'Phiếu đã ghi không sửa được. Ghi sai thì tạo phiếu điều chỉnh mới.'
});
