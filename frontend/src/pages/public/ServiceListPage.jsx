import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import {
  CatalogEmpty,
  CatalogState,
  PublicServiceCards
} from './PublicCatalog.jsx';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import './service-catalog.css';
import { ServiceBasket } from './ServiceBasket.jsx';

function normalizeSearch(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi');
}

export function ServiceListPage({ loadCatalog = loadPublicCatalog }) {
  const catalog = useApiResource(loadCatalog);
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').slice(0, 120);
  const setQuery = (value) => {
    setParams(
      (previous) => {
        const next = new globalThis.URLSearchParams(previous);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  };
  const [species, setSpecies] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [location, setLocation] = useState('ALL');
  const [sort, setSort] = useState('DEFAULT');
  const hasFilters = query.trim() || species !== 'ALL' || category !== 'ALL' || location !== 'ALL';
  const resetFilters = () => { setQuery(''); setSpecies('ALL'); setCategory('ALL'); setLocation('ALL'); };
  const services = catalog.data?.services || [];
  const categories = [...new Set(services.map(s => s.details?.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const filtered = useMemo(() => {
    const term = normalizeSearch(query.trim());
    const matches = services.filter((service) => {
      const matchesText =
        !term ||
        normalizeSearch(
          [
            service.name,
            service.description,
            service.scope,
            ...service.species
          ].join(' ')
        ).includes(term);
      const matchesSpecies =
        species === 'ALL' || service.species.includes(species);
      return matchesText && matchesSpecies && (category === 'ALL' || service.details?.category === category) &&
        (location === 'ALL' || service.details?.locations?.includes(location));
    });
    if (sort === 'PRICE_ASC') matches.sort((a, b) => a.price.amountVnd - b.price.amountVnd);
    if (sort === 'PRICE_DESC') matches.sort((a, b) => b.price.amountVnd - a.price.amountVnd);
    if (sort === 'NAME') matches.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return matches;
  }, [services, query, species, category, location, sort]);

  return (
    <div className="pwc-page pwc-service-list-page">
      <section
        className="pwc-page-intro"
        aria-labelledby="pwc-service-list-title"
      >
        <p className="pwc-eyebrow">Chăm chút từng ngày</p>
        <h1 id="pwc-service-list-title">Dịch vụ PawWorld Care</h1>
        <p className="pwc-lead">
          Chăm sóc, làm đẹp, lưu trú và vận động dành cho chó, mèo.
        </p>
      </section>

      <form
        className="pwc-catalog-filters"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="pwc-filter-search">
          <span>Tìm dịch vụ</span>
          <span className="pwc-filter-input"><Search size={18} aria-hidden="true" /><input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            aria-label="Tìm dịch vụ"
            maxLength={120}
            autoComplete="off"
            placeholder="Bạn cần dịch vụ gì cho bé?"
          />{query && <button type="button" aria-label="Xóa từ khóa" title="Xóa từ khóa" onClick={() => setQuery('')}><X size={16} aria-hidden="true" /></button>}</span>
        </label>
        <label className="pwc-filter-species">
          <span>Đối tượng</span>
          <select
            value={species}
            onChange={(event) => setSpecies(event.target.value)}
          >
            <option value="ALL">Tất cả thú cưng</option>
            <option value="DOG">Chó</option>
            <option value="CAT">Mèo</option>
          </select>
        </label>
        {categories.length > 0 && <>
          <label><span>Nhóm dịch vụ</span><select value={category} onChange={event => setCategory(event.target.value)}>
            <option value="ALL">Tất cả nhóm</option>{categories.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label><span>Địa điểm</span><select value={location} onChange={event => setLocation(event.target.value)}>
            <option value="ALL">Tất cả địa điểm</option><option value="FACILITY">Tại cơ sở</option><option value="HOME">Tại gia</option><option value="OUTDOOR">Ngoài trời</option>
          </select></label>
        </>}
      </form>
      {catalog.status === 'success' &&
        catalog.data?.available &&
        services.length > 0 && (
          <div className="pwc-catalog-summary"><p className="pwc-service-result-count" role="status">
            {filtered.length} dịch vụ phù hợp
          </p>{hasFilters && filtered.length > 0 && <button className="pwc-clear-filters" type="button" onClick={resetFilters}><X size={14} aria-hidden="true" />Xóa bộ lọc</button>}
          <label className="pwc-catalog-sort"><span>Sắp xếp</span><select aria-label="Sắp xếp" value={sort} onChange={event => setSort(event.target.value)}>
            <option value="DEFAULT">Mặc định</option><option value="PRICE_ASC">Giá cơ bản tăng dần</option><option value="PRICE_DESC">Giá cơ bản giảm dần</option><option value="NAME">Tên dịch vụ A–Z</option>
          </select></label></div>
        )}

      {catalog.status !== 'success' ? (
        <CatalogState
          resource={catalog}
          emptyTitle="Chưa có dịch vụ được công bố"
          emptyBody="Danh mục sẽ hiển thị tại đây khi có dịch vụ công khai."
        />
      ) : !catalog.data?.available ? (
        <CatalogEmpty
          title="Danh mục đang được cập nhật"
          body="Vui lòng quay lại sau để xem các dịch vụ hiện hành."
        />
      ) : catalog.data.services.length === 0 ? (
        <CatalogEmpty
          title="Chưa có dịch vụ được công bố"
          body="Danh mục sẽ hiển thị tại đây khi có dịch vụ công khai."
        />
      ) : filtered.length > 0 ? (
        <PublicServiceCards services={filtered} />
      ) : (
        <CatalogEmpty
          title="Không tìm thấy dịch vụ phù hợp"
          body="Hãy đổi từ khóa hoặc chọn lại đối tượng."
          action={
            <button
              className="pwc-text-button"
              type="button"
              onClick={resetFilters}
            >
              Xóa bộ lọc
            </button>
          }
        />
      )}

      {catalog.data?.available && <><p className="pwc-photo-credits"><a href="/assets/services/credits.html">Nguồn ảnh dịch vụ</a></p><ServiceBasket services={services} /></>}
      <section className="pwc-catalog-help">
        <div>
          <h2>Bạn cần tìm dịch vụ phù hợp?</h2>
          <p>
            Kiểm tra khu vực phục vụ hoặc gửi lời nhắn để được hỗ trợ về nhu cầu
            của bé.
          </p>
        </div>
        <div>
          <Link to="/service-areas">Khu vực phục vụ</Link>
          <Link to="/contact">Liên hệ PawWorld</Link>
        </div>
      </section>
    </div>
  );
}
