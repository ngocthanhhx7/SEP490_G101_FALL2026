import { IncidentReportPage } from '../pages/incidents/IncidentReportPage.jsx';
import { IncidentDetailsPage } from '../pages/incidents/IncidentDetailsPage.jsx';
import { IncidentListPage } from '../pages/incidents/IncidentListPage.jsx';
import { createIncidentApi } from '../services/incident-api.js';
import { ServiceAreasPage as AdminServiceAreasPage } from '../pages/admin/ServiceAreasPage.jsx';
import { createServiceAreaManagementApi } from '../services/service-area-management-api.js';
import { useMemo } from 'react';
import { CustomerCarePage } from '../pages/customer/CustomerCarePage.jsx';
import { CustomerBookingDetailPage } from '../pages/customer/CustomerBookingDetailPage.jsx';
import { VisitSchedulePage } from '../pages/customer/visit-schedule/VisitSchedulePage.jsx';
import { VisitStatusTrackerPage } from '../pages/customer/visit-status-tracker/VisitStatusTrackerPage.jsx';
import { ComplaintSubmitPage } from '../pages/customer/ComplaintSubmitPage.jsx';
import { CustomerBookingsPage } from '../pages/customer/CustomerBookingsPage.jsx';
import { NotificationsPage } from '../pages/notifications/NotificationsPage.jsx';
import { createNotificationsApi } from '../services/notifications-api.js';
import { createApiClient } from '../services/api-client.js';
import { CustomerProfilePage } from '../pages/customer/CustomerProfilePage.jsx';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { InstallAppPage } from '../pages/public/InstallAppPage.jsx';
import { FoundationLayout } from '../layouts/FoundationLayout.jsx';
import { PublicSiteLayout } from '../layouts/PublicSiteLayout.jsx';
import { SitterSchedulePage } from '../pages/sitter/SitterSchedulePage.jsx';
import { StaffReassignPage } from '../pages/staff/StaffReassignPage.jsx';
import { HandoverConfirmationPage } from '../pages/sitter/HandoverConfirmationPage.jsx';
import { SitterVisitPage } from '../pages/sitter/SitterVisitPage.jsx';
import { MobileAccountHub } from '../pages/account/MobileAccountHub.jsx';
import { PhoneHomePage } from '../pages/public/PhoneHomePage.jsx';
import { HomePage } from '../pages/public/HomePage.jsx';
import { AboutPage } from '../pages/public/AboutPage.jsx';
import { ContactPage } from '../pages/public/ContactPage.jsx';
import { ServiceAreasPage } from '../pages/public/ServiceAreasPage.jsx';
import { ServiceDetailsPage } from '../pages/public/ServiceDetailsPage.jsx';
import { ServiceListPage } from '../pages/public/ServiceListPage.jsx';
import { GroomingBookingPage } from '../pages/customer/GroomingBookingPage.jsx';
import { ServiceBookingPage } from '../pages/public/ServiceBookingPage.jsx';
import { SignInPage } from '../pages/public/SignInPage.jsx';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage.jsx';
import { AccountPage } from '../pages/account/AccountPage.jsx';
import { AccountSettingsPage } from '../pages/account/AccountSettingsPage.jsx';
import { RequireSession } from './RequireSession.jsx';
import { hasRole, primaryRole } from '../utils/role-access.js';
import { publicPolicyFallbackRoutes } from './PublicPolicyRoutes.jsx';
import { RegistrationPage } from '../pages/public/RegistrationPage.jsx';
import { ServiceWorkspacePage } from '../pages/admin/ServiceWorkspacePage.jsx';
import { AdminSystemSettingsPage } from '../pages/admin/AdminSystemSettingsPage.jsx';
import { SitterApplicationsPage } from '../pages/admin/SitterApplicationsPage.jsx';
import { SitterApplicationReviewPage } from '../pages/admin/SitterApplicationReviewPage.jsx';
import { SitterAvailabilityPage } from '../pages/sitter/SitterAvailabilityPage.jsx';
import { RoleDashboardLayout } from '../layouts/RoleDashboardLayout.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { ApplicantWorkspacePage } from '../pages/public/application-status/ApplicantWorkspacePage.jsx';
import { applicationStatusApi } from '../services/application-status-api.js';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage.jsx';
import { MobileVisitAgenda } from '../pages/customer/MobileVisitAgenda.jsx';
import { MobileCareHome } from '../pages/customer/MobileCareHome.jsx';
import { CustomerDashboardPage } from '../pages/customer/CustomerDashboardPage.jsx';
import { SitterListPage } from '../pages/customer/SitterListPage.jsx';
import { SitterManagementPage } from '../pages/staff/SitterManagementPage.jsx';
import { SitterManagementDetailPage } from '../pages/staff/SitterManagementDetailPage.jsx';
import { createSitterManagementApi } from '../services/sitter-management-api.js';
import { MobileSitterHome } from '../pages/sitter/MobileSitterHome.jsx';
import { SitterDashboardPage } from '../pages/sitter/SitterDashboardPage.jsx';
import { SitterProfilePage } from '../pages/sitter/SitterProfilePage.jsx';
import { StaffDashboardPage } from '../pages/staff/StaffDashboardPage.jsx';
import { SitterPublicProfilePage } from '../pages/sitter/SitterPublicProfilePage.jsx';
import { SitterProfileReviewsPage } from '../pages/staff/SitterProfileReviewsPage.jsx';
import { createSitterPublicProfileApi } from '../services/sitter-public-profile-api.js';
import { createPrivateImageApi } from '../services/private-image-api.js';
import { createEmployeePayrollApi } from '../services/employee-payroll-api.js';
import { SitterRankingPolicyPage } from '../pages/admin/SitterRankingPolicyPage.jsx';
import { EmployeePayrollPage } from '../pages/sitter/EmployeePayrollPage.jsx';
import { EmployeePayrollAdminPage } from '../pages/admin/EmployeePayrollAdminPage.jsx';
import { RefundProcessingPage } from '../pages/admin/RefundProcessingPage.jsx';
import { createEmployeeSchedulingApi } from '../services/employee-scheduling-api.js';
import { SitterWorkAreasPanel } from '../pages/sitter/SitterWorkAreasPanel.jsx';
import { EmployeeDispatchPage } from '../pages/staff/EmployeeDispatchPage.jsx';
import { StaffBookingDetailPage } from '../pages/staff/StaffBookingDetailPage.jsx';
import { ComplaintManagementPage } from '../pages/staff/ComplaintManagementPage.jsx';
import { EmployeeInvitationsPage } from '../pages/sitter/EmployeeInvitationsPage.jsx';
import { DirectedBookingProposalPage } from '../pages/customer/DirectedBookingProposalPage.jsx';
import { ProductListPage } from '../pages/public/ProductListPage.jsx';
import { ProductDetailsPage } from '../pages/public/ProductDetailsPage.jsx';
import { ShoppingCartPage } from '../pages/customer/ShoppingCartPage.jsx';
import { ProductCheckoutPage } from '../pages/customer/ProductCheckoutPage.jsx';
import { MyProductOrdersPage } from '../pages/customer/MyProductOrdersPage.jsx';
import { ProductOrderManagementPage } from '../pages/admin/ProductOrderManagementPage.jsx';
import { SaleStaffDashboardPage } from '../pages/dashboards/SaleStaffDashboardPage.jsx';
import { CounterSalePage } from '../pages/admin/CounterSalePage.jsx';
import { createCounterSaleApi } from '../services/counter-sale-api.js';
import { createProductOrderManagementApi } from '../services/product-order-management-api.js';
import { ProductManagementPage } from '../pages/admin/ProductManagementPage.jsx';
import { createProductManagementApi } from '../services/product-management-api.js';
import { SupplierManagementPage } from '../pages/admin/SupplierManagementPage.jsx';
import { createSupplierManagementApi } from '../services/supplier-management-api.js';
import { GoodsReceiptPage } from '../pages/admin/GoodsReceiptPage.jsx';
import { createGoodsReceiptApi } from '../services/goods-receipt-api.js';
import { StockListPage } from '../pages/admin/StockListPage.jsx';
import { createStockListApi } from '../services/stock-list-api.js';
import { StockAdjustmentPage } from '../pages/admin/StockAdjustmentPage.jsx';
import { createStockAdjustmentApi } from '../services/stock-adjustment-api.js';

function StockAdjustmentRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createStockAdjustmentApi({ getCsrfToken }), [getCsrfToken]);
  return <StockAdjustmentPage key={user?.id} api={api} />;
}

function StockListRoute() {
  const { user } = useSession();
  const api = useMemo(() => createStockListApi(), []);
  return <StockListPage key={user?.id} api={api} />;
}

function ServiceAreasRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createServiceAreaManagementApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  return <AdminServiceAreasPage key={user?.id} api={api} />;
}

function ProductManagementRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createProductManagementApi({ getCsrfToken }), [getCsrfToken]);
  return <ProductManagementPage key={user?.id} api={api} />;
}

function SupplierManagementRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createSupplierManagementApi({ getCsrfToken }), [getCsrfToken]);
  const productApi = useMemo(() => createProductManagementApi({ getCsrfToken }), [getCsrfToken]);
  return <SupplierManagementPage key={user?.id} api={api} productApi={productApi} />;
}

function GoodsReceiptRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createGoodsReceiptApi({ getCsrfToken }), [getCsrfToken]);
  return <GoodsReceiptPage key={user?.id} api={api} recorderName={user?.displayName ?? ''} />;
}

function ProductOrderManagementRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createProductOrderManagementApi({ getCsrfToken }), [getCsrfToken]);
  return <ProductOrderManagementPage key={user?.id} api={api} />;
}

