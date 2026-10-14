import { Route, Routes } from 'react-router-dom';
import { FoundationLayout } from '../layouts/FoundationLayout.jsx';
import { FoundationPage } from '../pages/public/FoundationPage.jsx';
import { SignInPage } from '../pages/public/SignInPage.jsx';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage.jsx';
import { AccountPage } from '../pages/account/AccountPage.jsx';
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
import { RoleDashboardLayout } from '../layouts/RoleDashboardLayout.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { ApplicationStatusPage } from '../pages/public/application-status/ApplicationStatusPage.jsx';
import { applicationStatusApi } from '../services/application-status-api.js';

const navigationByRole = {
  ADMIN: [
    ['Tài khoản', '/account'], ['Người dùng', '/admin/users'], ['Dịch vụ', '/admin/services'],
    ['Giá dịch vụ', '/admin/service-prices'], ['Cấu hình', '/admin/system-settings'],
    ['Hồ sơ ứng tuyển', '/admin/sitter-applications'],
  ],
  CUSTOMER: [['Tài khoản', '/account'], ['Địa chỉ', '/account/addresses']],
  PET_SITTER: [['Tài khoản', '/account'], ['Lịch làm việc', '/sitter/availability']],
  STAFF: [['Tài khoản', '/account']],
};
function Workspace({ role }) {
  return <RoleDashboardLayout role={role} navigationItems={(navigationByRole[role] || [])
    .map(([label, to]) => ({ label, to, end: true }))} />;
}
function AccountWorkspace() {
  const { user } = useSession();
  const roles = user?.roles || [user?.role];
  const role = ['ADMIN', 'STAFF', 'PET_SITTER', 'CUSTOMER'].find(value => roles.includes(value));
  return <Workspace role={role} />;
}

export function AppRoutes({ publicPolicyRouteElements = publicPolicyFallbackRoutes }) {
  return <Routes>
    <Route element={<RequireSession roles={['ADMIN']} />}>
      <Route element={<Workspace role="ADMIN" />}>
        <Route path="admin/users" element={<AdminUsersPage />} />
        <Route path="admin/services" element={<AdminServicesPage />} />
        <Route path="admin/service-prices" element={<AdminServicePricesPage />} />
        <Route path="admin/system-settings" element={<AdminSystemSettingsPage />} />
        <Route path="admin/sitter-applications" element={<SitterApplicationsPage />} />
        <Route path="admin/sitter-applications/:applicationId" element={<SitterApplicationReviewPage />} />
      </Route>
    </Route>
    <Route element={<RequireSession />}>
      <Route element={<AccountWorkspace />}><Route path="account" element={<AccountPage />} /></Route>
    </Route>
    <Route element={<RequireSession roles={['CUSTOMER']} />}>
      <Route element={<Workspace role="CUSTOMER" />}>
        <Route path="account/addresses" element={<CustomerAddressesPage />} />
      </Route>
    </Route>
    <Route element={<RequireSession roles={['PET_SITTER']} />}>
      <Route element={<Workspace role="PET_SITTER" />}>
        <Route path="sitter/availability" element={<SitterAvailabilityPage />} />
      </Route>
    </Route>
    <Route element={<FoundationLayout />}>
      <Route index element={<FoundationPage />} />
      <Route path="sign-in" element={<SignInPage />} />
      <Route path="register" element={<CustomerRegistrationPage />} />
      <Route path="sitter/apply" element={<SitterApplicationPage />} />
      <Route path="sitter/application-status" element={<ApplicationStatusPage api={applicationStatusApi} />} />
      {publicPolicyRouteElements}
      <Route path="*" element={<section><h1>Không tìm thấy trang</h1>
        <p>Hãy chọn một liên kết trong thanh điều hướng.</p></section>} />
    </Route>
  </Routes>;
}
