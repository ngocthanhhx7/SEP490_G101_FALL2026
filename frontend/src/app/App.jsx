import { SessionProvider } from '../contexts/SessionContext.jsx';
import { NotificationProvider } from '../contexts/NotificationContext.jsx';
import { NotificationToast } from '../components/common/NotificationToast.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';
import { AppErrorBoundary } from './AppErrorBoundary.jsx';
import { PublicPolicyProvider } from '../contexts/PublicPolicyContext.jsx';
import { publicPolicyRouteElements as defaultPublicPolicyRouteElements } from '../routes/PublicPolicyRoutes.jsx';

export function App({
  sessionAdapter,
  publicPolicyRouteElements = defaultPublicPolicyRouteElements,
  registrationPolicies,
  loadPublicPolicies
}) {
  return (
    <AppErrorBoundary>
      <SessionProvider adapter={sessionAdapter}>
        <NotificationProvider>
        <PublicPolicyProvider
          policies={registrationPolicies}
          loadPolicies={loadPublicPolicies}
        >
          <AppRoutes publicPolicyRouteElements={publicPolicyRouteElements} />
        </PublicPolicyProvider>
          <NotificationToast />
        </NotificationProvider>
      </SessionProvider>
    </AppErrorBoundary>
  );
}
