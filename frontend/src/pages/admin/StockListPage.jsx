import { useCallback, useEffect, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Notice, Pagination } from '../../components/ui/index.js';
import { StockHistoryPanel } from '../../components/product/StockHistoryPanel.jsx';
import { STOCK_FAILURE_TEXT, STOCK_PAGE_SIZE, STOCK_SEARCH_MAX_LENGTH, STOCK_STATUSES, STOCK_TABS } from '../../constants/stock-list.js';
import { formatStockQuantity } from '../../utils/stock-format.js';
import { productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';
import './stock-list.css';

export function StockListPage({ api }) {
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const load = useCallback(({ signal }) => api.listStock({ tab, search, page, limit: STOCK_PAGE_SIZE }, { signal }), [api, tab, search, page]);
  const resource = useApiResource(load);
  const products = resource.data ?? [];
  const selected = products.find(product => product.id === selectedId);
  const ready = resource.status === 'success' || resource.status === 'empty';
  useEffect(() => {
    if (ready && !resource.data.some(product => product.id === selectedId)) setSelectedId(null);
  }, [ready, resource.data, selectedId]);
  return <section className="pwc-shop pwc-stock" aria-labelledby="stock-title">
    <h1 id="stock-title">Tồn kho</h1>
    <p className="pwc-shop-lead">Tồn thực tế, phần đơn chưa xong đang giữ và số còn bán được của từng sản phẩm.</p>
    <div className="pwc-shop-chip-row pwc-stock-tabs" role="group" aria-label="Lọc tồn kho">
      {STOCK_TABS.map(([key, label]) => <button key={key} type="button" className="pwc-shop-chip" aria-pressed={tab === key}
        onClick={() => { setTab(key); setPage(1); }}>{label}{resource.meta?.counts ? ` (${resource.meta.counts[key]})` : ''}</button>)}
    </div>
    <div className="pwc-stock-layout">
      <div className="pwc-stock-list">
        <div className="pwc-shop-panel pwc-stock-table-panel">
          <label className="pwc-visually-hidden" htmlFor="stock-search">Tìm theo tên hoặc mã sản phẩm</label>
          <input id="stock-search" type="search" className="pwc-shop-field" placeholder="Tìm theo tên hoặc mã sản phẩm"
            maxLength={STOCK_SEARCH_MAX_LENGTH} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
          {resource.status === 'loading' && <Notice state="loading" title="Đang tải tồn kho…" />}
          {['error', 'forbidden'].includes(resource.status) && <Notice state="error" title={STOCK_FAILURE_TEXT}
            action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
          {resource.status === 'empty' && <Notice state="empty" title={productMessage('MSG97')} />}
          {resource.status === 'success' && <table className="pwc-shop-table pwc-stock-table">
            <thead><tr><th>Sản phẩm</th><th>Tồn thực tế</th><th>Đang giữ</th><th>Có thể bán</th><th>Trạng thái</th></tr></thead>
            <tbody>{products.map(product => <tr key={product.id} className={product.id === selectedId ? 'is-selected' : undefined}
              onClick={() => setSelectedId(product.id)}>
              <td><button type="button" className="pwc-stock-product" aria-label={`Xem lịch sử ${product.name}`}
                aria-pressed={product.id === selectedId} onClick={() => setSelectedId(product.id)}>
                <strong>{product.name}</strong><small>{product.code}</small></button></td>
              <td data-label="Tồn thực tế">{formatStockQuantity(product.stockOnHand)}</td>
              <td data-label="Đang giữ">{formatStockQuantity(product.quantityHeld)}</td>
              <td data-label="Có thể bán"><strong>{formatStockQuantity(product.available)}</strong></td>
              <td data-label="Trạng thái"><span className={`pwc-shop-status ${STOCK_STATUSES[product.status].className}`}>{STOCK_STATUSES[product.status].label}</span></td>
            </tr>)}</tbody>
          </table>}
        </div>
        {ready && resource.meta?.page && <Pagination {...resource.meta.page} itemLabel="sản phẩm" onPageChange={setPage} />}
      </div>
      {selected ? <StockHistoryPanel key={selected.id} product={selected} api={api} />
        : <section className="pwc-shop-panel pwc-stock-history" aria-label="Lịch sử nhập và điều chỉnh">
          <h2>Lịch sử nhập và điều chỉnh</h2><p>Chọn một sản phẩm để xem lịch sử.</p>
        </section>}
    </div>
  </section>;
}
