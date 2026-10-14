import { Link, useParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { CatalogEmpty, CatalogState } from './PublicCatalog.jsx';
import { formatCatalogPrice, formatPolicyDate, loadPublicCatalog } from './public-catalog-adapter.js';

const SPECIES_LABELS = { DOG: 'Chó', CAT: 'Mèo' };

export function ServiceDetailsPage({ loadCatalog = loadPublicCatalog }) {
  const { serviceId } = useParams();
  const catalog = useApiResource(loadCatalog);
  const service = catalog.data?.services?.find((item) => item.id === serviceId);

  if (catalog.status !== 'success') {
    return <div className="pwc-page pwc-service-details-page">
      <CatalogState resource={catalog}
        emptyTitle="Dịch vụ chưa sẵn sàng"
        emptyBody="Hãy quay lại danh mục để xem dịch vụ đang được công bố." />
      <p className="pwc-back-link"><Link to="/services">Về danh mục dịch vụ</Link></p>
    </div>;
  }
  if (!catalog.data?.available) {
    return <div className="pwc-page pwc-service-details-page">
      <CatalogEmpty title="Danh mục đang được cập nhật"
        body="Thông tin dịch vụ hiện chưa sẵn sàng." />
      <p className="pwc-back-link"><Link to="/services">Về danh mục dịch vụ</Link></p>
    </div>;
  }
  if (!service) {
    return <div className="pwc-page pwc-service-details-page">
      <div className="pwc-state-card" role="status">
        <h1>Không tìm thấy dịch vụ</h1>
        <p>Dịch vụ này không nằm trong danh mục đang được công bố.</p>
        <Link className="pwc-button pwc-button-primary" to="/services">Xem danh mục dịch vụ</Link>
      </div>
    </div>;
  }

  const price = formatCatalogPrice(service.price);
  const effectiveDate = formatPolicyDate(service.policy.effectiveAt);

  return <div className="pwc-page pwc-service-details-page">
    <p className="pwc-back-link"><Link to="/services">Danh mục dịch vụ</Link></p>
    <section className="pwc-service-detail-hero" aria-labelledby="pwc-service-title">
      <div className="pwc-service-detail-mark" aria-hidden="true">
        <img src="/assets/icon/khac/pets.svg" alt="" width="54" height="54" />
      </div>
      <p className="pwc-eyebrow">{service.species.map((item) => SPECIES_LABELS[item]).join(' · ')}</p>
      <h1 id="pwc-service-title">{service.name}</h1>
      <p className="pwc-lead">{service.description}</p>
      <p>{service.scope}</p>
      <p className="pwc-service-detail-price"><strong>{price || 'Giá chưa được công bố'}</strong></p>
      <Link className="pwc-button pwc-button-primary"
        to={'/sign-in?serviceId=' + encodeURIComponent(service.id)}>
        Đặt dịch vụ này
      </Link>
    </section>

    <section className="pwc-policy-card" id="policy" aria-labelledby="pwc-policy-title">
      <p className="pwc-eyebrow">Thông tin hiện hành</p>
      <h2 id="pwc-policy-title">{service.policy.title}</h2>
      {effectiveDate && <p className="pwc-policy-meta">Hiệu lực từ {effectiveDate} · Phiên bản {service.policy.version}</p>}
      <p className="pwc-policy-body">{service.policy.body}</p>
    </section>

    <section className="pwc-service-next" aria-labelledby="pwc-service-next-title">
      <div>
        <h2 id="pwc-service-next-title">Kiểm tra khu vực phục vụ</h2>
        <p>Xem khu vực hiện được công bố trước khi tiếp tục đặt lịch.</p>
      </div>
      <Link className="pwc-button pwc-button-light" to="/service-areas">Khu vực phục vụ</Link>
    </section>
  </div>;
}