import '../pages/public/public-figma.css';
import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PublicFooter } from '../components/public/PublicFooter.jsx';
import { PublicHeader } from '../components/public/PublicHeader.jsx';

export function PublicSiteLayout() {
  const location = useLocation();
  const main = useRef(null);

  useEffect(() => {
    if (location.hash) {
      let id = location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* Ignore malformed URL escapes. */ }
      const target = document.getElementById(id);
      if (target) { target.scrollIntoView?.({ block: 'start' }); return; }
    }
    main.current?.focus({ preventScroll: true });
  }, [location.pathname, location.hash]);

  return <div className="pwc-public-root">
    <a className="pwc-skip-link" href="#pwc-public-main">Bỏ qua đến nội dung chính</a>
    <PublicHeader />
    <main className="pwc-public-main" id="pwc-public-main" tabIndex={-1} ref={main}>
      <Outlet />
    </main>
    <PublicFooter />
  </div>;
}