function CounterSaleRoute() {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createCounterSaleApi({ getCsrfToken }), [getCsrfToken]);
  return <CounterSalePage key={user?.id} api={api} />;
}

function SitterManagementRoute({ detail = false }) {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createSitterManagementApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  const payrollApi = useMemo(() => createEmployeePayrollApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  return detail ? <SitterManagementDetailPage key={user?.id} api={api} payrollApi={payrollApi} /> : <SitterManagementPage key={user?.id} api={api} />;
}

function IncidentRoute({ view }) {
  const params = useParams();
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createIncidentApi({ request: createApiClient({ getCsrfToken }) }), [getCsrfToken]);
  const imageApi = useMemo(() => createPrivateImageApi({ getCsrfToken }), [getCsrfToken]);
  if (view === 'report') return <IncidentReportPage key={`${user?.id}:${params.visitId}`} api={api} imageApi={imageApi} />;
  if (view === 'detail') return <IncidentDetailsPage key={`${user?.id}:${params.caseId}`} api={api} />;
  return <IncidentListPage key={user?.id} api={api} />;
}

function LegacyDispatchRoute() {
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: '/staff/dispatch', search, hash }} />;
}

function EmployeeScheduleRoute({ view }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate(), location = useLocation();
  const { visitId } = useParams();
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createEmployeeSchedulingApi(createApiClient({ getCsrfToken }), {
    privateImages: createPrivateImageApi({ getCsrfToken })
  }), [getCsrfToken]);
  if (view === 'reassign') return /^[a-f\d]{24}$/i.test(visitId ?? '')
    ? <StaffReassignPage key={user?.id + ':' + visitId} api={api} visitId={visitId.toLowerCase()} />
    : <p role="alert">Buổi không còn khả dụng với tài khoản này.</p>;
  if (view === 'handover') return /^[a-f\d]{24}$/i.test(visitId ?? '')
    ? <HandoverConfirmationPage key={user?.id + ':' + visitId} api={api} visitId={visitId.toLowerCase()} />
    : <p role="alert">Buổi không còn khả dụng với tài khoản này.</p>;
  if (view === 'visit') return /^[a-f\d]{24}$/i.test(visitId ?? '')
    ? <SitterVisitPage key={user?.id + ':' + visitId} api={api} visitId={visitId} />
    : <p role="alert">Mã buổi chăm sóc không hợp lệ.</p>;
  if (view === 'areas') return <SitterWorkAreasPanel key={user?.id} api={api} />;
  if (view === 'dispatch') return <EmployeeDispatchPage key={user?.id + ':' + params.toString()} api={api}
    onCloseVisit={() => {
      if (!params.has('visitId')) return;
      const query = new globalThis.URLSearchParams(params);
      query.delete('visitId');
      setParams(query, { replace: true });
    }}
    initialVisitId={/^[a-f0-9]{24}$/i.test(params.get('visitId') ?? '') ? params.get('visitId') : undefined} selectedSitter={params.get('sitterId') || undefined}
    initialHandoverVisitId={/^[a-f0-9]{24}$/i.test(params.get('handoverVisitId') ?? '') ? params.get('handoverVisitId') : undefined}
    reassignedNotice={location.state?.reassigned}
    onReassign={(id, returnTo) => navigate(`/staff/visits/${id}/reassign`, { state: { returnTo } })}
    initialTab={['needs', 'today', 'all'].includes(params.get('tab')) ? params.get('tab') : undefined}
    initialFilters={{ text: params.get('q') ?? '', areaCode: params.get('area') ?? '', reason: params.get('reason') ?? '' }}
    initialWorkflowId={params.get('workflowId') || undefined} initialWithdrawalId={params.get('withdrawalId') || undefined} initialClosureId={params.get('closureId') || undefined} canVerifyClosure={user?.roles?.includes('ADMIN')} />;
  if (view === 'invitations' && /^[a-f\d]{24}$/i.test(params.get('visitId') ?? ''))
    return <Navigate replace to={'/sitter/visits/' + params.get('visitId')} />;
  if (view === 'invitations') {
    const offerId = params.get('offerId');
    return <EmployeeInvitationsPage key={user?.id + ':' + (offerId || '')} api={api} initialOfferId={offerId || undefined}
      onCloseOffer={() => setParams(previous => {
        const query = new globalThis.URLSearchParams(previous);
        query.delete('offerId');
        return query;
      }, { replace: true })} />;
  }
  if (view === 'proposal') return <DirectedBookingProposalPage key={user?.id} api={api} />;
  return <SitterAvailabilityPage key={user?.id} api={api} />;
}

