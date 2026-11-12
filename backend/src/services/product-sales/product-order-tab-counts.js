import { PRODUCT_ORDER_TAB_STATUSES } from '../../constants/product-fields.js';
import { COUNTER_CHANNEL } from '../../constants/counter-sale-fields.js';

export async function readProductOrderTabCounts(ProductOrder) {
  const grouped = await ProductOrder.aggregate([
    { $match: { channel: { $ne: COUNTER_CHANNEL }, status: { $in: [...new Set(Object.values(PRODUCT_ORDER_TAB_STATUSES).flat())] } } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).option({ maxTimeMS: 5000 });
  const byStatus = new Map(grouped.map(({ _id, count }) => [_id, count]));
  return Object.fromEntries(Object.entries(PRODUCT_ORDER_TAB_STATUSES).map(([key, statuses]) =>
    [key, statuses.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0)]));
}
