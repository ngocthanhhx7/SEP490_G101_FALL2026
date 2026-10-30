import { useCallback, useEffect, useMemo } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { createNotificationsApi } from '../../services/notifications-api.js';

export function NotificationBell({ to = '/account/notifications' }) {
  const session = useSession();
  const api = useMemo(() => { let request; return createNotificationsApi({ request: (...args) => {
    request ??= createApiClient({ onUnauthorized: session.invalidate }); return request(...args);
  } }); }, [session.invalidate]);
  const load = useCallback(options => api.list({ ...options, limit: 1, unreadOnly: true }), [api]);
  const resource = useApiResource(load);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) resource.retry(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('pwc:notifications-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('pwc:notifications-changed', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [resource.retry]);
  const count = resource.status === 'success' ? resource.data?.unreadCount : null;
  return <Link className="workspace-notification-bell" to={to} title="Thông báo" aria-label={count ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}>
    <Bell size={21} aria-hidden="true" />{count > 0 && <span>{count > 99 ? '99+' : count}</span>}
  </Link>;
}
