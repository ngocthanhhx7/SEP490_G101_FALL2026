import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import {
  CatalogEmpty,
  CatalogState,
  PublicServiceCards
} from './PublicCatalog.jsx';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import './service-catalog.css';

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
  const services = catalog.data?.services || [];
  const filtered = useMemo(() => {
    const term = normalizeSearch(query.trim());
    return services.filter((service) => {
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
      return matchesText && matchesSpecies;
    });
  }, [services, query, species]);

  return (
    <div className="pwc-page pwc-service-list-page">
      <section
        className="pwc-page-intro"
        aria-labelledby="pwc-service-list-title"
      >
        <p className="pwc-eyebrow">Paw World Care</p>
        <h1 id="pwc-service-list-title">Dịch vụ PawWorld dành cho bé</h1>
        <p className="pwc-lead">
          Chọn dịch vụ phù hợp để bé được quan tâm, ngay trong không gian quen
          thuộc.
        </p>
      </section>

      <form
        className="pwc-catalog-filters"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="pwc-filter-search">
          <span>Tìm dịch vụ</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            maxLength={120}
            autoComplete="off"
            placeholder="Bạn cần dịch vụ gì cho bé?"
          />
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
      </form>
      {catalog.status === 'success' &&
        catalog.data?.available &&
        services.length > 0 && (
          <p className="pwc-service-result-count" role="status">
            {filtered.length} dịch vụ phù hợp
          </p>
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
              onClick={() => {
                setQuery('');
                setSpecies('ALL');
              }}
            >
              Xóa bộ lọc
            </button>
          }
        />
      )}

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
