import { Link } from 'react-router-dom';
import { formatCatalogPrice } from '../../utils/catalog-format.js';
import { serviceVisual } from './service-visuals.js';

const SPECIES_LABELS = { DOG: 'Chó', CAT: 'Mèo' };

export function CatalogState({ resource, emptyTitle, emptyBody }) {
  if (resource.status === 'loading') {
    return (
      <p className="pwc-state-card" role="status" aria-live="polite">
        Đang tải thông tin dịch vụ…
      </p>
    );
  }
  if (resource.status === 'pending') {
    return (
      <div className="pwc-state-card" role="status">
        <p>Thông tin đang được xác nhận. Vui lòng thử lại sau.</p>
        <button
          className="pwc-text-button"
          type="button"
          onClick={resource.retry}
        >
          Thử lại
        </button>
      </div>
    );
  }
  if (resource.status === 'forbidden') {
    return (
      <div className="pwc-state-card" role="alert">
        <p>Bạn chưa thể xem thông tin này.</p>
        <button
          className="pwc-text-button"
          type="button"
          onClick={resource.retry}
        >
          Thử lại
        </button>
      </div>
    );
  }
  if (resource.status === 'error') {
    return (
      <div className="pwc-state-card" role="alert">
        <p>Chưa tải được thông tin. Vui lòng kiểm tra kết nối rồi thử lại.</p>
        <button
          className="pwc-text-button"
          type="button"
          onClick={resource.retry}
        >
          Thử lại
        </button>
      </div>
    );
  }
  if (
    resource.status === 'empty' ||
    !resource.data?.available ||
    !resource.data.services?.length
  ) {
    return (
      <div className="pwc-state-card" role="status">
        <h3>{emptyTitle}</h3>
        <p>{emptyBody}</p>
      </div>
    );
  }
  return null;
}

export function PublicServiceCards({ services }) {
  return (
    <div className="pwc-service-grid">
      {services.map((service) => {
        const species = service.species
          .map((item) => SPECIES_LABELS[item])
          .join(', ');
        const price = formatCatalogPrice(service.price);
        const visual = serviceVisual(service);
        return (
          <article className="pwc-service-card" key={service.id}>
            <div className="pwc-service-card-photo">
              <img src={visual.src} alt={visual.alt} loading="lazy" />
              <strong className="pwc-service-price-badge">
                {price || 'Giá chưa được công bố'}
              </strong>
            </div>
            <div className="pwc-service-card-copy">
              <p className="pwc-eyebrow">{species}</p>
              <h3>
                <Link to={'/services/' + encodeURIComponent(service.id)}>
                  {service.name}
                </Link>
              </h3>
              <p>{service.description}</p>
              <ul className="pwc-service-inclusions">
                {service.scope
                  .split(/\n+/)
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .map((value, index) => (
                    <li key={index}>{value}</li>
                  ))}
              </ul>
            </div>
            <div className="pwc-service-card-bottom">
              <Link
                className="pwc-button pwc-button-secondary"
                to={'/services/' + encodeURIComponent(service.id)}
              >
                Xem chi tiết
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function CatalogEmpty({ title, body, action }) {
  return (
    <div className="pwc-state-card" role="status">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
