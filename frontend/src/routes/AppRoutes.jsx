import { CustomerProfilePage } from '../pages/customer/CustomerProfilePage.jsx';
import { Route, Routes } from 'react-router-dom';
import { FoundationLayout } from '../layouts/FoundationLayout.jsx';
import { PublicSiteLayout } from '../layouts/PublicSiteLayout.jsx';
import { HomePage } from '../pages/public/HomePage.jsx';
import { AboutPage } from '../pages/public/AboutPage.jsx';
import { ContactPage } from '../pages/public/ContactPage.jsx';
import { ServiceAreasPage } from '../pages/public/ServiceAreasPage.jsx';
import { ServiceDetailsPage } from '../pages/public/ServiceDetailsPage.jsx';
import { ServiceListPage } from '../pages/public/ServiceListPage.jsx';
import { SignInPage } from '../pages/public/SignInPage.jsx';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage.jsx';
import { AccountPage } from '../pages/account/AccountPage.jsx';
import { AccountSettingsPage } from '../pages/account/AccountSettingsPage.jsx';
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
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage.jsx';
import { AdminPayrollPage } from '../pages/admin/AdminPayrollPage.jsx';
import { CustomerDashboardPage } from '../pages/customer/CustomerDashboardPage.jsx';
import { SitterListPage } from '../pages/customer/SitterListPage.jsx';
import { SitterDashboardPage } from '../pages/sitter/SitterDashboardPage.jsx';
import { SitterEarningsPage } from '../pages/sitter/SitterEarningsPage.jsx';
import { SitterProfilePage } from '../pages/sitter/SitterProfilePage.jsx';
import { StaffDashboardPage } from '../pages/staff/StaffDashboardPage.jsx';
import { RoleDashboardLayout } from '../layouts/RoleDashboardLayout.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { ApplicationStatusPage } from '../pages/public/application-status/ApplicationStatusPage.jsx';
import { applicationStatusApi } from '../services/application-status-api.js';

const navigationByRole = {
  ADMIN: [
    ['Dashboard', '/admin/dashboard'], ['Payroll', '/admin/payroll'], ['Sitter list', '/admin/sitters'],
    ['Tài khoản', '/account'], ['Người dùng', '/admin/users'], ['Dịch vụ', '/admin/services'],
    ['Giá dịch vụ', '/admin/service-prices'], ['Cấu hình', '/admin/system-settings'],
    ['Hồ sơ ứng tuyển', '/admin/sitter-applications'],
  ],
  CUSTOMER: [['Dashboard', '/customer'], ['Sitter list', '/sitters'], ['Tài khoản', '/account'],
    ['Hồ sơ', '/account/profile'], ['Địa chỉ', '/account/addresses']],
  PET_SITTER: [['Dashboard', '/sitter'], ['Profile', '/sitter/profile'], ['Earnings', '/sitter/earnings'],
    ['Tài khoản', '/account'], ['Lịch làm việc', '/sitter/availability']],
  STAFF: [['Dashboard', '/staff'], ['Sitter list', '/staff/sitters'], ['Tài khoản', '/account']],
};
Object.values(navigationByRole).forEach((items) => {
  items.splice(1, 0, ['Cài đặt', '/account/settings']);
});
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
        <Route path="admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="admin/payroll" element={<AdminPayrollPage />} />
        <Route path="admin/sitters" element={<SitterListPage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
        <Route path="admin/services" element={<AdminServicesPage />} />
        <Route path="admin/service-prices" element={<AdminServicePricesPage />} />
        <Route path="admin/system-settings" element={<AdminSystemSettingsPage />} />
        <Route path="admin/sitter-applications" element={<SitterApplicationsPage />} />
        <Route path="admin/sitter-applications/:applicationId" element={<SitterApplicationReviewPage />} />
      </Route>
    </Route>
    <Route element={<RequireSession />}>
      <Route element={<AccountWorkspace />}>
        <Route path="account" element={<AccountPage />} />
        <Route path="account/settings" element={<AccountSettingsPage />} />
      </Route>
    </Route>
    <Route element={<RequireSession roles={['CUSTOMER']} />}>
      <Route element={<Workspace role="CUSTOMER" />}>
        <Route path="customer" element={<CustomerDashboardPage />} />
        <Route path="sitters" element={<SitterListPage />} />
        <Route path="account/profile" element={<CustomerProfilePage />} />
        <Route path="account/addresses" element={<CustomerAddressesPage />} />
      </Route>
    </Route>
    <Route element={<RequireSession roles={['PET_SITTER']} />}>
      <Route element={<Workspace role="PET_SITTER" />}>
        <Route path="sitter" element={<SitterDashboardPage />} />
        <Route path="sitter/profile" element={<SitterProfilePage />} />
        <Route path="sitter/earnings" element={<SitterEarningsPage />} />
        <Route path="sitter/availability" element={<SitterAvailabilityPage />} />
      </Route>
    </Route>
    <Route element={<RequireSession roles={['STAFF']} />}>
      <Route element={<Workspace role="STAFF" />}>
        <Route path="staff" element={<StaffDashboardPage />} />
        <Route path="staff/sitters" element={<SitterListPage />} />
      </Route>
    </Route>
    <Route element={<PublicSiteLayout />}>
      <Route index element={<HomePage />} />
      <Route path="about" element={<AboutPage />} />
      <Route path="contact" element={<ContactPage />} />
      <Route path="services" element={<ServiceListPage />} />
      <Route path="services/:serviceId" element={<ServiceDetailsPage />} />
      <Route path="service-areas" element={<ServiceAreasPage />} />
      <Route path="sign-in" element={<SignInPage />} />
    </Route>
    <Route element={<FoundationLayout />}>
      <Route path="register" element={<CustomerRegistrationPage />} />
      <Route path="sitter/apply" element={<SitterApplicationPage />} />
      <Route path="sitter/application-status" element={<ApplicationStatusPage api={applicationStatusApi} />} />
      {publicPolicyRouteElements}
      <Route path="*" element={<section><h1>Không tìm thấy trang</h1>
        <p>Hãy chọn một liên kết trong thanh điều hướng.</p></section>} />
    </Route>
  </Routes>;
}
