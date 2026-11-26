import { AlertTriangle, ArrowRight, Package, Store, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { readSaleStaffDashboard } from '../../services/sale-staff-dashboard-api.js';
import '../../styles/workspaces.css';
import './sale-staff-dashboard.css';

const CARDS = [
  { key: 'PREPARE', label: 'Đơn cần chuẩn bị', to: '/admin/product-orders?tab=PREPARE', linkLabel: 'Mở Đơn hàng', Icon: Package },
  { key: 'AWAITING_PICKUP', label: 'Đơn chờ khách đến lấy', to: '/admin/product-orders?tab=AWAITING_PICKUP', linkLabel: 'Mở Đơn hàng', Icon: Store },
  { key: 'RETURNING', label: 'Kiện hoàn về cần kiểm', to: '/admin/product-orders?tab=RETURNING', linkLabel: 'Mở Đơn hàng', Icon: Undo2 },
  { key: 'LOW_STOCK', label: 'Sản phẩm sắp hết hàng', to: '/admin/stock?tab=LOW_STOCK', linkLabel: 'Mở Tồn kho', Icon: AlertTriangle }
];

export function SaleStaffDashboardPage() {
  const resource = useApiResource(readSaleStaffDashboard);

  return <section className="workspace-page">
    <header className="pwc-sales-dashboard__heading">
      <h1>Tổng quan</h1>
      <p>Việc cần làm ở cửa hàng. Bấm vào từng ô để mở danh sách.</p>
    </header>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải số đơn hàng" />}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Bạn không có quyền xem tổng quan" />}
    {resource.status === 'error' && <Notice state="error" title="Không thể tải tổng quan"
      action={<Button onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'success' && <div className="pwc-sales-dashboard__cards">
      {CARDS.map(({ key, label, to, linkLabel, Icon }) => <Link key={key} className="pwc-sales-dashboard__card" to={to}>
        <span className="pwc-sales-dashboard__icon"><Icon size={22} aria-hidden="true" /></span>
        <h2>{label}</h2>
        <span className="pwc-sales-dashboard__count">{resource.data.counts[key].toLocaleString('vi-VN')}</span>
        <span className="pwc-sales-dashboard__link">{linkLabel} <ArrowRight size={16} aria-hidden="true" /></span>
      </Link>)}
    </div>}
  </section>;
}
