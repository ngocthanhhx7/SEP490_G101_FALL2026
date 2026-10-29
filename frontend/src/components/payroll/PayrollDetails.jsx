import './payroll.css';

export const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export const date = value => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short' }).format(new Date(value));
export const payrollStatus = value => ({ SUBMITTED: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', WITHDRAWN: 'Đã rút', PAID: 'Đã ghi nhận chi trả', PREPARED: 'Chờ duyệt bảng lương', VOIDED: 'Đã hủy phiếu' })[value] || value;
const lines = [['baseVnd', 'Lương cơ bản'], ['commissionVnd', 'Hoa hồng'], ['bonusVnd', 'Thưởng KPI'], ['overtimeVnd', 'Làm thêm / ban đêm'], ['grossVnd', 'Tổng gross'], ['employeeInsuranceVnd', 'Bảo hiểm người lao động'], ['incomeTaxVnd', 'Thuế TNCN'], ['otherLawfulDeductionsVnd', 'Khoản khấu trừ hợp lệ'], ['paidAdvanceVnd', 'Đối trừ tạm ứng'], ['payableVnd', 'Thực nhận kỳ này']];
export function PayrollStatement({ statement, children }) {
  return <article className="payroll-statement">
    <header><h2>{date(statement.periodStart)} – {date(statement.periodEnd)}</h2><span>{payrollStatus(statement.status)}</span></header>
    <p>Hạn trả: {date(statement.dueAt)}{statement.paidAt ? ` · Ghi nhận chi trả: ${date(statement.paidAt)}` : ''}</p>
    {statement.voidReason && <p>Lý do hủy: {statement.voidReason}</p>}
    <dl>{lines.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{money(statement.breakdown[key])}</dd></div>)}</dl>
    {children}
  </article>;
}
export function PayrollField({ label, ...props }) {
  return <label className="payroll-field"><span>{label}</span><input required {...props} /></label>;
}
export function PayrollLoadState({ state }) {
  return <>{state.loading && <p role="status">Đang tải bảng lương…</p>}{state.error && <div role="alert"><p>Không tải được dữ liệu ({state.error}).</p><button type="button" onClick={state.refresh}>Tải lại</button></div>}{state.message && <p role="status">{state.message}</p>}</>;
}
export function PayrollPager({ label, pages, setPages, nextCursor, busy }) {
  if (pages.length === 1 && !nextCursor) return null;
  return <nav className="payroll-pagination" aria-label={`Phân trang ${label}`}>
    <button type="button" disabled={busy || pages.length < 2} aria-label={`Trang trước ${label}`} title="Trang trước" onClick={() => setPages(current => current.slice(0, -1))}>&larr;</button>
    <span>Trang {pages.length}</span>
    <button type="button" disabled={busy || !nextCursor} aria-label={`Trang tiếp ${label}`} title="Trang tiếp" onClick={() => setPages(current => [...current, nextCursor])}>&rarr;</button>
  </nav>;
}
