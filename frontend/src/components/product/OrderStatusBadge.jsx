import { PRODUCT_ORDER_STATUS_LABELS } from '../../constants/product-labels.js';
import './product-shop.css';

const TONES = { PLACED: 'info', HANDED_TO_CARRIER: 'info', BEING_RETURNED: 'warn', READY: 'warn',
  DELIVERED: 'done', PICKED_UP: 'done', RETURNED: 'muted', CANCELLED: 'muted' };

export function OrderStatusBadge({ status }) {
  return <span className={`pwc-shop-status pwc-shop-status--${TONES[status] ?? 'muted'}`}>{PRODUCT_ORDER_STATUS_LABELS[status] ?? status}</span>;
}
