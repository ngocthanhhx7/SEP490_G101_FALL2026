import { Route, Routes } from 'react-router-dom';
import { FoundationLayout } from '../layouts/FoundationLayout.jsx';
import { FoundationPage } from '../pages/public/FoundationPage.jsx';
import { SignInPendingPage } from '../pages/public/SignInPendingPage.jsx';
import { AccountSettingsPage } from '../pages/account/AccountSettingsPage.jsx';
import { RequireSession } from './RequireSession.jsx';

export function AppRoutes() {
  return <Routes>
    <Route element={<FoundationLayout />}>
      <Route index element={<FoundationPage />} />
      <Route path="sign-in" element={<SignInPendingPage />} />
      <Route element={<RequireSession />}>
        <Route path="account" element={<section><h1>Tài khoản</h1>
          <p>Các chức năng tài khoản đang được hoàn thiện.</p></section>} />
        <Route path="account/settings" element={<AccountSettingsPage />} />
      </Route>
      <Route path="*" element={<section><h1>Không tìm thấy trang</h1>
        <p>Hãy chọn một liên kết trong thanh điều hướng.</p></section>} />
    </Route>
  </Routes>;
}
