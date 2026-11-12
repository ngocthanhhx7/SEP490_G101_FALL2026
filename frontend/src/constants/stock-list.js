export const STOCK_PAGE_SIZE = 20;
export const STOCK_HISTORY_LIMIT = 20;
export const STOCK_SEARCH_MAX_LENGTH = 100;
export const STOCK_TABS = Object.freeze([['ALL', 'Tất cả'], ['LOW_STOCK', 'Sắp hết hàng']]);
export const STOCK_STATUSES = Object.freeze({
  IN_STOCK: { label: 'Còn hàng', className: 'pwc-shop-status--done' },
  LOW_STOCK: { label: 'Sắp hết hàng', className: 'pwc-shop-status--warn' },
  OUT_OF_STOCK: { label: 'Hết hàng', className: 'pwc-shop-status--muted' }
});
export const STOCK_HISTORY_KINDS = Object.freeze({ GOODS_RECEIPT: 'Phiếu nhập' });
export const STOCK_FAILURE_TEXT = 'Chưa thể hoàn tất. Vui lòng thử lại sau.';
