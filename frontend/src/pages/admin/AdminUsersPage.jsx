import './admin-users.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  BrandLogo,
  Dialog,
  Input,
  Notice,
  Select
} from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { WorkspaceAnalytics } from '../../components/common/WorkspaceAnalytics.jsx';
import { RowActionMenu } from '../../components/common/RowActionMenu.jsx';
import { Eye, LockKeyhole, UnlockKeyhole, UserCog } from 'lucide-react';
import { UserRolesDialog } from './UserRolesDialog.jsx';

const ROLE_LABELS = {
  CUSTOMER: 'Khách hàng',
  PET_SITTER: 'Pet sitter',
  STAFF: 'Nhân viên',
  ADMIN: 'Quản trị viên'
};
const STATE_LABELS = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Đã khóa',
  SUSPENDED: 'Tạm ngưng'
};

function initials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase('vi-VN') ?? '')
      .join('') || 'AD'
  );
}

function accountDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Chưa có thông tin'
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date);
}

function apiErrorMessage(error, action) {
  if (error?.status === 401)
    return 'Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.';
  if (error?.status === 403)
    return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.';
  if (error?.status === 404)
    return 'Không tìm thấy tài khoản hoặc thông tin không còn khả dụng.';
  if (error?.status === 409)
    return 'Tài khoản vừa được cập nhật ở nơi khác. Hãy tải lại danh sách trước khi thử lại.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') {
    return action
      ? 'Chưa nhận được phản hồi xác nhận. Hãy tải lại trạng thái tài khoản trước khi thử lại.'
      : 'Không thể kết nối máy chủ. Kiểm tra kết nối rồi thử tải lại.';
  }
  if (error?.code === 'INVALID_RESPONSE')
    return 'Máy chủ chưa trả đủ thông tin để xác nhận kết quả. Hãy tải lại trạng thái trước khi thử lại.';
  if (error?.code === 'CSRF_NOT_READY')
    return 'Phiên bảo mật chưa sẵn sàng cho thao tác quản trị. Vui lòng đăng nhập lại.';
  return 'Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.';
}

function StatePill({ state }) {
  return (
    <span
      className={`admin-state-pill admin-state-pill--${state.toLowerCase()}`}
    >
      <span className="admin-state-dot" aria-hidden="true" />
      {STATE_LABELS[state] ?? 'Không xác định'}
    </span>
  );
}

function RoleList({ roles = [] }) {
  return (
    <div className="admin-role-list">
      {roles.map((role) => (
        <span className="admin-role-tag" key={role}>
          {ROLE_LABELS[role] ?? role}
        </span>
      ))}
    </div>
  );
}

