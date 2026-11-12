import { ArrowRight, Package, Store, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { readSaleStaffDashboard } from '../../services/sale-staff-dashboard-api.js';
import '../../styles/workspaces.css';
import './sale-staff-dashboard.css';

const CARDS = [
  { tab: 'PREPARE', label: 'Đơn cần chuẩn bị', Icon: Package },
  { tab: 'AWAITING_PICKUP', label: 'Đơn chờ khách đến lấy', Icon: Store },
  { tab: 'RETURNING', label: 'Kiện hoàn về cần kiểm', Icon: Undo2 }
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
      {CARDS.map(({ tab, label, Icon }) => <Link key={tab} className="pwc-sales-dashboard__card"
        to={'/admin/product-orders?tab=' + tab}>
        <span className="pwc-sales-dashboard__icon"><Icon size={22} aria-hidden="true" /></span>
        <h2>{label}</h2>
        <span className="pwc-sales-dashboard__count">{resource.data.counts[tab].toLocaleString('vi-VN')}</span>
        <span className="pwc-sales-dashboard__link">Mở Đơn hàng <ArrowRight size={16} aria-hidden="true" /></span>
      </Link>)}
    </div>}
  </section>;
}
