import { useCallback, useEffect, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Notice, Button, Pagination } from '../ui/index.js';
import { COUNTER_LIMITS } from '../../constants/counter-sale.js';
import { formatVnd } from '../../utils/product-format.js';

export function CounterProductTable({ api, locked, onAdd, revision }) {
  const [typed, setTyped] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  useEffect(() => { const timer = setTimeout(() => { setSearch(typed.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [typed]);
  const load = useCallback(options => { void revision; return api.products({ search, page }, options); }, [api, search, page, revision]);
  const resource = useApiResource(load);
  return <section className="pwc-shop-panel counter-products" aria-labelledby="counter-products-title">
    <h2 id="counter-products-title">Tra sản phẩm</h2>
    <input type="search" className="pwc-shop-search" aria-label="Tìm sản phẩm theo tên hoặc mã" placeholder="Tìm theo tên hoặc mã sản phẩm"
      value={typed} maxLength={COUNTER_LIMITS.search} onChange={event => setTyped(event.target.value)} />
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải sản phẩm…" />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được sản phẩm" action={<Button onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Bạn không có quyền bán tại quầy." />}
    {resource.status === 'empty' && <Notice state="empty" title="Không tìm thấy sản phẩm nào." />}
    {resource.status === 'success' && <table className="pwc-shop-table counter-product-table">
      <thead><tr><th>Sản phẩm</th><th>Giá bán</th><th>Có thể bán</th><th><span className="pwc-visually-hidden">Thêm</span></th></tr></thead>
      <tbody>{resource.data.map(p => <tr key={p.id}>
        <td><strong>{p.name}</strong><small>{p.code}</small></td><td data-label="Giá bán">{formatVnd(p.sellingPrice)}</td><td data-label="Có thể bán">{p.available}</td>
        <td><button type="button" className="pwc-shop-outline-button" disabled={locked || p.available === 0}
          aria-label={`${p.available ? 'Thêm' : 'Hết hàng'} ${p.name}`} onClick={() => onAdd(p)}>{p.available ? 'Thêm' : 'Hết hàng'}</button></td>
      </tr>)}</tbody>
    </table>}
    {resource.meta?.page && <Pagination {...resource.meta.page} itemLabel="sản phẩm" onPageChange={setPage} />}
  </section>;
}
