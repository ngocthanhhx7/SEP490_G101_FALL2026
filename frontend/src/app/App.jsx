import { SessionProvider } from '../contexts/SessionContext.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';
import { AppErrorBoundary } from './AppErrorBoundary.jsx';
import { PublicPolicyProvider } from '../contexts/PublicPolicyContext.jsx';

export function App({ sessionAdapter, publicPolicyRouteElements, registrationPolicies }) {
  return <AppErrorBoundary>
    <SessionProvider adapter={sessionAdapter}>
      <PublicPolicyProvider policies={registrationPolicies}>
        <AppRoutes publicPolicyRouteElements={publicPolicyRouteElements} />
      </PublicPolicyProvider>
    </SessionProvider>
  </AppErrorBoundary>;
}
