import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useProductCart } from '../../hooks/useProductCart.js';
import { Notice, Button } from '../../components/ui/index.js';
import { ProductCard } from '../../components/product/ProductCard.jsx';
import { productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';

const CATEGORY_FILTERS = [['', 'Tất cả'], ['FOOD', 'Thức ăn'], ['ACCESSORY', 'Phụ kiện']];
const PET_FILTERS = [['', 'Tất cả'], ['DOG', 'Chó'], ['CAT', 'Mèo']];
const allowed = (value, options) => (options.some(([code]) => code === value) ? value : '');

function ChipGroup({ label, options, value, onChange }) {
  return <div className="pwc-shop-chip-row" role="group" aria-label={label}>
    <span className="pwc-shop-chip-label" aria-hidden="true">{label}</span>
    {options.map(([code, text]) => <button key={code || 'all'} type="button" className="pwc-shop-chip"
      aria-pressed={value === code} onClick={() => onChange(code)}>{text}</button>)}
  </div>;
}

export function ProductListPage() {
  const { api } = useProductCart();
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') ?? '').slice(0, 100);
  const category = allowed(params.get('category') ?? '', CATEGORY_FILTERS);
  const petType = allowed(params.get('pet') ?? '', PET_FILTERS);
  const [text, setText] = useState(search);

  function update(next) {
    const merged = { q: search, category, pet: petType, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, value]) => value)), { replace: true });
  }
  // The search box updates the URL after a short pause so each keystroke does not hit the API.
  useEffect(() => {
    if (text.trim() === search) return undefined;
    const timer = setTimeout(() => update({ q: text.trim() }), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const load = useCallback(({ signal }) => api.listProducts({ search, category, petType }, { signal }), [api, search, category, petType]);
  const resource = useApiResource(load);

  return <section className="pwc-shop" aria-labelledby="shop-title">
    <h1 id="shop-title">Sản phẩm cho thú cưng</h1>
    <p className="pwc-shop-lead">Thức ăn và phụ kiện cho chó và mèo. Bạn có thể nhận hàng tại nhà hoặc đến lấy ở cửa hàng.</p>
    <div className="pwc-shop-panel pwc-shop-filters">
      <div style={{ position: 'relative' }}>
        <Search aria-hidden="true" size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: .6 }} />
        <input className="pwc-shop-search" style={{ paddingLeft: '2.75rem' }} type="search" maxLength={100} value={text}
          aria-label="Tìm sản phẩm theo tên" placeholder="Tìm sản phẩm theo tên" onChange={(event) => setText(event.target.value)} />
      </div>
      <div className="pwc-shop-chip-row">
        <ChipGroup label="Danh mục" options={CATEGORY_FILTERS} value={category} onChange={(value) => update({ category: value })} />
        <ChipGroup label="Thú cưng" options={PET_FILTERS} value={petType} onChange={(value) => update({ pet: value })} />
      </div>
    </div>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải sản phẩm…" />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được sản phẩm"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Vui lòng thử lại sau ít phút.</Notice>}
    {resource.status === 'empty' && <Notice state="empty" title={productMessage('MSG97')} />}
    {resource.status === 'success' && <>
      <p className="pwc-shop-count" role="status">Hiển thị {resource.data.length} sản phẩm</p>
      <div className="pwc-shop-grid">{resource.data.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </>}
  </section>;
}
