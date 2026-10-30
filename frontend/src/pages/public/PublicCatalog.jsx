import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3, MapPin, PawPrint } from 'lucide-react';
import { formatCatalogPrice } from '../../utils/catalog-format.js';
import { serviceVisual } from './service-visuals.js';
import './service-cards.css';

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

export function PublicServiceCards({ services, actionLabel = 'Xem chi tiết' }) {
  return (
    <div className="pwc-service-grid pwc-catalog-card-grid">
      {services.map((service) => {
        const species = service.species
          .map((item) => SPECIES_LABELS[item])
          .join(', ');
        const price = formatCatalogPrice(service.price);
        const visual = serviceVisual(service);
        const locations = { FACILITY: 'Tại cơ sở', HOME: 'Tại gia', OUTDOOR: 'Ngoài trời' };
        return (
          <article className="pwc-service-card" key={service.id}>
            <div className="pwc-service-card-photo">
              <Link to={'/services/' + encodeURIComponent(service.id)} tabIndex={-1}>
                <img src={visual.src} alt={visual.alt} loading="lazy" width="720" height="450" style={{ objectPosition: visual.position }} />
              </Link>
              {service.details?.category && <span className="pwc-card-category">{service.details.category}</span>}
            </div>
            <div className="pwc-service-card-copy">
              <p className="pwc-card-species"><PawPrint size={14} aria-hidden="true" />{species}</p>
              <h3>
                <Link to={'/services/' + encodeURIComponent(service.id)}>
                  {service.name}
                </Link>
              </h3>
              <p>{service.description}</p>
              {service.details?.category && <div className="pwc-card-facts">
                {service.details.locations?.length > 0 && <span><MapPin size={15} aria-hidden="true" />{service.details.locations.map(value => locations[value]).join(' / ')}</span>}
                {service.details.durationMinutes > 0 && <span><Clock3 size={15} aria-hidden="true" />{service.details.durationMinutes} phút</span>}
              </div>}
            </div>
            <div className="pwc-service-card-bottom">
              <div className="pwc-card-price"><span>Giá dịch vụ</span><strong>{price || 'Giá chưa được công bố'}</strong></div>
              <Link
                className="pwc-button pwc-button-secondary"
                to={'/services/' + encodeURIComponent(service.id)}
              >
                {actionLabel}<ArrowUpRight size={17} aria-hidden="true" />
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
