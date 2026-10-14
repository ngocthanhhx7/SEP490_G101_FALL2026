import { SessionProvider } from '../contexts/SessionContext.jsx';
import { AppRoutes } from '../routes/AppRoutes.jsx';
import { AppErrorBoundary } from './AppErrorBoundary.jsx';

export function App({ sessionAdapter }) {
  return <AppErrorBoundary>
    <SessionProvider adapter={sessionAdapter}><AppRoutes /></SessionProvider>
  </AppErrorBoundary>;
}
