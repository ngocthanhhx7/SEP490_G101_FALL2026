import { useMemo } from 'react';
import { PetListPage } from '../pages/customer/PetListPage.jsx';
import { PetDetailsPage } from '../pages/customer/PetDetailsPage.jsx';
import { CustomerBookingsPage } from '../pages/customer/CustomerBookingsPage.jsx';
import { SitterRecommendationsPage } from '../pages/customer/SitterRecommendationsPage.jsx';
import { NotificationsPage } from '../pages/notifications/NotificationsPage.jsx';
import { createPetApi } from '../services/pet-api.js';
import { createPetProfileApi } from '../services/pet-profile-api.js';
import { createNotificationsApi } from '../services/notifications-api.js';
import { createApiClient } from '../services/api-client.js';
import { CustomerProfilePage } from '../pages/customer/CustomerProfilePage.jsx';
import { Navigate, Route, Routes } from 'react-router-dom';
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
import { RegistrationPage } from '../pages/public/RegistrationPage.jsx';
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
import WeeklySettlementPage from '../pages/sitter/WeeklySettlementPage.jsx';
import { createSettlementApi } from '../services/settlement-api.js';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage.jsx';
import { AdminPayrollPage } from '../pages/admin/AdminPayrollPage.jsx';
import { CustomerDashboardPage } from '../pages/customer/CustomerDashboardPage.jsx';
import { SitterListPage } from '../pages/customer/SitterListPage.jsx';
import { SitterDashboardPage } from '../pages/sitter/SitterDashboardPage.jsx';
import { SitterEarningsPage } from '../pages/sitter/SitterEarningsPage.jsx';
import { SitterProfilePage } from '../pages/sitter/SitterProfilePage.jsx';
import { StaffDashboardPage } from '../pages/staff/StaffDashboardPage.jsx';
import { SitterPublicProfilePage } from '../pages/sitter/SitterPublicProfilePage.jsx';
import { SitterProfileReviewsPage } from '../pages/staff/SitterProfileReviewsPage.jsx';
import { createSitterPublicProfileApi } from '../services/sitter-public-profile-api.js';
import AdminSettlementsPage from '../pages/admin/AdminSettlementsPage.jsx';
import { createAdminSettlementApi } from '../services/admin-settlement-api.js';
import { createPrivateImageApi } from '../services/private-image-api.js';
import { createEmployeePayrollApi } from '../services/employee-payroll-api.js';
import { EmployeePayrollPage } from '../pages/sitter/EmployeePayrollPage.jsx';
import { EmployeePayrollAdminPage } from '../pages/admin/EmployeePayrollAdminPage.jsx';
import { createEmployeeSchedulingApi } from '../services/employee-scheduling-api.js';
import { SitterWorkAreasPanel } from '../pages/sitter/SitterWorkAreasPanel.jsx';
import { EmployeeDispatchPage } from '../pages/staff/EmployeeDispatchPage.jsx';
import { EmployeeInvitationsPage } from '../pages/sitter/EmployeeInvitationsPage.jsx';
import { DirectedBookingProposalPage } from '../pages/customer/DirectedBookingProposalPage.jsx';

function EmployeeScheduleRoute({ view }) {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createEmployeeSchedulingApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  if (view === 'areas') return <SitterWorkAreasPanel key={user?.id} api={api} />;
  if (view === 'dispatch') return <EmployeeDispatchPage key={user?.id} api={api} />;
  if (view === 'invitations') return <EmployeeInvitationsPage key={user?.id} api={api} />;
  if (view === 'proposal') return <DirectedBookingProposalPage key={user?.id} api={api} />;
  return <SitterAvailabilityPage key={user?.id} api={api} />;
}

function AdminSettlementRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createAdminSettlementApi(createApiClient({ getCsrfToken }), {
    privateImages: createPrivateImageApi({ getCsrfToken })
  }), [getCsrfToken]);
  return <AdminSettlementsPage key={user?.id} api={api} />;
}

function EmployeePayrollRoute({ admin = false }) {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createEmployeePayrollApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  return admin ? <EmployeePayrollAdminPage key={user?.id} api={api} /> : <EmployeePayrollPage key={user?.id} api={api} />;
}

function SitterSettlementRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createSettlementApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  return <WeeklySettlementPage key={user?.id} api={api} />;
}

function PublicProfileRoute({ review = false }) {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createSitterPublicProfileApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  return review ? <SitterProfileReviewsPage key={user?.id} api={api} /> : <SitterPublicProfilePage key={user?.id} api={api} />;
}

