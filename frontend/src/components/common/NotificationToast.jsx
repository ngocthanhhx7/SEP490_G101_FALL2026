import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext.jsx';
import { notificationTarget } from '../../utils/notifications.js';
import './notifications-preview.css';

export function NotificationToast() {
  const { toast, dismissToast, markRead } = useNotifications();
  const [paused, setPaused] = useState(false);
  const [top, setTop] = useState(84);
  const location = useLocation();
  useLayoutEffect(() => {
    if (!toast) return undefined;
    const header = document.querySelector('.pwc-public-header, .pwc-role-shell__header');
    const position = () => setTop(Math.max(16, Math.min((header?.getBoundingClientRect().bottom || 68) + 16, window.innerHeight - 160)));
    position(); window.addEventListener('resize', position);
    const observer = typeof globalThis.ResizeObserver === 'function' ? new globalThis.ResizeObserver(position) : null;
    if (header) observer?.observe(header);
    return () => { observer?.disconnect(); window.removeEventListener('resize', position); };
  }, [toast?.id, location.key]);
  useEffect(() => { setPaused(false); }, [toast?.id]);
  useEffect(() => {
    if (!toast || paused) return undefined;
    const timer = window.setTimeout(dismissToast, 8000);
    return () => window.clearTimeout(timer);
  }, [toast, paused, dismissToast]);
  return <div className="pwc-notification-toast-region" style={{ top }} aria-live="polite" aria-atomic="true">
    {toast && <article className="pwc-notification-toast" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <Bell size={20} aria-hidden="true" />
      <div><small>Thông báo mới{toast.additional > 0 ? ` · +${toast.additional}` : ''}</small>
        <Link to={notificationTarget(toast)} onClick={() => { markRead(toast); dismissToast(); }}><strong>{toast.title}</strong><span>{toast.message}</span></Link>
      </div>
      <button type="button" title="Đóng thông báo" aria-label="Đóng thông báo" onClick={dismissToast}><X size={18} /></button>
    </article>}
  </div>;
}
