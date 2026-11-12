import { useCallback, useEffect, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { SUPPLIER_MANAGEMENT_TEXT as TEXT } from '../../constants/supplier-management.js';
import './product-picker.css';

const SEARCH_DELAY_MS = 300;
const RESULTS = 10;

// The search box and its results: a part of a name or a code, hidden products too. Used by the supplier form and the goods receipt.
export function ProductSearch({ productApi, selectedIds, onPick }) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const load = useCallback(({ signal }) => productApi.listProducts({ search, limit: RESULTS }, { signal }), [productApi, search]);
  const resource = useApiResource(load);
  return <div className="pwc-picker-search">
    <input type="search" className="pwc-shop-field" value={text} maxLength={100} aria-label={TEXT.searchProducts}
      placeholder={TEXT.searchProducts} onChange={(event) => setText(event.target.value)} />
    {resource.status === 'loading' && <p className="pwc-shop-hint" role="status">Đang tìm…</p>}
    {resource.status === 'error' && <p className="pwc-shop-hint" role="alert">Chưa tải được danh sách sản phẩm.
      {' '}<button type="button" className="pwc-shop-link-button" onClick={resource.retry}>Thử lại</button></p>}
    {resource.status === 'empty' && <p className="pwc-shop-hint" role="status">{TEXT.noProductFound}</p>}
    {resource.status === 'success' && <ul className="pwc-picker-results" aria-label="Kết quả tìm sản phẩm">
      {resource.data.map((product) => <li key={product.id}>
        <button type="button" disabled={selectedIds.includes(product.id)} aria-label={`Thêm ${product.code} ${product.name}`}
          onClick={() => onPick({ id: product.id, code: product.code, name: product.name, visible: product.visible })}>
          {product.code} · {product.name}{!product.visible && <em> ({TEXT.hiddenProduct})</em>}
        </button>
      </li>)}
    </ul>}
  </div>;
}

// The products a supplier supplies: chosen from the catalog (hidden products too), removed with the cross.
// The list is a record only; a goods receipt is not limited by it.
export function ProductPicker({ productApi, selected, onChange, max, disabled = false }) {
  const [open, setOpen] = useState(false);
  const full = selected.length >= max;
  return <div className="pwc-picker">
    {selected.length === 0 && <p className="pwc-shop-hint">{TEXT.noProducts}</p>}
    {selected.length > 0 && <ul className="pwc-picker-selected" aria-label="Sản phẩm cung cấp">
      {selected.map((product) => <li key={product.id}>
        <span>{product.code} · {product.name}{!product.visible && <em> ({TEXT.hiddenProduct})</em>}</span>
        <button type="button" className="pwc-picker-remove" disabled={disabled} aria-label={`Bỏ ${product.code} ${product.name}`}
          onClick={() => onChange(selected.filter((entry) => entry.id !== product.id))}>×</button>
      </li>)}
    </ul>}
    {full && <p className="pwc-shop-hint">{TEXT.tooManyProducts}</p>}
    <button type="button" className="pwc-shop-link-button" disabled={disabled || full} aria-expanded={open}
      onClick={() => setOpen((value) => !value)}>{open ? 'Đóng danh sách' : '+ Thêm sản phẩm'}</button>
    {open && !full && <ProductSearch productApi={productApi} selectedIds={selected.map((product) => product.id)}
      onPick={(product) => onChange([...selected, product])} />}
  </div>;
}
