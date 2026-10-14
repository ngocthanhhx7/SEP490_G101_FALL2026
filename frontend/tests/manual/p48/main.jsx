import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionProvider } from '../../../src/contexts/SessionContext.jsx';
import { RoleDashboardLayout } from '../../../src/layouts/RoleDashboardLayout.jsx';
import '../../../src/styles/index.css';

const previewSession = {
  async resolve() {
    return {
      status: 'authenticated',
      user: { id: 'synthetic-p48-preview', displayName: 'Nguyễn An', roles: ['CUSTOMER'] },
    };
  },
};

const navigationItems = [
  { key: 'overview', label: 'Tổng quan', to: '/customer', end: true },
  { key: 'bookings', label: 'Lịch hẹn', to: '/customer/bookings' },
  { key: 'pets', label: 'Thú cưng', to: '/customer/pets' },
];

function PreviewContent() {
  const location = useLocation();
  useEffect(() => {
    if (window.location.search.includes('menu=open')) {
      document.querySelector('.pwc-avatar-menu__trigger')?.click();
    }
  }, []);
  return <section className="p48-preview-content">
    <p>Phiên tạo mẫu chỉ dùng để xem bố cục.</p>
    <h1>Tổng quan</h1>
    <p>Vị trí hiện tại: {location.pathname}</p>
    <p>Nội dung dashboard sẽ được nối với các màn hình và dữ liệu thật sau khi tích hợp.</p>
  </section>;
}

function PreviewApp() {
  return <MemoryRouter initialEntries={['/customer']}>
    <SessionProvider adapter={previewSession}>
      <Routes>
        <Route path="*" element={<RoleDashboardLayout role="CUSTOMER" navigationItems={navigationItems}>
          <PreviewContent />
        </RoleDashboardLayout>} />
      </Routes>
    </SessionProvider>
  </MemoryRouter>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode><PreviewApp /></StrictMode>,
);
