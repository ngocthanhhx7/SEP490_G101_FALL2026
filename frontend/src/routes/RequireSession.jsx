import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext.jsx';
import { hasRole, primaryRole, roleLanding } from '../utils/role-access.js';

export function RequireSession({ roles }) {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') return <p role="status">Đang kiểm tra phiên…</p>;
  if (session.status === 'pending') return <section>
    <h1>Kết nối phiên đang chờ hoàn thiện</h1>
    <p role="status">Khu vực tài khoản sẽ khả dụng khi hệ thống đăng nhập sẵn sàng.</p>
  </section>;
  if (session.status === 'error') return <section role="alert">
    <h1>Không thể kiểm tra phiên</h1>
    <button onClick={session.refresh}>Thử lại</button>
  </section>;
  if (session.status !== 'authenticated' || !primaryRole(session.user)) return <Navigate to="/sign-in" replace
    state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.some((role) => hasRole(session.user, role))) {
    return <section role="alert"><h1>Không có quyền truy cập</h1>
      <p>Tài khoản hiện tại không có quyền mở khu vực này.</p>
      <Link to={roleLanding(session.user)}>Về khu vực của tôi</Link></section>;
  }
  return <Outlet />;
}