function AccountMenu({ user, onLogout, logoutPending, logoutError }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`admin-account-menu${open ? ' is-open' : ''}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        className="admin-avatar-trigger"
        type="button"
        aria-label="Mở tùy chọn tài khoản"
        aria-controls="admin-account-dropdown"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="admin-avatar" aria-hidden="true">
          {initials(user?.displayName)}
        </span>
        <span className="admin-avatar-copy">
          <strong>{user?.displayName ?? 'Quản trị viên'}</strong>
          <small>Quản trị viên</small>
        </span>
        <span className="admin-avatar-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      <div
        className="admin-account-dropdown"
        id="admin-account-dropdown"
        aria-label="Tùy chọn tài khoản"
      >
        <div className="admin-dropdown-identity">
          <span className="admin-avatar admin-avatar--small" aria-hidden="true">
            {initials(user?.displayName)}
          </span>
          <span>
            <strong>{user?.displayName ?? 'Quản trị viên'}</strong>
            <small>Tài khoản quản trị</small>
          </span>
        </div>
        <Link
          className="admin-dropdown-link"
          to="/account"
          onClick={() => setOpen(false)}
        >
          <span className="admin-dropdown-icon" aria-hidden="true">
            ◎
          </span>
          Quản lý tài khoản
        </Link>
        <Button
          variant="ghost"
          className="admin-dropdown-logout"
          disabled={logoutPending}
          loading={logoutPending}
          loadingLabel="Đang đăng xuất…"
          onClick={onLogout}
        >
          <span className="admin-dropdown-icon" aria-hidden="true">
            ↪
          </span>
          Đăng xuất
        </Button>
        {logoutError && (
          <p className="admin-logout-error" role="alert">
            {logoutError}
          </p>
        )}
      </div>
    </div>
  );
}

function AccountDetail({
  resource,
  user,
  onDecision,
  onRoles,
  actionsDisabled = false
}) {
  if (!user)
    return (
      <aside
        className="admin-detail-panel admin-detail-empty"
        aria-label="Chi tiết tài khoản"
      >
        <span className="admin-detail-mark" aria-hidden="true">
          ♧
        </span>
        <h2>Chọn một tài khoản</h2>
        <p>Thông tin tài khoản được giới hạn theo quyền quản trị của bạn.</p>
      </aside>
    );

  return (
    <aside
      className="admin-detail-panel"
      aria-label={`Chi tiết ${user.displayName}`}
    >
      <div className="admin-detail-heading">
        <div>
          <span className="admin-eyebrow">HỒ SƠ TÀI KHOẢN</span>
          <h2>Chi tiết</h2>
        </div>
        <span className="admin-detail-mark" aria-hidden="true">
          ♧
        </span>
      </div>
      {resource.status === 'loading' ? (
        <div className="admin-detail-skeleton" role="status">
          Đang tải chi tiết…
        </div>
      ) : null}
      {resource.status === 'forbidden' && (
        <Notice state="forbidden" title="Không có quyền xem">
          Yêu cầu này không được phép.
        </Notice>
      )}
      {resource.status === 'error' && (
        <Notice
          state="error"
          title="Không tải được chi tiết"
          action={
            <Button variant="secondary" onClick={resource.retry}>
              Thử lại
            </Button>
          }
        >
          {apiErrorMessage({ code: resource.code })}
        </Notice>
      )}
      {resource.status === 'success' && (
        <>
          <div className="admin-detail-person">
            <span
              className="admin-avatar admin-avatar--detail"
              aria-hidden="true"
            >
              {initials(user.displayName)}
            </span>
            <div>
              <h3>{user.displayName}</h3>
              <p>
                Mã tài khoản{' '}
                <span className="admin-numeric">
                  {user.id.slice(-8).toUpperCase()}
                </span>
              </p>
            </div>
          </div>
          <div className="admin-detail-block">
            <span className="admin-eyebrow">TRẠNG THÁI</span>
            <StatePill state={user.state} />
          </div>
          <div className="admin-detail-block">
            <span className="admin-eyebrow">VAI TRÒ</span>
            <RoleList roles={user.roles} />
          </div>
          <div className="admin-detail-block">
            <span className="admin-eyebrow">THÔNG TIN LIÊN HỆ ĐÃ CHE</span>
            {user.contacts?.length ? (
              <ul className="admin-contact-list">
                {user.contacts.map((contact, index) => (
                  <li key={`${contact.channel}-${index}`}>
                    <span>
                      {contact.channel === 'EMAIL' ? 'Email' : 'Điện thoại'}
                    </span>
                    <strong>{contact.maskedValue}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-muted">Chưa có liên hệ đã xác minh.</p>
            )}
          </div>
          <div className="admin-detail-block">
            <span className="admin-eyebrow">THỜI GIAN</span>
            <dl className="admin-dates">
              <div>
                <dt>Tham gia</dt>
                <dd>{accountDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt>Cập nhật</dt>
                <dd>{accountDate(user.updatedAt)}</dd>
              </div>
            </dl>
          </div>
          {onRoles && <Button variant="secondary" className="admin-detail-action" disabled={actionsDisabled} onClick={() => onRoles(user)}>Đổi vai trò</Button>}
          {user.state === 'ACTIVE' && (
            <Button
              variant="danger"
              className="admin-detail-action"
              disabled={actionsDisabled}
              onClick={() => onDecision('LOCK', user)}
            >
              Khóa tài khoản
            </Button>
          )}
          {user.state === 'LOCKED' && (
            <Button
              variant="secondary"
              className="admin-detail-action"
              disabled={actionsDisabled}
              onClick={() => onDecision('UNLOCK', user)}
            >
              Mở khóa tài khoản
            </Button>
          )}
          {user.state === 'SUSPENDED' && (
            <p className="admin-muted">
              Tài khoản tạm ngưng cần được xử lý theo quy trình riêng.
            </p>
          )}
        </>
      )}
    </aside>
  );
}

export function AdminUsersPage({ apiRequest, embedded = false }) {
  const session = useSession();
  const mainRef = useRef(null);
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, []);
  const request = useMemo(
    () =>
      apiRequest ??
      createApiClient({
        getCsrfToken: session.getCsrfToken,
        onUnauthorized: session.invalidate
      }),
    [apiRequest, session.getCsrfToken, session.invalidate]
  );
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', state: '' });
  const [cursor, setCursor] = useState('');
  const [cursorHistory, setCursorHistory] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [decision, setDecision] = useState(null);
  const [roleUser, setRoleUser] = useState(null);
  const [roleResult, setRoleResult] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [commandPending, setCommandPending] = useState(false);
  const [commandError, setCommandError] = useState('');
  const [decisionResult, setDecisionResult] = useState(null);
  const [analyticsRevision, setAnalyticsRevision] = useState(0);
  const [decisionPending, setDecisionPending] = useState(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const listLoader = useCallback(
    ({ signal }) => {
      const params = new window.URLSearchParams({ limit: '20' });
      if (filters.search) params.set('search', filters.search);
      if (filters.role) params.set('role', filters.role);
      if (filters.state) params.set('state', filters.state);
      if (cursor) params.set('cursor', cursor);
      return request(`/users?${params.toString()}`, { signal });
    },
    [request, filters, cursor]
  );
  const list = useApiResource(listLoader);

  const detailLoader = useCallback(
    ({ signal }) =>
      selectedId
        ? request(`/users/${encodeURIComponent(selectedId)}`, { signal })
        : Promise.resolve({ data: null }),
    [request, selectedId]
  );
  const detail = useApiResource(detailLoader);
  const users = list.data?.users ?? [];
  const selectedUser =
    detail.status === 'success'
      ? detail.data
      : users.find((user) => user.id === selectedId);
  const currentAdmin = session.user;

  function applyFilters(event) {
    event.preventDefault();
    setFilters({ ...filters, search: searchInput.trim() });
    setCursor('');
    setCursorHistory([]);
    setSelectedId('');
  }

  function changeFilter(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setCursor('');
    setCursorHistory([]);
    setSelectedId('');
  }

  function openDecision(action, user) {
    setDecision({ action, user });
    setReason('');
    setReasonError('');
    setCommandError('');
    setDecisionResult(null);
    setDecisionPending(null);
  }

  async function confirmDecision(event) {
    event.preventDefault();
    if (!decision) return;
    if (reason.trim().length < 3) {
      setReasonError('Nhập lý do có ít nhất 3 ký tự.');
      return;
    }
    setCommandPending(true);
    setCommandError('');
    try {
      const response = await request(
        `/users/${encodeURIComponent(decision.user.id)}/lock-decisions`,
        {
          method: 'POST',
          body: {
            action: decision.action,
            expectedVersion: decision.user.version,
            reason: reason.trim()
          }
        }
      );
      if (response.pending || response.status === 202) {
        setDecisionPending(decision);
        setDecision(null);
        return;
      }
      const expectedState = decision.action === 'LOCK' ? 'LOCKED' : 'ACTIVE';
      if (response.data?.state !== expectedState) {
        const error = new Error(
          'Server response did not confirm the account state'
        );
        error.code = 'INVALID_RESPONSE';
        throw error;
      }
      setDecisionResult({
        displayName: decision.user.displayName,
        state: response.data?.state
      });
      setDecision(null);
      setAnalyticsRevision(value => value + 1);
      list.retry();
      if (selectedId) detail.retry();
    } catch (error) {
      setCommandError(apiErrorMessage(error, true));
      if (error?.status === 401) session.invalidate();
    } finally {
      setCommandPending(false);
    }
  }

  async function logout() {
    setLogoutPending(true);
    setLogoutError('');
    try {
      await session.logout();
    } catch (error) {
      setLogoutError(
        error?.code === 'LOGOUT_NOT_AVAILABLE'
          ? 'Đăng xuất sẽ khả dụng khi luồng phiên và CSRF được tích hợp.'
          : apiErrorMessage(error, true)
      );
    } finally {
      setLogoutPending(false);
    }
  }

  const displayName = currentAdmin?.displayName ?? 'Quản trị viên';

  return (
    <div className={'admin-page' + (embedded ? ' admin-page--embedded' : '')}>
      <a className="admin-skip-link" href="#admin-main">
        Đến nội dung quản trị
      </a>
      {!embedded && <header className="admin-topbar">
        <Link
          to="/"
          className="admin-brand"
          aria-label="Paw World Care — Trang chủ"
        >
          <BrandLogo orientation="horizontal" alt="Paw World Care" />
          <span className="admin-brand-divider" aria-hidden="true" />
          <span className="admin-brand-label">TRUNG TÂM QUẢN TRỊ</span>
        </Link>
        <div className="admin-topbar-right">
          <span className="admin-secure-label">
            <span aria-hidden="true">●</span> Phiên quản trị
          </span>
          <AccountMenu
            user={currentAdmin}
            onLogout={logout}
            logoutPending={logoutPending}
            logoutError={logoutError}
          />
        </div>
      </header>}

      <div className="admin-frame">
        {!embedded && <aside className="admin-sidebar">
          <div className="admin-sidebar-heading">
            <span className="admin-eyebrow">KHÔNG GIAN LÀM VIỆC</span>
            <h2>Quản trị</h2>
          </div>
          <nav className="admin-navigation" aria-label="Điều hướng quản trị">
            <span className="admin-nav-section">TỔNG QUAN</span>
            <Link
              className="admin-nav-item"
              to="/admin/users"
              aria-current="page"
            >
              <span className="admin-nav-icon" aria-hidden="true">
                ⌂
              </span>
              <span>Quản lý tài khoản</span>
              <span className="admin-nav-arrow" aria-hidden="true">
                ›
              </span>
            </Link>
            <div className="admin-sidebar-note">
              <span className="admin-sidebar-note-mark" aria-hidden="true">
                ✦
              </span>
              <strong>Quyền quản trị</strong>
              <p>
                Các quyết định khóa tài khoản được ghi nhận cho mục đích kiểm
                tra.
              </p>
            </div>
          </nav>
          <div className="admin-sidebar-footer">
            <span className="admin-sidebar-paw" aria-hidden="true">
              ♡
            </span>
            <span>
              Chăm sóc tận tâm
              <br />
              <strong>Paw World Care</strong>
            </span>
          </div>
        </aside>}

        <main
          className="admin-main"
          id="admin-main"
          tabIndex={-1}
          ref={mainRef}
        >
          <div className="admin-content">
            <div className="admin-breadcrumb">
              <span>Quản trị</span>
              <span aria-hidden="true">/</span>
              <strong>Tài khoản người dùng</strong>
            </div>
            <section className="admin-page-heading">
              <div>
                <span className="admin-eyebrow">QUẢN LÝ HỆ THỐNG</span>
                <h1>Quản lý tài khoản</h1>
                <p>
                  Tìm kiếm, xem thông tin đã bảo vệ và quản lý trạng thái tài
                  khoản.
                </p>
              </div>
              <div className="admin-heading-art" aria-hidden="true">
                <span>♧</span>
                <i>✦</i>
              </div>
            </section>

            {embedded && <WorkspaceAnalytics key={analyticsRevision} kind="users" />}
            {roleResult && <Notice state="success" title="Đã cập nhật vai trò">Máy chủ đã xác nhận thay đổi vai trò cho {roleResult}. Các phiên cũ của tài khoản đã bị thu hồi.</Notice>}
            {decisionResult?.state && (
              <Notice
                state="success"
                title={
                  decisionResult.state === 'LOCKED'
                    ? 'Đã khóa tài khoản'
                    : 'Đã mở khóa tài khoản'
                }
              >
                Máy chủ đã xác nhận cập nhật trạng thái cho{' '}
                {decisionResult.displayName}.
              </Notice>
            )}
            {decisionPending && (
              <Notice
                state="pending"
                title="Đang chờ kết quả quyết định"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDecisionPending(null);
                      list.retry();
                      if (selectedId) detail.retry();
                    }}
                  >
                    Tải lại trạng thái
                  </Button>
                }
              >
                Máy chủ chưa xác nhận thay đổi cho{' '}
                {decisionPending.user.displayName}. Hãy tải lại trạng thái trước
                khi gửi thao tác khác.
              </Notice>
            )}
            {commandError && !decision && (
              <Notice
                state="error"
                title="Thao tác chưa được xác nhận"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCommandError('');
                      list.retry();
                    }}
                  >
                    Tải lại danh sách
                  </Button>
                }
              >
                {commandError}
              </Notice>
            )}

            <div className="admin-management-grid">
              <section
                className="admin-panel admin-list-panel"
                aria-labelledby="accounts-title"
              >
                <div className="admin-panel-heading">
                  <div>
                    <span className="admin-eyebrow">DANH BẠ</span>
                    <h2 id="accounts-title">Tài khoản người dùng</h2>
                  </div>
                  <span className="admin-page-count">
                    {list.status === 'success'
                      ? `${users.length} tài khoản trên trang`
                      : 'Danh sách tài khoản'}
                  </span>
                </div>
                <form className="admin-filters" onSubmit={applyFilters}>
                  <div className="admin-search-field">
                    <Input
                      label="Tìm tài khoản"
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Tên người dùng"
                      autoComplete="off"
                    />
                    <span className="admin-search-glyph" aria-hidden="true">
                      ⌕
                    </span>
                  </div>
                  <Select
                    label="Vai trò"
                    value={filters.role}
                    onChange={(event) =>
                      changeFilter('role', event.target.value)
                    }
                  >
                    <option value="">Tất cả vai trò</option>
                    <option value="CUSTOMER">Khách hàng</option>
                    <option value="PET_SITTER">Pet sitter</option>
                    <option value="STAFF">Nhân viên</option>
                    <option value="ADMIN">Quản trị viên</option>
                  </Select>
                  <Select
                    label="Trạng thái"
                    value={filters.state}
                    onChange={(event) =>
                      changeFilter('state', event.target.value)
                    }
                  >
                    <option value="">Tất cả trạng thái</option>
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="LOCKED">Đã khóa</option>
                    <option value="SUSPENDED">Tạm ngưng</option>
                  </Select>
                  <Button type="submit" className="admin-filter-submit">
                    Tìm kiếm
                  </Button>
                </form>

                {list.status === 'loading' && (
                  <div
                    className="admin-list-loading"
                    role="status"
                    aria-label="Đang tải danh sách"
                  >
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                {list.status === 'pending' && (
                  <Notice state="pending" title="Đang chờ máy chủ xác nhận">
                    Danh sách chưa có phản hồi hoàn tất.
                  </Notice>
                )}
                {list.status === 'forbidden' && (
                  <Notice state="forbidden" title="Không có quyền truy cập">
                    Chỉ quản trị viên được xem danh sách tài khoản.
                  </Notice>
                )}
                {list.status === 'error' && (
                  <Notice
                    state="error"
                    title="Không tải được danh sách"
                    action={
                      <Button variant="secondary" onClick={list.retry}>
                        Thử lại
                      </Button>
                    }
                  >
                    {apiErrorMessage({ code: list.code })}
                  </Notice>
                )}
                {(list.status === 'empty' ||
                  (list.status === 'success' && users.length === 0)) && (
                  <Notice
                    state="empty"
                    title="Chưa có tài khoản phù hợp"
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSearchInput('');
                          setFilters({ search: '', role: '', state: '' });
                          setCursor('');
                          setCursorHistory([]);
                        }}
                      >
                        Xóa bộ lọc
                      </Button>
                    }
                  >
                    Thử đổi từ khóa hoặc bộ lọc để tìm tài khoản.
                  </Notice>
                )}
                {list.status === 'success' && users.length > 0 && (
                  <>
                    <div className="admin-table-scroll" aria-busy="false">
                      <table className="admin-users-table">
                        <thead>
                          <tr>
                            <th scope="col">TÀI KHOẢN</th>
                            <th scope="col">VAI TRÒ</th>
                            <th scope="col">LIÊN HỆ ĐÃ CHE</th>
                            <th scope="col">TRẠNG THÁI</th>
                            <th scope="col">
                              <span className="admin-visually-hidden">
                                Thao tác
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr
                              key={user.id}
                              className={
                                selectedId === user.id ? 'is-selected' : ''
                              }
                            >
                              <td data-label="Tài khoản">
                                <div className="admin-table-person">
                                  <span
                                    className="admin-avatar admin-avatar--table"
                                    aria-hidden="true"
                                  >
                                    {initials(user.displayName)}
                                  </span>
                                  <span>
                                    <strong>{user.displayName}</strong>
                                    <small>
                                      Mã {user.id.slice(-8).toUpperCase()}
                                    </small>
                                  </span>
                                </div>
                              </td>
                              <td data-label="Vai trò">
                                <RoleList roles={user.roles} />
                              </td>
                              <td data-label="Liên hệ đã che">
                                <div className="admin-table-contacts">
                                  {user.contacts.length ? (
                                    user.contacts.map((contact, index) => (
                                      <span key={`${contact.channel}-${index}`}>
                                        {contact.maskedValue}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="admin-muted">Chưa có</span>
                                  )}
                                </div>
                              </td>
                              <td data-label="Trạng thái">
                                <StatePill state={user.state} />
                              </td>
                              <td data-label="Chi tiết">
                                {embedded ? <RowActionMenu label={`Thao tác ${user.displayName}`} actions={[
                                  { label: 'Xem chi tiết', icon: Eye, onClick: () => setSelectedId(user.id) },
                                  ...(user.id !== currentAdmin?.id ? [{ label: 'Đổi vai trò', icon: UserCog, onClick: () => { setRoleResult(''); setRoleUser(user); } }] : []),
                                  ...(user.state === 'ACTIVE' ? [{ label: 'Khóa tài khoản', icon: LockKeyhole, onClick: () => openDecision('LOCK', user) }]
                                    : user.state === 'LOCKED' ? [{ label: 'Mở khóa tài khoản', icon: UnlockKeyhole, onClick: () => openDecision('UNLOCK', user) }] : [])
                                ]} /> : <Button
                                  variant="ghost"
                                  className="admin-view-button"
                                  aria-label={`Xem chi tiết ${user.displayName}`}
                                  onClick={() => setSelectedId(user.id)}
                                >
                                  Chi tiết <span aria-hidden="true">›</span>
                                </Button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="admin-pagination">
                      <p>
                        {users.length
                          ? `Trang ${cursorHistory.length + 1}`
                          : 'Không có kết quả'}
                      </p>
                      <div>
                        <Button
                          variant="secondary"
                          disabled={
                            !cursorHistory.length || list.status === 'loading'
                          }
                          onClick={() => {
                            const previous = [...cursorHistory];
                            setCursor(previous.pop() ?? '');
                            setCursorHistory(previous);
                          }}
                        >
                          Trước
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={
                            !list.data?.nextCursor || list.status === 'loading'
                          }
                          onClick={() => {
                            setCursorHistory((items) => [...items, cursor]);
                            setCursor(list.data.nextCursor);
                          }}
                        >
                          Tiếp theo
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </section>

              {(!embedded || selectedId) && <AccountDetail
                resource={detail}
                user={selectedUser}
                onDecision={openDecision}
                onRoles={selectedUser?.id !== currentAdmin?.id ? user => { setRoleResult(''); setRoleUser(user); } : undefined}
                actionsDisabled={Boolean(decisionPending) || commandPending}
              />}
            </div>
            {!embedded && <footer className="admin-page-footer">
              Paw World Care <span aria-hidden="true">·</span> Trung tâm quản
              trị
              <span className="admin-footer-version">
                Chỉ thông tin cần thiết được hiển thị
              </span>
            </footer>}
          </div>
        </main>
      </div>

      {roleUser && <UserRolesDialog key={roleUser.id + ':' + roleUser.version} user={roleUser} request={request}
        onClose={() => setRoleUser(null)} onReload={() => { setRoleUser(null); list.retry(); if (selectedId) detail.retry(); }}
        onChanged={user => { setRoleUser(null); setRoleResult(user.displayName); setAnalyticsRevision(value => value + 1); list.retry(); if (selectedId) detail.retry(); }} />}
      <Dialog
        open={Boolean(decision)}
        onClose={() => {
          if (!commandPending) setDecision(null);
        }}
        intent={decision?.action === 'LOCK' ? 'destructive' : 'default'}
        dismissible={!commandPending}
        title={
          decision?.action === 'LOCK'
            ? 'Xác nhận khóa tài khoản'
            : 'Xác nhận mở khóa tài khoản'
        }
        description={
          decision?.action === 'LOCK'
            ? 'Người dùng sẽ bị đăng xuất khỏi tất cả phiên và không thể đăng nhập cho đến khi được mở khóa.'
            : 'Tài khoản sẽ có thể đăng nhập lại. Các phiên cũ vẫn bị thu hồi.'
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={commandPending}
              onClick={() => setDecision(null)}
            >
              Hủy
            </Button>
            <Button
              form="admin-account-decision"
              type="submit"
              variant={decision?.action === 'LOCK' ? 'danger' : 'primary'}
              loading={commandPending}
              loadingLabel="Đang cập nhật…"
            >
              {decision?.action === 'LOCK'
                ? 'Khóa tài khoản'
                : 'Mở khóa tài khoản'}
            </Button>
          </>
        }
      >
        {decision && (
          <form
            id="admin-account-decision"
            className="admin-decision-form"
            onSubmit={confirmDecision}
          >
            <p className="admin-decision-user">
              <strong>{decision.user.displayName}</strong>
              <span>
                <StatePill state={decision.user.state} />
              </span>
            </p>
            <Input
              label="Lý do quyết định"
              value={reason}
              error={reasonError}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError('');
              }}
              minLength={3}
              maxLength={1000}
              required
              autoComplete="off"
              hint="Lý do sẽ được ghi cùng quyết định quản trị."
            />
            {commandError && (
              <Notice
                state="error"
                title="Chưa hoàn tất"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDecision(null);
                      list.retry();
                      if (selectedId) detail.retry();
                    }}
                  >
                    Tải lại trạng thái
                  </Button>
                }
              >
                {commandError}
              </Notice>
            )}
          </form>
        )}
      </Dialog>
    </div>
  );
}
