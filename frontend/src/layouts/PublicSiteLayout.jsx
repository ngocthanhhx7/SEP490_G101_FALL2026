import '../styles/public-site.css';
import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext.jsx';
import { primaryRole, roleLanding } from '../utils/role-access.js';
import { PublicFooter } from '../components/public/PublicFooter.jsx';
import { PublicHeader } from '../components/public/PublicHeader.jsx';

export function PublicSiteLayout() {
  const session = useSession();
  const location = useLocation();
  const main = useRef(null);

  useEffect(() => {
    if (location.hash) {
      let id = location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* Ignore malformed URL escapes. */
      }
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView?.({ block: 'start' });
        return;
      }
    }
    main.current?.focus({ preventScroll: true });
  }, [location.pathname, location.hash]);

  if (location.pathname !== '/sign-in' && session.status === 'authenticated' && primaryRole(session.user) && primaryRole(session.user) !== 'CUSTOMER') {
    return <Navigate to={roleLanding(session.user)} replace />;
  }
  return (
    <div className="pwc-public-root">
      <a className="pwc-skip-link" href="#pwc-public-main">
        Bỏ qua đến nội dung chính
      </a>
      <PublicHeader />
      <main
        className="pwc-public-main"
        id="pwc-public-main"
        tabIndex={-1}
        ref={main}
      >
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
