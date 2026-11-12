import { useEffect, useState } from 'react';
import { Button, Notice } from '../ui/index.js';
import { STOCK_FAILURE_TEXT, STOCK_HISTORY_KINDS, STOCK_HISTORY_LIMIT } from '../../constants/stock-list.js';
import { formatStockQuantity, formatStockDelta } from '../../utils/stock-format.js';
import { formatDay } from '../../utils/product-format.js';

// Keyed by product in the page. Aborting each request also guards APIs that resolve after cancellation.
export function StockHistoryPanel({ product, api }) {
  const [result, setResult] = useState(null);
  const [cursor, setCursor] = useState(undefined);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    Promise.resolve().then(() => api.readHistory(product.id, { limit: STOCK_HISTORY_LIMIT, cursor, signal: controller.signal }))
      .then(data => {
        if (!controller.signal.aborted) setResult(current => ({ ...data, items: cursor ? [...current.items, ...data.items] : data.items }));
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, product.id, cursor, revision]);
  const current = result?.product ?? product;
  return <section className="pwc-shop-panel pwc-stock-history" aria-labelledby="stock-history-title">
    <h2 id="stock-history-title">Lịch sử nhập và điều chỉnh</h2>
    <h3>{current.name}</h3><p className="pwc-stock-code">{current.code}</p>
    <dl className="pwc-stock-totals">
      <div><dt>Tồn thực tế</dt><dd>{formatStockQuantity(current.stockOnHand)}</dd></div>
      <div><dt>Đang giữ cho đơn chưa xong</dt><dd>{formatStockQuantity(current.quantityHeld)}</dd></div>
      <div><dt>Có thể bán</dt><dd>{formatStockQuantity(current.available)}</dd></div>
    </dl>
    {result?.items.length > 0 && <ol className="pwc-stock-events">{result.items.map(item => <li key={`${item.kind}:${item.id}`}>
      <div className="pwc-stock-event-heading"><strong>{item.referenceCode}</strong><strong className="pwc-stock-delta">{formatStockDelta(item.quantityChange)}</strong></div>
      <p>{STOCK_HISTORY_KINDS[item.kind]}</p><p><time dateTime={item.receivedOn}>{formatDay(item.receivedOn)}</time></p>
      <p>{item.supplierName}</p>
    </li>)}</ol>}
    {loading && <Notice state="loading" title="Đang tải lịch sử…" />}
    {failed && <Notice state="error" title={STOCK_FAILURE_TEXT}
      action={<Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Thử lại</Button>} />}
    {!loading && !failed && result?.items.length === 0 && <Notice state="empty" title="Chưa có lịch sử nhập hàng." />}
    {!loading && !failed && result?.nextCursor && <Button variant="secondary" onClick={() => setCursor(result.nextCursor)}>Xem thêm</Button>}
  </section>;
}
