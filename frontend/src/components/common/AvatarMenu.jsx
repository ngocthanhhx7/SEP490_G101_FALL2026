import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './avatar-menu.css';

const ROLE_LABELS = Object.freeze({
  CUSTOMER: { role: 'Khách hàng', account: 'Hồ sơ khách hàng', notifications: 'Thông báo' },
  PET_SITTER: { role: 'Người chăm sóc', account: 'Hồ sơ người chăm sóc', notifications: 'Thông báo lịch chăm sóc' },
  STAFF: { role: 'Nhân viên', account: 'Tài khoản nhân viên', notifications: 'Thông báo công việc' },
  ADMIN: { role: 'Quản trị viên', account: 'Tài khoản quản trị', notifications: 'Thông báo hệ thống' },
});

function getInitials(displayName) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(-2).map((part) => Array.from(part)[0]?.toLocaleUpperCase()).join('') || '?';
}

export function AvatarMenu({ user, role, onLogout, notificationTo, customerNavigation = false, iconOnly = false }) {
  const location = useLocation();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const skipFocusOpenRef = useRef(false);
  const panelId = useId();
  const notificationNoteId = useId();
  const logoutNoteId = useId();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const roleLabels = ROLE_LABELS[role] ?? {
    role: 'Tài khoản', account: 'Tài khoản', notifications: 'Thông báo',
  };
  const displayName = typeof user?.displayName === 'string' ? user.displayName.trim() : '';
  const accountName = displayName || 'Tài khoản';
  const isOpen = !dismissed && (pinned || hovered || focusWithin);
  const canLogout = typeof onLogout === 'function';

  const dismiss = useCallback(({ restoreFocus = false } = {}) => {
    setPinned(false);
    setHovered(false);
    setFocusWithin(false);
    setDismissed(true);
    if (restoreFocus) {
      skipFocusOpenRef.current = document.activeElement !== triggerRef.current;
      triggerRef.current?.focus();
    }
  }, []);

  function togglePinned() {
    setLogoutError('');
    if (pinned) {
      setPinned(false);
      setDismissed(true);
    } else {
      setPinned(true);
      setDismissed(false);
    }
  }

  async function handleLogout() {
    if (!canLogout) return;
    dismiss();
    setLogoutError('');
    try {
      await onLogout();
    } catch {
      setLogoutError('Không thể đăng xuất lúc này. Hãy thử lại.');
    }
  }

  useEffect(() => {
    dismiss();
  }, [dismiss, location.key]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) dismiss();
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss({ restoreFocus: true });
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dismiss, isOpen]);

  function handleFocus() {
    if (skipFocusOpenRef.current) {
      skipFocusOpenRef.current = false;
      setFocusWithin(true);
      return;
    }
    setDismissed(false);
    setFocusWithin(true);
  }

  function handleBlur(event) {
    if (!rootRef.current?.contains(event.relatedTarget)) setFocusWithin(false);
  }

  function handlePointerEnter(event) {
    if (event.pointerType === 'touch') return;
    setDismissed(false);
    setHovered(true);
  }

  function handlePointerLeave(event) {
    if (event.pointerType === 'touch') return;
    setHovered(false);
  }

  return <div className="pwc-avatar-menu" ref={rootRef}
    onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}
    onFocus={handleFocus} onBlur={handleBlur} data-pinned={pinned ? 'true' : 'false'}>
    <button ref={triggerRef} className="pwc-avatar-menu__trigger" type="button"
      aria-label={displayName ? 'Tài khoản của ' + displayName : 'Tài khoản'}
      aria-expanded={isOpen} aria-pressed={pinned} aria-controls={panelId} onClick={togglePinned}>
      {iconOnly ? <svg className="pwc-avatar-menu__user-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="7" r="3.5" /><path d="M4 21v-3c0-3 3.6-5 8-5s8 2 8 5v3H4Z" /></svg> : <span className="pwc-avatar-menu__avatar" aria-hidden="true">{getInitials(displayName)}</span>}
      <span className="pwc-avatar-menu__trigger-name">{accountName}</span>
    </button>

    <div id={panelId} className="pwc-avatar-menu__panel" hidden={!isOpen}>
      <div className="pwc-avatar-menu__panel-surface">
        <div className="pwc-avatar-menu__identity">
          <span className="pwc-avatar-menu__identity-name">{accountName}</span>
          <span className="pwc-avatar-menu__identity-role">{roleLabels.role}</span>
        </div>
        <nav className="pwc-avatar-menu__links" aria-label="Tùy chọn tài khoản">
          {customerNavigation ? <>
            <div className="pwc-avatar-menu__account-group"><Link to="/account/profile" onClick={() => dismiss()}>Trung tâm tài khoản</Link>
              <div className="pwc-avatar-menu__account-subnav"><Link to="/account/profile" onClick={() => dismiss()}>Hồ sơ</Link>
                <Link to="/account/addresses" onClick={() => dismiss()}>Quản lý địa chỉ</Link></div></div>
            <Link to="/account/pets" onClick={() => dismiss()}>Quản lý hồ sơ các thú cưng</Link>
            <Link to="/account/bookings" onClick={() => dismiss()}>Đơn hàng</Link>
          </> : <Link to="/account" onClick={() => dismiss()}>{roleLabels.account}</Link>}
          {notificationTo
            ? <Link to={notificationTo} onClick={() => dismiss()}>{roleLabels.notifications}</Link>
            : <button type="button" disabled aria-describedby={notificationNoteId}>
              {roleLabels.notifications}
            </button>}
          <button type="button" onClick={handleLogout} disabled={!canLogout}
            aria-describedby={!canLogout ? logoutNoteId : undefined}>Đăng xuất</button>
        </nav>
        {!notificationTo && <p className="pwc-avatar-menu__note" id={notificationNoteId} role="status">
          Thông báo hiện chưa khả dụng.
        </p>}
        {!canLogout && <p className="pwc-avatar-menu__note" id={logoutNoteId} role="status">
          Đăng xuất hiện chưa khả dụng.
        </p>}
      </div>
    </div>
    {logoutError && <p className="pwc-avatar-menu__error" role="alert">{logoutError}</p>}
  </div>;
}
