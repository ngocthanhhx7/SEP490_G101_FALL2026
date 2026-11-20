import { MobileAppShell } from '../layouts/MobileAppShell.jsx';
import { mobileRoute } from '../routes/mobile-route-metadata.js';
import { primaryRole } from '../utils/role-access.js';
import { useLocation } from 'react-router-dom';
import { SessionProvider, useSession } from '../contexts/SessionContext.jsx';
import { usePhoneApp } from '../hooks/usePhoneApp.js';
import { NotificationProvider } from '../contexts/NotificationContext.jsx';
import { NotificationToast } from '../components/common/NotificationToast.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';
import { AppErrorBoundary } from './AppErrorBoundary.jsx';
import { ProductCartProvider } from '../contexts/ProductCartContext.jsx';
import { PublicPolicyProvider } from '../contexts/PublicPolicyContext.jsx';
import { publicPolicyRouteElements as defaultPublicPolicyRouteElements } from '../routes/PublicPolicyRoutes.jsx';
import '../styles/storefront.css';

export function App({
  sessionAdapter,
  publicPolicyRouteElements = defaultPublicPolicyRouteElements,
  registrationPolicies,
  loadPublicPolicies
}) {
  return (
    <AppErrorBoundary>
      <SessionProvider adapter={sessionAdapter} foreground>
        <NotificationProvider>
          <ProductCartProvider>
            <PublicPolicyProvider policies={registrationPolicies} loadPolicies={loadPublicPolicies}>
              <AppNavigation publicPolicyRouteElements={publicPolicyRouteElements} />
            </PublicPolicyProvider>
          </ProductCartProvider>
          <NotificationToast />
        </NotificationProvider>
      </SessionProvider>
    </AppErrorBoundary>
  );
}

function AppNavigation({ publicPolicyRouteElements }) {
  const compact = usePhoneApp();
  const { pathname } = useLocation();
  const { user } = useSession();
  const role = primaryRole(user);
  const route = compact ? mobileRoute(pathname, role) : null;
  const identity = user ? user.id + ":" + role : "guest";
  return <MobileAppShell key={identity} route={route}>
    <AppRoutes publicPolicyRouteElements={publicPolicyRouteElements} phoneApp={Boolean(route)} />
  </MobileAppShell>;
}