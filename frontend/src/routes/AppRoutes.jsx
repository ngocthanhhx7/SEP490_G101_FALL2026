import { Route, Routes } from 'react-router-dom';
import { FoundationLayout } from '../layouts/FoundationLayout.jsx';
import { FoundationPage } from '../pages/public/FoundationPage.jsx';
import { SignInPendingPage } from '../pages/public/SignInPendingPage.jsx';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage.jsx';
import { AccountPage } from '../pages/account/AccountPage.jsx';
import { RequireSession } from './RequireSession.jsx';

export function AppRoutes() {
  return <Routes>
    <Route element={<RequireSession roles={['ADMIN']} />}>
      <Route path="admin/users" element={<AdminUsersPage />} />
    </Route>
    <Route element={<FoundationLayout />}>
      <Route index element={<FoundationPage />} />
      <Route path="sign-in" element={<SignInPendingPage />} />
      <Route element={<RequireSession />}>
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<section><h1>Không tìm thấy trang</h1>
        <p>Hãy chọn một liên kết trong thanh điều hướng.</p></section>} />
    </Route>
  </Routes>;
}
