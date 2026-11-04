import { PRODUCT_ADMIN_ORDER_STATUS_LABELS, PRODUCT_ORDER_STATUS_LABELS } from '../../constants/product-labels.js';
import './product-shop.css';

const TONES = { PLACED: 'info', HANDED_TO_CARRIER: 'info', BEING_RETURNED: 'warn', READY: 'warn',
  DELIVERED: 'done', PICKED_UP: 'done', RETURNED: 'muted', CANCELLED: 'muted' };
const ADMIN_TONES = { PLACED: 'warn' };

export function OrderStatusBadge({ status, forAdmin = false }) {
  const adminLabel = forAdmin ? PRODUCT_ADMIN_ORDER_STATUS_LABELS[status] : undefined;
  const tone = (forAdmin && ADMIN_TONES[status]) || TONES[status] || 'muted';
  return <span className={`pwc-shop-status pwc-shop-status--${tone}`}>{adminLabel ?? PRODUCT_ORDER_STATUS_LABELS[status] ?? status}</span>;
}
