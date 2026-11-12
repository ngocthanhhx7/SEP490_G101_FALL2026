import { PRODUCT_MESSAGES, PRODUCT_ERROR_MESSAGE_KEYS } from '../constants/product-messages.js';
import { PRODUCT_FORM_LIMITS } from '../constants/product-management.js';

export function formatVnd(amount) {
  if (!Number.isSafeInteger(amount)) return '';
  return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
}

// A Vietnamese mobile number as 0912 345 678; anything else is shown as it was stored.
export function formatPhone(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4})(\d{3})(\d{3})$/u.exec(value);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : value;
}

// The price as typed in the Admin form: 250000 or 250.000. Anything else is MSG113 (WHOLE_NUMBER);
// more than the limit is TOO_LARGE, which has its own text because MSG113 would be the wrong thing to say.
export function parsePriceInput(raw) {
  const typed = typeof raw === 'string' ? raw.trim() : '';
  if (!/^(?:[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*)$/u.test(typed)) return { error: 'WHOLE_NUMBER' };
  const value = Number(typed.replaceAll('.', ''));
  return value > PRODUCT_FORM_LIMITS.priceMax ? { error: 'TOO_LARGE' } : { value };
}

// 250000 -> "250.000", the way the price box shows a saved product.
export function formatPriceInput(amount) {
  return Number.isSafeInteger(amount) && amount > 0 ? new Intl.NumberFormat('vi-VN').format(amount) : '';
}

export function formatOrderDate(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(time);
}

// A day such as 2026-11-04 (a goods receipt's day) as 04/11/2026. Anything else is shown as it was.
export function formatDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(typeof value === 'string' ? value : '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (typeof value === 'string' ? value : '');
}

export function productMessage(key, values = {}) {
  const template = PRODUCT_MESSAGES[key] ?? '';
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ''));
}

// Maps a failed API call to user text; `available` comes from a freshly loaded product or cart line.
export function productErrorText(error, { available } = {}) {
  const key = PRODUCT_ERROR_MESSAGE_KEYS[error?.code];
  if (key) return productMessage(key, { n: available ?? 0 });
  if (error?.code === 'UNAUTHENTICATED') return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error?.code === 'PRODUCT_UNAVAILABLE' || error?.code === 'RESOURCE_NOT_FOUND') return 'Sản phẩm này không còn được bán.';
  if (error?.code === 'CART_FULL') return 'Giỏ hàng có quá nhiều sản phẩm khác nhau.';
  if (error?.code === 'ADDRESS_NOT_FOUND') return 'Không tìm thấy địa chỉ đã chọn. Vui lòng chọn lại.';
  if (error?.code === 'IDEMPOTENCY_CONFLICT') return 'Yêu cầu đặt hàng đã thay đổi. Vui lòng thử lại.';
  if (error?.code === 'ORDER_STATE_CONFLICT') return 'Đơn hàng đã đổi trạng thái. Danh sách sẽ được tải lại.';
  if (error?.code === 'ORDER_STOCK_MISMATCH') return 'Tồn kho của đơn này không khớp nên chưa thay đổi gì. Vui lòng kiểm tra lại kho.';
  if (error?.code === 'FORBIDDEN') return 'Bạn không có quyền xử lý đơn hàng.';
  return 'Chưa thể hoàn tất. Vui lòng thử lại sau.';
}

// A response we cannot interpret may still have been processed: callers keep the same operation key.
export function isUncertainOutcome(error) {
  return ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'COMMAND_PENDING', 'INVALID_RESPONSE', 'ABORTED'].includes(error?.code) || error?.status >= 500;
}
