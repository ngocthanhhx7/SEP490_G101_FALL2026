import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import { formatCatalogPrice } from '../../utils/catalog-format.js';
import { CatalogState } from './PublicCatalog.jsx';
import { serviceVisual } from './service-visuals.js';
import './phone-home.css';

const starterCodes = ['home-care', 'dog-walking', 'vet-escort'];
const locations = { HOME: 'Tại nhà', FACILITY: 'Tại cơ sở', OUTDOOR: 'Ngoài trời' };
const species = { DOG: 'Chó', CAT: 'Mèo' };

function serviceContext(service) {
  const places = service.details?.locations?.map(location => locations[location]).filter(Boolean);
  return [places?.join(' / '), service.species.map(value => species[value]).filter(Boolean).join(', ')]
    .filter(Boolean).join(' · ');
}

export function MobileServiceChoices({ as: Heading = 'h2', loadCatalog = loadPublicCatalog }) {
  const resource = useApiResource(loadCatalog);
  const published = resource.status === 'success' && resource.data?.available ? resource.data.services : [];
  const starters = starterCodes.map(code => published.find(service => service.code === code)).filter(Boolean);
  const choices = [...starters, ...published.filter(service => !starters.includes(service))].slice(0, 3);

  return <section className="pwc-phone-services" aria-labelledby="pwc-phone-services-title">
    <Heading id="pwc-phone-services-title">Bé cần chăm sóc gì?</Heading>
    {choices.length ? <ul className="pwc-phone-services__list">
      {choices.map(service => {
        const visual = serviceVisual(service);
        const price = formatCatalogPrice(service.price);
        return <li key={service.id}>
          <Link className="pwc-phone-services__card" to={'/services/' + encodeURIComponent(service.id)}>
            <img src={visual.src} width="64" height="64" alt="" style={{ objectPosition: visual.position }} />
            <span className="pwc-phone-services__copy">
              <strong>{service.name}</strong>
              <span>{serviceContext(service)}</span>
              {price && <b>{price}</b>}
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ul> : <CatalogState resource={resource} emptyTitle="Chưa có dịch vụ được công khai"
      emptyBody="Bạn có thể quay lại sau để xem danh mục mới nhất." />}
    <Link className="pwc-phone-home__row pwc-phone-home__all" to="/services">
      Xem tất cả dịch vụ <ChevronRight size={18} aria-hidden="true" />
    </Link>
  </section>;
}
