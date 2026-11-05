import { useCallback, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useProductCart } from '../../hooks/useProductCart.js';
import { Notice, Button, Pagination } from '../../components/ui/index.js';
import { CatalogLayout } from '../../components/public/CatalogLayout.jsx';
import { ProductCard } from '../../components/product/ProductCard.jsx';
import { productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';

const CATEGORY_FILTERS = [['', 'Tất cả'], ['FOOD', 'Thức ăn'], ['ACCESSORY', 'Phụ kiện']];
const PET_FILTERS = [['', 'Tất cả'], ['DOG', 'Chó'], ['CAT', 'Mèo']];
const allowed = (value, options) => (options.some(([code]) => code === value) ? value : '');

export function ProductListPage() {
  const { api } = useProductCart();
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') ?? '').slice(0, 100);
  const category = allowed(params.get('category') ?? '', CATEGORY_FILTERS);
  const petType = allowed(params.get('pet') ?? '', PET_FILTERS);
  const [text, setText] = useState(search);
  const page = /^\d{1,6}$/.test(params.get('page') ?? '') ? Math.max(1, Number(params.get('page'))) : 1;

  function update(next) {
    const merged = { q: search, category, pet: petType, page: '', ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, value]) => value)), { replace: true });
  }
  useEffect(() => { setText(search); }, [search]);
  // The search box updates the URL after a short pause so each keystroke does not hit the API.
  useEffect(() => {
    if (text.trim() === search) return undefined;
    const timer = setTimeout(() => setParams((current) => {
      const next = new globalThis.URLSearchParams(current);
      if (text.trim()) next.set('q', text.trim()); else next.delete('q');
      next.delete('page');
      return next;
    }, { replace: true }), 300);
    return () => clearTimeout(timer);
  }, [text, search, setParams]);

  const load = useCallback(({ signal }) => api.listProducts({ search, category, petType, page }, { signal }), [api, search, category, petType, page]);
  const resource = useApiResource(load);

  return <section className="pwc-shop pwc-product-list-page" aria-labelledby="shop-title">
    <div className="pwc-shop-intro"><span className="pwc-shop-kicker">Cửa hàng PawWorld</span><h1 id="shop-title">Món ngon, đồ xinh cho bé</h1>
    <p className="pwc-shop-lead">Thức ăn và phụ kiện cho chó và mèo. Bạn có thể nhận hàng tại nhà hoặc đến lấy ở cửa hàng.</p>
    </div>
    <CatalogLayout filters={<><form className="pwc-catalog-filters" role="search" onSubmit={(event) => event.preventDefault()}>
      <label className="pwc-filter-search">
        <span>Tìm sản phẩm</span>
        <span className="pwc-filter-input"><Search aria-hidden="true" size={18} />
          <input type="search" maxLength={100} value={text} autoComplete="off"
            aria-label="Tìm sản phẩm theo tên" placeholder="Tìm theo tên" onChange={(event) => setText(event.target.value)} />
          {text && <button type="button" aria-label="Xóa từ khóa" title="Xóa từ khóa" onClick={() => { setText(''); update({ q: '' }); }}><X size={16} aria-hidden="true" /></button>}
        </span>
      </label>
      <label><span>Đối tượng</span><select value={petType} onChange={(event) => update({ pet: event.target.value })}>
        {PET_FILTERS.map(([code, label]) => <option key={code} value={code}>{code ? label : 'Tất cả thú cưng'}</option>)}
      </select></label>
      <label><span>Danh mục</span><select value={category} onChange={(event) => update({ category: event.target.value })}>
        {CATEGORY_FILTERS.map(([code, label]) => <option key={code} value={code}>{code ? label : 'Tất cả danh mục'}</option>)}
      </select></label>
    </form>
      {(text || category || petType) && <button type="button" className="pwc-clear-filters" onClick={() => { setText(''); update({ q: '', category: '', pet: '' }); }}>Xóa bộ lọc</button>}
    </>}>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải sản phẩm…" />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được sản phẩm"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Vui lòng thử lại sau ít phút.</Notice>}
    {resource.status === 'empty' && <Notice state="empty" title={productMessage('MSG97')} />}
    {resource.status === 'success' && <>
      <div className="pwc-shop-grid">{resource.data.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </>}
    {(resource.status === 'success' || resource.status === 'empty') && resource.meta?.page && <Pagination {...resource.meta.page}
      itemLabel="sản phẩm" onPageChange={(next) => update({ page: String(next) })} />}
    </CatalogLayout>
    <p className="pwc-photo-credits"><a href="/assets/products/credits.html">Ảnh minh họa sản phẩm và nguồn ảnh</a></p>
  </section>;
}
