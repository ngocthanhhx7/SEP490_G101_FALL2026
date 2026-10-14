import { SessionProvider } from '../contexts/SessionContext.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';
import { AppErrorBoundary } from './AppErrorBoundary.jsx';
import { PublicPolicyProvider } from '../contexts/PublicPolicyContext.jsx';
import { publicPolicyRouteElements as defaultPublicPolicyRouteElements } from '../pages/public/policies/PolicyPages.jsx';

export function App({ sessionAdapter, publicPolicyRouteElements = defaultPublicPolicyRouteElements, registrationPolicies, loadPublicPolicies }) {
  return <AppErrorBoundary>
    <SessionProvider adapter={sessionAdapter}>
      <PublicPolicyProvider policies={registrationPolicies} loadPolicies={loadPublicPolicies}>
        <AppRoutes publicPolicyRouteElements={publicPolicyRouteElements} />
      </PublicPolicyProvider>
    </SessionProvider>
  </AppErrorBoundary>;
}
