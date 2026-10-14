import { Route, Routes } from 'react-router-dom';
import { FoundationLayout } from '../layouts/FoundationLayout.jsx';
import { FoundationPage } from '../pages/public/FoundationPage.jsx';
import { SignInPendingPage } from '../pages/public/SignInPendingPage.jsx';
import { RequireSession } from './RequireSession.jsx';
import { publicPolicyFallbackRoutes } from './PublicPolicyRoutes.jsx';
import { CustomerRegistrationPage } from '../pages/public/CustomerRegistrationPage.jsx';
import { SitterApplicationPage } from '../pages/public/SitterApplicationPage.jsx';
import { AdminServicesPage } from '../pages/admin/AdminServicesPage.jsx';
import { AdminServicePricesPage } from '../pages/admin/AdminServicePricesPage.jsx';
import { AdminSystemSettingsPage } from '../pages/admin/AdminSystemSettingsPage.jsx';
import { SitterApplicationsPage } from '../pages/admin/SitterApplicationsPage.jsx';
import { SitterApplicationReviewPage } from '../pages/admin/SitterApplicationReviewPage.jsx';
import { CustomerAddressesPage } from '../pages/customer/CustomerAddressesPage.jsx';
import { SitterAvailabilityPage } from '../pages/sitter/SitterAvailabilityPage.jsx';

export function AppRoutes({ publicPolicyRouteElements = publicPolicyFallbackRoutes }) {
  return <Routes>
    <Route element={<FoundationLayout />}>
      <Route index element={<FoundationPage />} />
      <Route path="sign-in" element={<SignInPendingPage />} />
      <Route path="register" element={<CustomerRegistrationPage />} />
      <Route path="sitter/apply" element={<SitterApplicationPage />} />
      {publicPolicyRouteElements}
      <Route element={<RequireSession />}>
        <Route path="account" element={<section><h1>Tài khoản</h1>
          <p>Các chức năng tài khoản đang được hoàn thiện.</p></section>} />
      </Route>
      <Route element={<RequireSession roles={['ADMIN']} />}>
        <Route path="admin/services" element={<AdminServicesPage />} />
        <Route path="admin/service-prices" element={<AdminServicePricesPage />} />
        <Route path="admin/system-settings" element={<AdminSystemSettingsPage />} />
        <Route path="admin/sitter-applications" element={<SitterApplicationsPage />} />
        <Route path="admin/sitter-applications/:applicationId" element={<SitterApplicationReviewPage />} />
      </Route>
      <Route element={<RequireSession roles={['CUSTOMER']} />}>
        <Route path="account/addresses" element={<CustomerAddressesPage />} />
      </Route>
      <Route element={<RequireSession roles={['PET_SITTER']} />}>
        <Route path="sitter/availability" element={<SitterAvailabilityPage />} />
      </Route>
      <Route path="*" element={<section><h1>Không tìm thấy trang</h1>
        <p>Hãy chọn một liên kết trong thanh điều hướng.</p></section>} />
    </Route>
  </Routes>;
}
