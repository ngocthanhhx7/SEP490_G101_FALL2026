import { Route, Routes } from 'react-router-dom';
import { PublicSiteLayout } from '../layouts/PublicSiteLayout.jsx';
import { HomePage } from '../pages/public/HomePage.jsx';
import { ServiceAreasPage } from '../pages/public/ServiceAreasPage.jsx';
import { ServiceDetailsPage } from '../pages/public/ServiceDetailsPage.jsx';
import { ServiceListPage } from '../pages/public/ServiceListPage.jsx';
import { SignInPendingPage } from '../pages/public/SignInPendingPage.jsx';
import { RequireSession } from './RequireSession.jsx';

export function AppRoutes() {
  return <Routes>
    <Route element={<PublicSiteLayout />}>
      <Route index element={<HomePage />} />
      <Route path="services" element={<ServiceListPage />} />
      <Route path="services/:serviceId" element={<ServiceDetailsPage />} />
      <Route path="service-areas" element={<ServiceAreasPage />} />
      <Route path="policies/:policy" element={<section className="public-info"><h1>Chính sách PawWorld</h1><p>Nội dung chính sách đang được hoàn thiện và sẽ được công bố tại đây.</p></section>} />
      <Route path="sign-in" element={<SignInPendingPage />} />
      <Route element={<RequireSession />}>
        <Route path="account" element={<section><h1>Tài khoản</h1>
          <p>Các chức năng tài khoản đang được hoàn thiện.</p></section>} />
      </Route>
      <Route path="*" element={<section><h1>Không tìm thấy trang</h1>
        <p>Hãy chọn một liên kết trong thanh điều hướng.</p></section>} />
    </Route>
  </Routes>;
}
