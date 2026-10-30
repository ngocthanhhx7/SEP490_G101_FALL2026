import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useNotifications } from '../../contexts/NotificationContext.jsx';
import { notificationDate, notificationTarget } from '../../utils/notifications.js';
import './notifications-preview.css';

export function NotificationBell({ to = '/account/notifications' }) {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ top: 64, right: 16 });
  const trigger = useRef(null), panel = useRef(null), closeTimer = useRef(null);
  const location = useLocation(), id = useId();
  const cancelClose = useCallback(() => window.clearTimeout(closeTimer.current), []);
  const close = useCallback(() => { cancelClose(); setOpen(false); setPinned(false); }, [cancelClose]);
  const show = () => { cancelClose(); setOpen(true); };
  const leave = () => { closeTimer.current = window.setTimeout(() => {
    if (!pinned && !panel.current?.contains(document.activeElement) && document.activeElement !== trigger.current) setOpen(false);
  }, 160); };
  useEffect(() => { close(); }, [location.key, close]);
  useEffect(() => () => cancelClose(), [cancelClose]);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPosition({ top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 160)),
        right: Math.max(12, Math.min(window.innerWidth - rect.right, window.innerWidth - Math.min(368, window.innerWidth - 24) - 12)) });
    };
    reposition();
    window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition, true);
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(); };
    const escape = event => { if (event.key === 'Escape') { close(); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape); };
  }, [open, close]);
  const blur = event => { if (!panel.current?.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close(); };
  const unread = notifications.unreadCount;
  return <div className="pwc-notification-preview">
    <button ref={trigger} className="workspace-notification-bell" type="button" title="Thông báo"
      aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
      aria-expanded={open} aria-pressed={pinned} aria-controls={id}
      onPointerEnter={event => { if (event.pointerType !== 'touch') show(); }} onPointerLeave={leave}
      onBlur={blur} onClick={() => { if (pinned) close(); else { setPinned(true); show(); } }}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); show(); window.setTimeout(() => panel.current?.querySelector('a, button')?.focus(), 0); } }}>
      <Bell size={21} aria-hidden="true" />{unread > 0 && <span className="pwc-notification-dot" aria-hidden="true" />}
    </button>
    {open && createPortal(<section ref={panel} id={id} className="pwc-notification-panel" style={position}
      aria-label="Xem trước thông báo" onPointerEnter={cancelClose} onPointerLeave={leave} onBlur={blur}>
      <header><h2>Thông báo</h2>{Number.isSafeInteger(unread) && <span>{unread} chưa đọc</span>}</header>
      {notifications.status === 'pending' && <p role="status">Đang tải thông báo…</p>}
      {['error', 'forbidden'].includes(notifications.status) && <div className="pwc-notification-panel__state" role="status">
        <p>Không thể cập nhật thông báo.</p><button type="button" onClick={notifications.refresh}><RefreshCw size={16} />Thử lại</button>
      </div>}
      {notifications.status === 'success' && notifications.items.length === 0 && <p role="status">Chưa có thông báo.</p>}
      <ul>{notifications.items.map(item => <li key={item.id} data-unread={!item.readAt}>
        <Link to={notificationTarget(item, to)} onClick={() => { notifications.markRead?.(item); close(); }}>
          <strong>{!item.readAt && <span className="pwc-notification-dot" aria-label="Chưa đọc" />}{item.title}</strong>
          <span>{item.message}</span><time dateTime={item.createdAt}>{notificationDate(item.createdAt)}</time>
        </Link>
      </li>)}</ul>
      {notifications.readError && <p role="status">{notifications.readError}</p>}
      <Link className="pwc-notification-panel__all" to={to} onClick={close}>Xem tất cả thông báo</Link>
    </section>, document.body)}
  </div>;
}
