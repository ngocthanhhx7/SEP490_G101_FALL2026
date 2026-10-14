import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { CatalogEmpty, CatalogState } from './PublicCatalog.jsx';
import { formatPolicyDate, loadPublicCatalog, loadPublicServiceAreas } from './public-catalog-adapter.js';

export function ServiceAreasPage({ loadAreas = loadPublicServiceAreas, loadCatalog = loadPublicCatalog }) {
  const areas = useApiResource(loadAreas);
  const catalog = useApiResource(loadCatalog);

  return <div className="pwc-page pwc-service-areas-page">
    <section className="pwc-page-intro" aria-labelledby="pwc-areas-title">
      <p className="pwc-eyebrow">Trước khi đặt lịch</p>
      <h1 id="pwc-areas-title">Khu vực phục vụ & chính sách</h1>
      <p className="pwc-lead">Xem khu vực và thông tin áp dụng được công bố cho từng dịch vụ.</p>
    </section>

    <section className="pwc-info-section" aria-labelledby="pwc-areas-section-title">
      <div className="pwc-section-heading">
        <h2 id="pwc-areas-section-title">Khu vực phục vụ</h2>
        <p>Danh sách được lấy từ thông tin khu vực công khai.</p>
      </div>
      {areas.status !== 'success'
        ? <CatalogState resource={areas}
          emptyTitle="Chưa có khu vực được công bố"
          emptyBody="Khu vực phục vụ sẽ hiển thị khi có thông tin hiện hành." />
        : !areas.data?.available
          ? <CatalogEmpty title="Thông tin khu vực đang được cập nhật"
            body="Vui lòng quay lại sau để xem phạm vi phục vụ hiện hành." />
          : areas.data.areas.length > 0
            ? <ul className="pwc-area-list">
              {areas.data.areas.map((area) => <li className="pwc-area-card" key={area.id}>
                <h3>{area.name}</h3>
                {area.description && <p>{area.description}</p>}
              </li>)}
            </ul>
            : <CatalogEmpty title="Chưa có khu vực được công bố"
              body="Khu vực phục vụ sẽ hiển thị khi có thông tin hiện hành." />}
    </section>

    <section className="pwc-info-section pwc-policy-list-section" aria-labelledby="pwc-policies-title">
      <div className="pwc-section-heading">
        <h2 id="pwc-policies-title">Chính sách dịch vụ</h2>
        <p>Nội dung dưới đây lấy từ phiên bản chính sách đang được công bố cùng dịch vụ.</p>
      </div>
      {catalog.status !== 'success'
        ? <CatalogState resource={catalog}
          emptyTitle="Chưa có chính sách được công bố"
          emptyBody="Thông tin chính sách sẽ hiển thị khi có danh mục hiện hành." />
        : !catalog.data?.available || catalog.data.services.length === 0
          ? <CatalogEmpty title="Chưa có chính sách được công bố"
            body="Thông tin chính sách sẽ hiển thị khi có dịch vụ hiện hành." />
          : <div className="pwc-policy-list">
            {catalog.data.services.map((service) => {
              const date = formatPolicyDate(service.policy.effectiveAt);
              return <article className="pwc-policy-list-card" key={service.id}>
                <p className="pwc-eyebrow">{service.name}</p>
                <h3>{service.policy.title}</h3>
                {date && <p className="pwc-policy-meta">Hiệu lực từ {date} · Phiên bản {service.policy.version}</p>}
                <p className="pwc-policy-body">{service.policy.body}</p>
                <Link className="pwc-inline-link" to={'/services/' + encodeURIComponent(service.id) + '#policy'}>
                  Xem dịch vụ
                </Link>
              </article>;
            })}
          </div>}
    </section>

    <section className="pwc-service-next" aria-labelledby="pwc-area-contact-title">
      <div>
        <h2 id="pwc-area-contact-title">Bạn đã tìm được dịch vụ phù hợp?</h2>
        <p>Xem danh mục hiện hành hoặc đăng nhập để tiếp tục đặt lịch.</p>
      </div>
      <Link className="pwc-button pwc-button-primary" to="/services">Xem dịch vụ</Link>
    </section>
  </div>;
}