function EmployeePayrollRoute({ admin = false }) {
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createEmployeePayrollApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  const employeeApi = useMemo(() => createSitterManagementApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  return admin ? <EmployeePayrollAdminPage key={user?.id} api={api} employeeApi={employeeApi} /> : <EmployeePayrollPage key={user?.id} api={api} />;
}


function PublicProfileRoute({ review = false }) {
  const [params] = useSearchParams();
  const { getCsrfToken, user } = useSession();
  const api = useMemo(() => createSitterPublicProfileApi(createApiClient({ getCsrfToken })), [getCsrfToken]);
  return review ? <SitterProfileReviewsPage key={user?.id} api={api} userId={params.get('userId') || undefined} /> : <SitterPublicProfilePage key={user?.id} api={api} />;
}

const navigationByRole = {
  ADMIN: [
    ['Tổng quan', '/admin/dashboard', 'Công việc'],
    ['Điều phối ca', '/staff/dispatch', 'Công việc'],
    ['Khiếu nại', '/admin/complaints', 'Công việc'],
    ['Người chăm sóc', '/admin/sitters', 'Nhân sự & hồ sơ'],
    ['Người dùng', '/admin/users', 'Nhân sự & hồ sơ'],
    ['Hồ sơ ứng tuyển', '/admin/sitter-applications', 'Nhân sự & hồ sơ'],
    ['Duyệt hồ sơ công khai', '/staff/sitter-profiles', 'Nhân sự & hồ sơ'],
    ['Đơn hàng sản phẩm', '/admin/product-orders', 'Bán hàng'],
    ['Bán tại quầy', '/admin/counter-sale', 'Bán hàng'],
    ['Sản phẩm', '/admin/products', 'Cửa hàng'],
    ['Nhà cung cấp', '/admin/suppliers', 'Cửa hàng'],
    ['Nhập hàng', '/admin/goods-receipts', 'Cửa hàng'],
    ['Tồn kho', '/admin/stock', 'Cửa hàng'],
    ['Điều chỉnh tồn kho', '/admin/stock-adjustments', 'Cửa hàng'],
    ['Quản lý lương', '/admin/payroll', 'Tài chính'],
    ['Hoàn tiền', '/admin/refunds', 'Tài chính'],
    ['Dịch vụ và giá', '/admin/services', 'Hệ thống'],
    ['Phạm vi phục vụ', '/admin/service-areas', 'Hệ thống'],
    ['Cấu hình hệ thống', '/admin/system-settings', 'Hệ thống'],
    ['Trọng số gợi ý sitter', '/admin/sitter-ranking', 'Hệ thống'],
    ['Tài khoản của tôi', '/account', 'Cá nhân'],
    ['Liên hệ & bảo mật', '/account/settings', 'Cá nhân'],
    ['Thông báo', '/account/notifications', 'Cá nhân']
  ],
  CUSTOMER: [
    ['Hồ sơ', '/account/profile', 'Tài khoản của tôi'],
    ['Liên hệ & bảo mật', '/account/settings', 'Tài khoản của tôi'],
    ['Địa chỉ', '/account/addresses', 'Tài khoản của tôi'],
    ['Thú cưng của tôi', '/account/pets', 'Tài khoản của tôi'],
    ['Chăm sóc của bạn', '/customer', 'Dịch vụ của tôi'],
    ['Đơn chăm sóc', '/account/bookings', 'Dịch vụ của tôi'],
    ['Thông báo', '/account/notifications', 'Dịch vụ của tôi'],
    ['Đơn mua sản phẩm', '/customer/product-orders', 'Mua sắm'],
    ['Người chăm sóc', '/sitters', 'Khám phá']
  ],
  PET_SITTER: [
    ['Công việc của tôi', '/sitter', 'Công việc'],
    ['Lời mời nhận việc', '/sitter/invitations', 'Công việc'],
    ['Ca làm', '/sitter/schedule', 'Công việc'],
    ['Giờ nhận việc', '/sitter/availability', 'Công việc'],
    ['Khu vực làm việc', '/sitter/work-areas', 'Công việc'],
    ['Lương và tạm ứng', '/sitter/payroll', 'Tài chính'],
    ['Hồ sơ người chăm sóc', '/sitter/profile', 'Hồ sơ của tôi'],
    ['Hồ sơ công khai', '/sitter/public-profile', 'Hồ sơ của tôi'],
    ['Tài khoản của tôi', '/account', 'Cá nhân'],
    ['Thông tin cá nhân', '/account/profile', 'Cá nhân'],
    ['Liên hệ & bảo mật', '/account/settings', 'Cá nhân'],
    ['Thông báo', '/account/notifications', 'Cá nhân']
  ],
  SALE_STAFF: [
    ['Tổng quan', '/sale-staff/dashboard', 'Bán hàng'],
    ['Bán tại quầy', '/admin/counter-sale', 'Bán hàng'],
    ['Đơn hàng', '/admin/product-orders', 'Bán hàng'],
    ['Nhập hàng', '/admin/goods-receipts', 'Bán hàng'],
    ['Tồn kho', '/admin/stock', 'Bán hàng']
  ],
  STAFF: [
    ['Tổng quan', '/staff', 'Công việc'],
    ['Điều phối ca', '/staff/dispatch', 'Công việc'],
    ['Khiếu nại', '/staff/complaints', 'Công việc'],
    ['Người chăm sóc', '/staff/sitters', 'Nhân sự & hồ sơ'],
    ['Duyệt hồ sơ công khai', '/staff/sitter-profiles', 'Nhân sự & hồ sơ'],
    ['Tài khoản của tôi', '/account', 'Cá nhân'],
    ['Liên hệ & bảo mật', '/account/settings', 'Cá nhân'],
    ['Thông báo', '/account/notifications', 'Cá nhân']
  ]
};
function Workspace({ role }) {
  const { user } = useSession();
  const shellRole = role === 'STAFF' && hasRole(user, 'ADMIN') ? 'ADMIN' : role;
  return (
    <RoleDashboardLayout
      key={user?.id}
      role={shellRole}
      notificationTo="/account/notifications"
      navigationItems={(navigationByRole[shellRole] || []).map(([label, to, group]) => ({
        label,
        to,
        group,
        end: to !== '/account/bookings'
      }))}
    />
  );
}
function AccountWorkspace() {
  const { user } = useSession();
  const role = primaryRole(user);
  return <Workspace role={role} />;
}

function ApplicationStatusLayout() {
  const { user } = useSession();
  return primaryRole(user) === 'PET_SITTER' ? <Workspace role="PET_SITTER" /> : <PublicSiteLayout />;
}

function AccountHome({ mobile }) {
  const { user, logout } = useSession();
  const role = primaryRole(user);
  if (mobile && ['CUSTOMER', 'PET_SITTER'].includes(role)) return <MobileAccountHub role={role} user={user} logout={logout} />;
  return hasRole(user, 'CUSTOMER')
    ? <Navigate replace to="/account/profile" /> : <AccountPage />;
}

function CustomerFeaturePage({ page }) {
  const { getCsrfToken } = useSession();
  const apis = useMemo(() => {
    const request = createApiClient({ getCsrfToken });
    return {
      notifications: createNotificationsApi({ request })
    };
  }, [getCsrfToken]);
  if (page === 'pets' || page === 'pet') return <CustomerCarePage />;
  return <NotificationsPage api={apis.notifications} />;
}

export function AppRoutes({
  phoneApp = false,
  publicPolicyRouteElements = publicPolicyFallbackRoutes
}) {
  return (
    <Routes>
      <Route element={<RequireSession roles={['ADMIN']} />}>
        <Route element={<Workspace role="ADMIN" />}>
          <Route path="admin/users" element={<AdminUsersPage embedded />} />
          <Route path="admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="admin/complaints" element={<ComplaintManagementPage />} />
          <Route path="admin/settlement-history" element={<Navigate replace to="/admin/payroll" />} />
          <Route path="admin/sitters" element={<SitterManagementRoute />} />
          <Route path="admin/sitters/:userId" element={<SitterManagementRoute detail />} />
          <Route path="admin/settlements" element={<Navigate replace to="/admin/payroll" />} />
          <Route path="admin/payroll" element={<EmployeePayrollRoute admin />} />
          <Route path="admin/refunds" element={<RefundProcessingPage />} />
          <Route path="admin/sitter-ranking" element={<SitterRankingPolicyPage />} />
          <Route path="admin/ai-models" element={<Navigate replace to="/admin/sitter-ranking" />} />
          <Route path="admin/products" element={<ProductManagementRoute />} />
          <Route path="admin/suppliers" element={<SupplierManagementRoute />} />
          <Route path="admin/stock-adjustments" element={<StockAdjustmentRoute />} />
          <Route path="admin/service-areas" element={<ServiceAreasRoute />} />
          <Route path="admin/services" element={<ServiceWorkspacePage />} />
          <Route
            path="admin/service-prices"
            element={<Navigate replace to="/admin/services" />}
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
          <Route path="admin/applications" element={<Navigate replace to="/admin/sitter-applications" />} />
          <Route path="admin/applications/:applicationId" element={<SitterApplicationReviewPage />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['SALE_STAFF']} />}>
        <Route element={<Workspace role="SALE_STAFF" />}>
          <Route path="sale-staff/dashboard" element={<SaleStaffDashboardPage />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['ADMIN', 'SALE_STAFF']} />}>
        <Route element={<AccountWorkspace />}>
          <Route path="admin/product-orders" element={<ProductOrderManagementRoute />} />
          <Route path="admin/counter-sale" element={<CounterSaleRoute />} />
          <Route path="admin/goods-receipts" element={<GoodsReceiptRoute />} />
          <Route path="admin/stock" element={<StockListRoute />} />
        </Route>
      </Route>
      <Route element={<RequireSession />}>
        <Route element={<AccountWorkspace />}>
          <Route path="account" element={<AccountHome mobile={phoneApp} />} />
          <Route path="account/settings" element={<AccountSettingsPage />} />
          <Route path="account/notifications" element={<CustomerFeaturePage page="notifications" />} />
          <Route path="account/profile" element={<CustomerProfilePage />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['CUSTOMER']} />}>
        <Route element={<Workspace role="CUSTOMER" />}>
          <Route path="customer" element={phoneApp ? <MobileCareHome /> : <CustomerDashboardPage />} />
          <Route path="sitters" element={<SitterListPage />} />
          <Route path="account/addresses" element={<CustomerCarePage kind="addresses" />} />
          <Route
            path="account/pets"
            element={<CustomerFeaturePage page="pets" />}
          />
          <Route
            path="account/pets/:petId"
            element={<CustomerFeaturePage page="pet" />}
          />
          <Route path="account/bookings" element={<CustomerBookingsEntry mobile={phoneApp} />} />
          <Route path="customer/product-orders" element={<MyProductOrdersPage />} />
          <Route path="account/bookings/:bookingId" element={<CustomerBookingDetailPage />} />
          <Route path="account/bookings/:bookingId/visits" element={<VisitSchedulePage />} />
          <Route path="account/bookings/:bookingId/visits/:visitId" element={<VisitStatusTrackerPage />} />
          <Route path="account/bookings/:bookingId/complaints/new" element={<ComplaintSubmitPage />} />
          <Route path="account/schedule-proposals/:proposalId" element={<EmployeeScheduleRoute view="proposal" />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['PET_SITTER']} />}>
        <Route element={<Workspace role="PET_SITTER" />}>
          <Route path="sitter" element={phoneApp ? <MobileSitterHome /> : <SitterDashboardPage />} />
          <Route path="sitter/profile" element={<SitterProfilePage />} />
          <Route path="sitter/public-profile" element={<PublicProfileRoute />} />
          <Route path="sitter/earnings" element={<Navigate replace to="/sitter/payroll" />} />
          <Route path="sitter/partner-earnings" element={<Navigate replace to="/sitter/payroll" />} />
          <Route
            path="sitter/availability"
            element={<EmployeeScheduleRoute />}
          />
          <Route path="sitter/settlements" element={<Navigate replace to="/sitter/payroll" />} />
          <Route path="sitter/payroll" element={<EmployeePayrollRoute />} />
          <Route path="sitter/work-areas" element={<EmployeeScheduleRoute view="areas" />} />
          <Route path="sitter/schedule" element={<SitterSchedulePage />} />
          <Route path="sitter/visits/:visitId" element={<EmployeeScheduleRoute view="visit" />} />
          <Route path="sitter/visits/:visitId/handover" element={<EmployeeScheduleRoute view="handover" />} />
          <Route path="sitter/invitations" element={<EmployeeScheduleRoute view="invitations" />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['STAFF']} />}>
        <Route element={<Workspace role="STAFF" />}>
          <Route path="staff" element={<StaffDashboardPage />} />
          <Route path="staff/complaints" element={<ComplaintManagementPage />} />
          <Route path="staff/sitters" element={<SitterManagementRoute />} />
          <Route path="staff/sitters/:userId" element={<SitterManagementRoute detail />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['STAFF', 'ADMIN']} />}>
        <Route element={<AccountWorkspace />}>
          <Route path="staff/sitter-profiles" element={<PublicProfileRoute review />} />
          <Route path="staff/dispatch" element={<EmployeeScheduleRoute view="dispatch" />} />
          <Route path="staff/visits/:visitId/reassign" element={<EmployeeScheduleRoute view="reassign" />} />
          <Route path="admin/dispatch" element={<LegacyDispatchRoute />} />
          <Route path="staff/bookings/:bookingId" element={<StaffBookingDetailPage />} />
        </Route>
      </Route>
      <Route element={<RequireSession roles={['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']} />}>
        <Route element={<AccountWorkspace />}>
          <Route path="visits/:visitId/incidents/new" element={<IncidentRoute view="report" />} />
          <Route path="cases/:caseId" element={<IncidentRoute view="detail" />} />
          <Route path="incidents" element={<IncidentRoute view="list" />} />
        </Route>
      </Route>
      <Route path="install" element={<InstallAppPage />} />
      <Route element={<PublicSiteLayout />}>
        <Route index element={phoneApp ? <CompactLanding /> : <HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="services" element={<ServiceEntry />} />
        <Route path="services/:serviceId" element={<ServiceDetailsPage />} />
        <Route element={<RequireSession roles={['CUSTOMER']} />}>
          <Route path="booking/:serviceId" element={<ServiceEntry booking /> } />
          <Route path="grooming-booking" element={<GroomingBookingPage />} />
        </Route>
        <Route path="products" element={<ProductListPage />} />
        <Route path="products/:productId" element={<ProductDetailsPage />} />
        <Route element={<RequireSession roles={['CUSTOMER']} />}>
          <Route path="customer/cart" element={<ShoppingCartPage />} />
          <Route path="customer/product-checkout" element={<ProductCheckoutPage />} />
        </Route>
        <Route path="service-areas" element={<ServiceAreasPage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="register" element={<RegistrationPage />} />
        <Route
          path="sitter/apply"
          element={<RegistrationPage initialSitter />}
        />
      </Route>
      <Route element={<ApplicationStatusLayout />}>
        <Route
          path="sitter/application-status"
          element={<ApplicantWorkspacePage legacyApi={applicationStatusApi} />}
        />
      </Route>
      <Route element={<PublicSiteLayout policyReading />}>
        {publicPolicyRouteElements}
      </Route>
      <Route element={<FoundationLayout />}>
        <Route
          path="*"
          element={
            <section>
              <h1>Không tìm thấy trang</h1>
              {phoneApp ? <CompactNotFoundActions /> : <p>Hãy chọn một liên kết trong thanh điều hướng.</p>}
            </section>
          }
        />
      </Route>
    </Routes>
  );
}

