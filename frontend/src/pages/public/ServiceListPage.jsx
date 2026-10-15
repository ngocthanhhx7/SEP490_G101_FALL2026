import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { CatalogEmpty, CatalogState, PublicServiceCards } from './PublicCatalog.jsx';
import { loadPublicCatalog } from './public-catalog-adapter.js';

function normalizeSearch(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi');
}

export function ServiceListPage({ loadCatalog = loadPublicCatalog }) {
  const catalog = useApiResource(loadCatalog);
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').slice(0, 120);
  const setQuery = value => { setParams(previous => { const next = new globalThis.URLSearchParams(previous); if (value) next.set('q', value); else next.delete('q'); return next; }, { replace: true }); };
  const [species, setSpecies] = useState('ALL');
  const services = catalog.data?.services || [];
  const filtered = useMemo(() => {
    const term = normalizeSearch(query.trim());
    return services.filter((service) => {
      const matchesText = !term || normalizeSearch([
        service.name, service.description, service.scope, ...service.species,
      ].join(' ')).includes(term);
      const matchesSpecies = species === 'ALL' || service.species.includes(species);
      return matchesText && matchesSpecies;
    });
  }, [services, query, species]);

  return <div className="pwc-page pwc-service-list-page">
    <section className="pwc-page-intro" aria-labelledby="pwc-service-list-title">
      <p className="pwc-eyebrow">Paw World Care</p>
      <h1 id="pwc-service-list-title">Danh mục dịch vụ</h1>
      <p className="pwc-lead">Tìm lựa chọn đang được công bố cho thú cưng của bạn.</p>
    </section>

    {catalog.status === 'success' && catalog.data?.available && catalog.data.services.length > 0
      && <form className="pwc-catalog-filters" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="pwc-filter-search">
          <span>Tìm dịch vụ</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)}
            type="search" autoComplete="off" placeholder="Nhập tên hoặc nhu cầu chăm sóc" />
        </label>
        <label className="pwc-filter-species">
          <span>Đối tượng</span>
          <select value={species} onChange={(event) => setSpecies(event.target.value)}>
            <option value="ALL">Tất cả thú cưng</option>
            <option value="DOG">Chó</option>
            <option value="CAT">Mèo</option>
          </select>
        </label>
      </form>}

    {catalog.status !== 'success'
      ? <CatalogState resource={catalog}
        emptyTitle="Chưa có dịch vụ được công bố"
        emptyBody="Danh mục sẽ hiển thị tại đây khi có dịch vụ công khai." />
      : !catalog.data?.available
        ? <CatalogEmpty title="Danh mục đang được cập nhật"
          body="Vui lòng quay lại sau để xem các dịch vụ hiện hành." />
        : catalog.data.services.length === 0
          ? <CatalogEmpty title="Chưa có dịch vụ được công bố"
            body="Danh mục sẽ hiển thị tại đây khi có dịch vụ công khai." />
          : filtered.length > 0
            ? <PublicServiceCards services={filtered} />
            : <CatalogEmpty title="Không tìm thấy dịch vụ phù hợp"
              body="Hãy đổi từ khóa hoặc chọn lại đối tượng."
              action={<button className="pwc-text-button" type="button"
                onClick={() => { setQuery(''); setSpecies('ALL'); }}>Xóa bộ lọc</button>} />}

    <p className="pwc-back-link"><Link to="/">Quay lại trang chủ</Link></p>
  </div>;
}