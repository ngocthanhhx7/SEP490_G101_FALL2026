import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../contexts/SessionContext.jsx';

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
  if (session.status === 'guest') return <Navigate to="/sign-in" replace
    state={{ from: location.pathname + location.search }} />;
  const userRoles = Array.isArray(session.user.roles) ? session.user.roles : [session.user.role];
  if (roles && !roles.some((role) => userRoles.includes(role)
    || (role === 'STAFF' && userRoles.includes('ADMIN')))) {
    return <section role="alert"><h1>Không có quyền truy cập</h1>
      <p>Tài khoản hiện tại không có quyền mở khu vực này.</p></section>;
  }
  return <Outlet />;
}
