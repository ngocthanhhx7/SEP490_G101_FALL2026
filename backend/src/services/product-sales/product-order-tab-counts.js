import { PRODUCT_ORDER_TAB_STATUSES } from '../../constants/product-fields.js';

export async function readProductOrderTabCounts(ProductOrder) {
  const grouped = await ProductOrder.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const byStatus = new Map(grouped.map(({ _id, count }) => [_id, count]));
  return Object.fromEntries(Object.entries(PRODUCT_ORDER_TAB_STATUSES).map(([key, statuses]) =>
    [key, statuses.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0)]));
}
