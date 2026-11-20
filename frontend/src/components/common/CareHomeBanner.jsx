import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CareHomeBanner({ supporting, title = 'Bé cần chăm sóc gì?' }) {
  return <section className="pwc-care-banner">
    <img src="/assets/figma-public/home-Image656.webp" alt="" width="480" height="480" fetchPriority="high" />
    <div className="pwc-care-banner__copy">
      <h1>{title}</h1>
      <p>{supporting}</p>
      <Link className="pwc-compact-cta" to="/services">Khám phá dịch vụ <ArrowRight size={17} aria-hidden="true" /></Link>
    </div>
  </section>;
}
