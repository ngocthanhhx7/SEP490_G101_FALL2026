import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
import { Activity, CheckCircle2, Users, CalendarDays } from 'lucide-react';
import { createWorkspaceApi } from '../../services/workspace-api.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Notice } from '../ui/index.js';
import '../../styles/workspaces.css';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, DoughnutController, ArcElement, Tooltip, Legend);
const labels = { ADMIN: 'Quản trị viên', STAFF: 'Nhân viên', CUSTOMER: 'Khách hàng', PET_SITTER: 'Người chăm sóc',
  COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', SCHEDULED: 'Chờ phân công', ASSIGNED: 'Đã phân công',
  IN_PROGRESS: 'Đang chăm sóc', STAFF_CLOSED: 'Đã đóng', UNKNOWN: 'Chưa phân loại' };
const palette = ['#7351ac', '#168978', '#d69b00', '#4581c4', '#bd527b', '#69717c'];
const icons = [Users, CheckCircle2, Activity, CalendarDays];

function AnalyticsChart({ type, data, label }) {
  const canvas = useRef(null);
  useEffect(() => {
    const chart = new Chart(canvas.current, { type, data,
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => `${item.dataset.label || item.label}: ${item.formattedValue}` } } },
        ...(type === 'bar' ? { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } },
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#edf0f3' } } } } : { cutout: '72%' }) } });
    return () => chart.destroy();
  }, [type, data]);
  return <div className={'workspace-chart workspace-chart--' + type}><canvas ref={canvas} role="img" aria-label={label} /></div>;
}

export function WorkspaceAnalytics({ kind, request }) {
  const session = useSession();
  const [days, setDays] = useState(7);
  const api = useMemo(() => createWorkspaceApi({ request, onUnauthorized: session.invalidate }), [request, session.invalidate]);
  const load = useCallback(options => api.analytics(kind, days, options), [api, kind, days]);
  const resource = useApiResource(load), data = resource.data;
  const trend = useMemo(() => ({ labels: (data?.trend ?? []).map(row => row.date.slice(5).split('-').reverse().join('/')),
    datasets: [{ label: data?.trendLabel, data: (data?.trend ?? []).map(row => row.value), backgroundColor: '#8b6abd', borderRadius: 4, maxBarThickness: 38 }] }), [data]);
  const distribution = useMemo(() => ({ labels: (data?.distribution ?? []).map(row => labels[row.key] ?? row.key),
    datasets: [{ data: (data?.distribution ?? []).map(row => row.value), backgroundColor: palette, borderWidth: 3, borderColor: '#fff' }] }), [data]);
  const total = data?.distribution?.reduce((n, row) => n + row.value, 0) ?? 0;
  return <section className="workspace-analytics" aria-label="Phân tích tổng quan">
    <div className="workspace-analytics-toolbar"><span>{data ? `${data.from} – ${data.to}` : 'Phân tích theo kỳ'}</span>
      <div className="workspace-period" role="group" aria-label="Khoảng thời gian phân tích">{[7, 30, 90].map(value =>
        <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} ngày</button>)}</div></div>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải phân tích" />}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <Notice state={resource.status} title="Chưa tải được số liệu phân tích"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {data && resource.status === 'success' && <>
      <dl className="workspace-metrics">{data.metrics.map((metric, i) => { const Icon = icons[i % icons.length]; return <div key={metric.label}>
        <span className={'workspace-metric-icon workspace-metric-icon--' + i}><Icon size={21} aria-hidden="true" /></span>
        <div><dt>{metric.label}</dt><dd>{metric.value.toLocaleString('vi-VN')}</dd></div></div>; })}</dl>
      <div className="workspace-analysis-grid">
        <section className="workspace-analysis"><h2>{data.trendLabel}</h2><AnalyticsChart type="bar" data={trend} label={data.trendLabel} />
          <details className="workspace-data-details"><summary>Xem số liệu theo ngày</summary><table><thead><tr><th>Ngày</th><th>Số lượng</th></tr></thead>
            <tbody>{data.trend.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.value}</td></tr>)}</tbody></table></details></section>
        <section className="workspace-analysis"><h2>{kind === 'users' ? 'Phân bố vai trò' : kind === 'services' ? 'Lượt chăm sóc theo dịch vụ' : 'Trạng thái buổi chăm sóc'}</h2>
          {kind === 'users' && <p className="workspace-updated">Một tài khoản có thể có nhiều vai trò.</p>}
          {total ? <AnalyticsChart type="doughnut" data={distribution} label="Phân bố số lượng" /> : <p className="workspace-chart-empty">Chưa có dữ liệu trong kỳ</p>}
          <ul className="workspace-legend">{data.distribution.map((row, i) => <li key={row.key}><span style={{ backgroundColor: palette[i % palette.length] }} />
            <span>{labels[row.key] ?? row.key}</span><strong>{row.value}</strong></li>)}</ul></section>
      </div>
      <p className="workspace-updated">Cập nhật {new Date(data.asOf).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
    </>}
  </section>;
}
