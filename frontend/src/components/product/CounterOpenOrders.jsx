import { useCallback, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Notice, Pagination } from '../ui/index.js';
import { COUNTER_STATUS_LABELS } from '../../constants/counter-sale.js';
import { formatOrderDate, formatVnd } from '../../utils/product-format.js';

export function CounterOpenOrders({ api, revision, locked, onSelect }) {
  const [page, setPage] = useState(1);
  const load = useCallback(options => { void revision; return api.openOrders({ page }, options); }, [api, page, revision]);
  const resource = useApiResource(load);
  return <section className="pwc-shop-panel counter-open" aria-labelledby="counter-open-title">
    <h2 id="counter-open-title">Đơn chưa xong</h2>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đơn chưa xong…" />}
    {resource.status === 'empty' && <p className="pwc-shop-hint">Chưa có đơn cần tiếp tục.</p>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Bạn không có quyền bán tại quầy." />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được đơn chưa xong" action={<Button onClick={resource.retry}>Thử lại</Button>} />}
    {resource.data?.map(order => <div className="counter-open-row" key={order.id}>
      <div><strong>{order.code}</strong><span>{COUNTER_STATUS_LABELS[order.status]} · {formatOrderDate(order.createdAt)} · {formatVnd(order.total)}</span></div>
      <button type="button" className="pwc-shop-link-button" disabled={locked} onClick={() => onSelect(order.id)}>Mở {order.code}</button>
    </div>)}
    {resource.meta?.page && <Pagination {...resource.meta.page} itemLabel="đơn hàng" onPageChange={setPage} disabled={locked} />}
  </section>;
}