const navigationByRole = {
  ADMIN: [
    ['Dashboard', '/admin/dashboard'], ['Sitter list', '/admin/sitters'],
    ['Tài khoản', '/account'],
    ['Người dùng', '/admin/users'],
    ['Quản lý lương', '/admin/payroll'],
    ['Điều phối ca', '/staff/dispatch'],
    ['Dịch vụ', '/admin/services'],
    ['Giá dịch vụ', '/admin/service-prices'],
    ['Cấu hình', '/admin/system-settings'],
    ['Hồ sơ ứng tuyển', '/admin/sitter-applications'],
    ['Duyệt tất toán', '/admin/settlements'],
    ['Hồ sơ công khai', '/staff/sitter-profiles']
  ],
  CUSTOMER: [
    ['Dashboard', '/customer'], ['Sitter list', '/sitters'],
    ['Tài khoản', '/account'],
    ['Hồ sơ', '/account/profile'],
    ['Địa chỉ', '/account/addresses'],
    ['Thú cưng', '/account/pets'],
    ['Đơn hàng', '/account/bookings'],
    ['Tìm sitter', '/account/sitter-recommendations'],
    ['Thông báo', '/account/notifications']
  ],
  PET_SITTER: [
    ['Dashboard', '/sitter'], ['Profile', '/sitter/profile'],
    ['Tài khoản', '/account'],
    ['Lịch làm việc', '/sitter/availability'],
    ['Khu vực làm việc', '/sitter/work-areas'],
    ['Lời mời nhận việc', '/sitter/invitations'],
    ['Lương và tạm ứng', '/sitter/payroll'],
    ['Hồ sơ công khai', '/sitter/public-profile']
  ],
  STAFF: [['Dashboard', '/staff'], ['Điều phối ca', '/staff/dispatch'], ['Sitter list', '/staff/sitters'], ['Hồ sơ công khai', '/staff/sitter-profiles'], ['Tài khoản', '/account']]
};
Object.values(navigationByRole).forEach((items) => {
  items.splice(1, 0, ['Cài đặt', '/account/settings']);
});
function Workspace({ role }) {
  const { user } = useSession();
  return (
    <RoleDashboardLayout
      key={user?.id}
      role={role}
      navigationItems={(navigationByRole[role] || []).map(([label, to]) => ({
        label,
        to,
        end: true
      }))}
    />
  );
}
function AccountWorkspace() {
  const { user } = useSession();
  const roles = user?.roles || [user?.role];
  const role = ['ADMIN', 'STAFF', 'PET_SITTER', 'CUSTOMER'].find((value) =>
    roles.includes(value)
  );
  return <Workspace role={role} />;
}

function CustomerFeaturePage({ page }) {
  const { getCsrfToken } = useSession();
  const apis = useMemo(() => {
    const request = createApiClient({ getCsrfToken });
    return {
      pets: createPetApi({ request }),
      pet: createPetProfileApi({ request }),
      notifications: createNotificationsApi({ request })
    };
  }, [getCsrfToken]);
  if (page === 'pets') return <PetListPage api={apis.pets} />;
  if (page === 'pet') return <PetDetailsPage api={apis.pet} />;
  return <NotificationsPage api={apis.notifications} />;
}

export function AppRoutes({
  publicPolicyRouteElements = publicPolicyFallbackRoutes
}) {
  return (
    <Routes>
      <Route element={<RequireSession roles={['ADMIN']} />}>
        <Route element={<Workspace role="ADMIN" />}>
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="admin/settlement-history" element={<AdminPayrollPage />} />
          <Route path="admin/sitters" element={<SitterListPage />} />
          <Route path="admin/settlements" element={<AdminSettlementRoute />} />
          <Route path="admin/payroll" element={<EmployeePayrollRoute admin />} />
          <Route path="admin/services" element={<AdminServicesPage />} />
          <Route
            path="admin/service-prices"
            element={<AdminServicePricesPage />}
          />
          <Route
            path="admin/system-settings"
            element={<AdminSystemSettingsPage />}
          />
          <Route
            path="admin/sitter-applications"
            element={<SitterApplicationsPage />}
          />
          <Route
            path="admin/sitter-applications/:applicationId"
            element={<SitterApplicationReviewPage />}
          />
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
          <Route
            path="account/pets"
            element={<CustomerFeaturePage page="pets" />}
          />
          <Route
            path="account/pets/:petId"
            element={<CustomerFeaturePage page="pet" />}
          />
          <Route path="account/bookings" element={<CustomerBookingsPage />} />
          <Route path="account/schedule-proposals/:proposalId" element={<EmployeeScheduleRoute view="proposal" />} />
          <Route path="account/sitter-recommendations" element={<SitterRecommendationsPage />} />
          <Route
            path="account/notifications"
            element={<CustomerFeaturePage page="notifications" />}
          />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['PET_SITTER']} />}>
        <Route element={<Workspace role="PET_SITTER" />}>
          <Route path="sitter" element={<SitterDashboardPage />} />
          <Route path="sitter/profile" element={<SitterProfilePage />} />
          <Route path="sitter/public-profile" element={<PublicProfileRoute />} />
          <Route path="sitter/earnings" element={<Navigate replace to="/sitter/payroll" />} />
          <Route path="sitter/partner-earnings" element={<SitterEarningsPage />} />
          <Route
            path="sitter/availability"
            element={<EmployeeScheduleRoute />}
          />
          <Route path="sitter/settlements" element={<SitterSettlementRoute />} />
          <Route path="sitter/payroll" element={<EmployeePayrollRoute />} />
          <Route path="sitter/work-areas" element={<EmployeeScheduleRoute view="areas" />} />
          <Route path="sitter/invitations" element={<EmployeeScheduleRoute view="invitations" />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['STAFF']} />}>
        <Route element={<Workspace role="STAFF" />}>
          <Route path="staff" element={<StaffDashboardPage />} />
          <Route path="staff/sitters" element={<SitterListPage />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['STAFF', 'ADMIN']} />}>
        <Route element={<AccountWorkspace />}>
          <Route path="staff/sitter-profiles" element={<PublicProfileRoute review />} />
          <Route path="staff/dispatch" element={<EmployeeScheduleRoute view="dispatch" />} />
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
        <Route path="register" element={<RegistrationPage />} />
        <Route
          path="sitter/apply"
          element={<RegistrationPage initialSitter />}
        />
      </Route>
      <Route element={<FoundationLayout />}>
        <Route
          path="sitter/application-status"
          element={<ApplicationStatusPage api={applicationStatusApi} />}
        />
        {publicPolicyRouteElements}
        <Route
          path="*"
          element={
            <section>
              <h1>Không tìm thấy trang</h1>
              <p>Hãy chọn một liên kết trong thanh điều hướng.</p>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