function CompactNotFoundActions() {
  const { user } = useSession();
  const role = primaryRole(user);
  const home = role === 'CUSTOMER' ? '/customer' : role === 'PET_SITTER' ? '/sitter' : '/';
  return <ul className="pwc-mobile-rows">
    <li><Link to={home}>Về trang chủ</Link></li>
    <li><Link to={role ? '/account' : '/sign-in'}>{role ? 'Tài khoản' : 'Đăng nhập'}</Link></li>
    {role !== 'PET_SITTER' && <li><Link to="/contact">Hỗ trợ</Link></li>}
  </ul>;
}

function CompactLanding() {
  const session = useSession();
  if (session.status === 'loading') return <p role="status">Đang kiểm tra phiên…</p>;
  if (session.status === 'error') return <p role="alert">Chưa kiểm tra được phiên.
    <button onClick={session.refresh}>Thử lại</button></p>;
  return primaryRole(session.user) === 'CUSTOMER' ? <Navigate to="/customer" replace /> : <PhoneHomePage />;
}

function ServiceEntry({ booking = false }) {
  const [query] = useSearchParams();
  if (!query.has('booking')) return booking ? <ServiceBookingPage /> : <ServiceListPage />;
  const [bookingId] = query.getAll('booking');
  if (query.getAll('booking').length !== 1 || !/^[a-f\d]{24}$/i.test(bookingId)) {
    return <section><h1>Liên kết đơn chăm sóc không hợp lệ</h1><Link to="/account/bookings">Xem lịch hẹn</Link></section>;
  }
  const payment = query.get('payment');
  const suffix = payment === 'returned' || payment === 'cancelled' ? `?payment=${payment}` : '';
  return <Navigate replace to={`/account/bookings/${bookingId}${suffix}`} />;
}

function CustomerBookingsEntry({ mobile }) {
  const [query] = useSearchParams();
  return mobile && query.get('view') !== 'orders' ? <MobileVisitAgenda /> : <CustomerBookingsPage />;
}
