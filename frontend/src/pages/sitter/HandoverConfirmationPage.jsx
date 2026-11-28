import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { CareWorkflowReport } from '../../components/common/CareWorkflowReport.jsx';
import { VisitEvidencePreview } from '../../components/common/VisitEvidencePreview.jsx';
import { Button, Dialog, Input, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { formatWithdrawalDate as date, formatWithdrawalTime as time, VISIT_WITHDRAWAL_REASON_LABELS } from '../../constants/visit-withdrawal-messages.js';
import './handover-confirmation.css';

const shortDate = value => date(value).slice(0, 5);
const localTime = value => `${time(value)} ngày ${date(value)}`;
const reportDateTime = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận';
const interval = row => `${time(row.startAt)} – ${time(row.endAt)}`;
const careLabels = { feeding: 'Cho ăn', handling: 'Hành vi', health: 'Sức khỏe', allergies: 'Dị ứng',
  medication: 'Thuốc theo hướng dẫn thú y', vaccination: 'Vaccine', emergencyContact: 'Liên hệ khẩn cấp', veterinaryContact: 'Phòng khám thú y' };
const reportHeadings = ['Ngày', 'Giờ', 'Người chăm sóc', 'Tóm tắt', 'Báo cáo'];
// Reasons the system sets itself. A suspension never shows what the Admin wrote.
const systemReasons = {
  BOOKING_RESCHEDULED: 'Khách đổi lịch, người chăm sóc trước không thể nhận giờ mới.',
  SITTER_SUSPENDED: 'Người chăm sóc trước tạm ngưng nhận việc'
};

// A time that has already passed (an urgent handover, or a replacement after the start) is not shown as "from 07:00".
function afterConfirm(visit, now = Date.now()) {
  const noteOpen = +new Date(visit.accessOpensAt) <= now, checkInOpen = +new Date(visit.checkInOpensAt) <= now;
  if (noteOpen && checkInOpen) return 'Sau khi xác nhận, bạn xem ghi chú vào nhà và check-in được ngay.';
  const note = noteOpen ? 'bạn xem ghi chú vào nhà được ngay' : `ghi chú vào nhà hiện từ ${time(visit.accessOpensAt)}`;
  const checkIn = checkInOpen ? 'check-in được ngay' : `check-in được từ ${time(visit.checkInOpensAt)}`;
  return `Sau khi xác nhận, ${note} và bạn ${checkIn}.`;
}

function Detail({ label, children }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function HandoverNote({ note, assignedAt }) {
  const reason = note.reasonText || systemReasons[note.reasonCode] || VISIT_WITHDRAWAL_REASON_LABELS[note.reasonCode];
  return <section className="handover-confirmation__card handover-confirmation__note">
    <h2>Ghi chú bàn giao</h2>
    <dl className="handover-confirmation__details">
      <Detail label="Lý do đổi người">{reason || 'Chưa ghi nhận'}</Detail>
      <Detail label="Người chăm sóc trước">{note.previousSitterName || 'Chưa ghi nhận'}
        {note.previousSitterName && note.previousVisitCount > 0 && ` (đã làm ${note.previousVisitCount} buổi của lịch đặt này)`}
      </Detail>
      <Detail label="Chuyển cho bạn lúc">{assignedAt ? localTime(assignedAt) : 'Chưa ghi nhận'}</Detail>
    </dl>
  </section>;
}

function CareInstructions({ care }) {
  return <section className="handover-confirmation__card handover-confirmation__care">
    <div className="handover-confirmation__heading">
      <h2>Hướng dẫn chăm sóc đã xác nhận</h2>
      {care.revision && <span className="handover-confirmation__badge">Bản {care.revision}</span>}
    </div>
    <p className="handover-confirmation__muted">{care.confirmedAt
      ? `Khách xác nhận lúc ${localTime(care.confirmedAt)}.` : 'Chưa ghi nhận thời điểm khách xác nhận.'}</p>
    {care.pets.map((pet, index) => {
      const fields = Object.entries(careLabels).filter(([key]) => pet.profile[key]?.status === 'KNOWN');
      return <div key={index}>
        {care.pets.length > 1 && <h3>{pet.name}</h3>}
        <dl className="handover-confirmation__details">{fields.map(([key, label]) =>
          <Detail key={key} label={label}>{pet.profile[key].value}</Detail>)}</dl>
        {!fields.length && <p>Chưa có hướng dẫn riêng cho {pet.name}.</p>}
      </div>;
    })}
    {care.tasks.length > 0 && <dl className="handover-confirmation__details handover-confirmation__tasks">
      <Detail label="Việc cần làm"><ul>{care.tasks.map((task, index) => <li key={index}>{task}</li>)}</ul></Detail>
    </dl>}
    {care.additionalTasks?.length > 0 && <dl className="handover-confirmation__details handover-confirmation__tasks">
      <Detail label="Việc khách bổ sung"><ul>{care.additionalTasks.map(task =>
        <li key={task.itemId}>{task.label}{task.required ? '' : ' (Tuỳ chọn)'}</li>)}</ul></Detail>
    </dl>}
  </section>;
}

function EarlierReportContent({ api, visitId, reportVisitId }) {
  const load = useCallback(({ signal }) => api.handoverEarlierReport(visitId, reportVisitId, { signal }), [api, visitId, reportVisitId]);
  const resource = useApiResource(load);
  if (resource.status === 'loading') return <p role="status">Đang tải báo cáo buổi chăm sóc…</p>;
  if (resource.status !== 'success' || !resource.data) {
    return <Notice state="error" title="Chưa tải được báo cáo buổi chăm sóc."
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />;
  }
  const detail = resource.data;
  return <div className="booking-visit-report">
    <p>Lịch chăm sóc: {reportDateTime(detail.startAt)} – {reportDateTime(detail.endAt)}</p>
    <p>Người chăm sóc: {detail.sitterName ?? 'Chưa phân công'}</p>
    <dl>
      <dt>Check-in thực tế</dt><dd>{reportDateTime(detail.checkInAt)}</dd>
      <dt>Check-out thực tế</dt><dd>{reportDateTime(detail.checkOutAt)}</dd>
    </dl>
    <h3>Nội dung chăm sóc đã ghi nhận</h3>
    {detail.workflow && detail.workflow.mode !== 'LEGACY'
      ? <CareWorkflowReport workflow={detail.workflow} readEvidence={api.readEvidence} />
      : detail.checklist?.length ? <ul>{detail.checklist.map(item => <li key={item.itemId}>
        <strong>{item.label}</strong>
        <p>{item.status === 'DONE' ? 'Đã thực hiện' : item.status === 'SKIPPED' ? 'Không thực hiện' : 'Chưa ghi nhận'}{item.reason ? ` · ${item.reason}` : ''}</p>
      </li>)}</ul> : <p>Người chăm sóc chưa lưu checklist cho buổi này.</p>}
    {detail.customerNote && <>
      <h3>Ghi chú cho khách</h3>
      <p className="booking-visit-report__note">{detail.customerNote}</p>
    </>}
    <h3>Ảnh bằng chứng</h3>
    {detail.evidence?.length ? <div className="visit-evidence-gallery">{detail.evidence.map(item => <VisitEvidencePreview
      key={item.kind + item.mediaId} mediaId={item.mediaId} read={api.readEvidence}
      label={item.kind === 'CHECK_IN' ? 'Ảnh check-in' : 'Ảnh check-out'} />)}</div>
      : <p>Không có ảnh check-in/check-out được lưu cho buổi này.</p>}
  </div>;
}

function EarlierReports({ reports, onView }) {
  return <section className="handover-confirmation__card handover-confirmation__reports">
    <h2>Báo cáo các buổi trước</h2>
    {reports.length ? <table className="handover-confirmation__table">
      <thead><tr>{reportHeadings.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{reports.map((report, index) => {
        const cells = [shortDate(report.startAt), interval(report),
          (report.sitterName ?? 'Chưa ghi nhận') + (report.mine ? ' (bạn)' : ''),
          [report.requiredTasksComplete ? 'Đủ việc bắt buộc' : 'Chưa có đủ dữ liệu việc bắt buộc', `${report.photoCount} ảnh`].join(' · ')];
        return <tr key={report.visitId ?? index}>
          {cells.map((value, column) => <td key={reportHeadings[column]}>
            <span className="handover-confirmation__mobile-label" aria-hidden="true">{reportHeadings[column]}</span>{value}
          </td>)}
          <td className="handover-confirmation__report-action">
            <span className="handover-confirmation__mobile-label" aria-hidden="true">{reportHeadings[4]}</span>
            <Button variant="secondary" type="button" onClick={() => onView(report)} disabled={!report.visitId}>Xem</Button>
          </td>
        </tr>;
      })}</tbody>
    </table> : <p>Chưa có báo cáo buổi trước.</p>}
  </section>;
}

export function HandoverConfirmationPage({ api, visitId }) {
  const visitPath = '/sitter/visits/' + visitId;
  const load = useCallback(({ signal }) => api.handover(visitId, { signal }), [api, visitId]);
  const resource = useApiResource(load);
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [changed, setChanged] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const command = useSchedulingCommand(result => { setSelectedReport(null); setConfirmed(result.data); });
  const visit = confirmed ?? resource.data;
  const pending = visit?.state === 'PENDING';

  function submit(event) {
    event.preventDefault();
    if (!pending || !checked || command.busy || command.pending) return;
    setChanged(false);
    command.execute(async key => {
      try {
        return await api.confirmHandover(visitId, { expectedVersion: visit.version, careVersion: visit.care.version, acknowledged: true }, key);
      } catch (error) {
        if ([404, 409].includes(error.status)) {
          setChecked(false);
          setChanged(error.status === 409);
          resource.retry();
        }
        throw error;
      }
    });
  }

  return <section className="pwc-mobile-screen sitter-workspace handover-confirmation">
    <Link data-page-back className="handover-confirmation__back" to={visitPath}>← Quay lại buổi chăm sóc</Link>
    <div className="handover-confirmation__heading"><h1 data-duplicate-title>Xác nhận bàn giao</h1>
      {pending && <span className="handover-confirmation__badge handover-confirmation__badge--warning">Cần bàn giao</span>}
    </div>
    {resource.status === 'loading' && !confirmed && <p role="status">Đang tải thông tin bàn giao…</p>}
    {resource.httpStatus === 404 && <Notice state="error" title="Buổi không còn khả dụng với tài khoản này."
      action={<Link className="sitter-workspace-link" to="/sitter/schedule">Về ca làm</Link>} />}
    {resource.httpStatus !== 404 && ['error', 'forbidden', 'pending'].includes(resource.status) &&
      <Notice state="error" title="Chưa tải được thông tin bàn giao."
        action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {changed && resource.status === 'success' &&
      <Notice state="warning" title="Buổi vừa thay đổi. Trang đã tải lại thông tin mới." />}
    {confirmed && <Notice state="success" title={`Đã xác nhận bàn giao. Bạn check-in được từ ${time(confirmed.checkInOpensAt)}.`}
      action={<Link className="sitter-workspace-link" to={visitPath}>Về buổi chăm sóc</Link>} />}
    {!confirmed && visit?.state === 'CONFIRMED' && <Notice state="success" title={visit.acceptedAt
      ? `Đã xác nhận bàn giao lúc ${time(visit.acceptedAt)} ngày ${shortDate(visit.acceptedAt)}.` : 'Đã xác nhận bàn giao.'}
      action={<Link className="sitter-workspace-link" to={visitPath}>Về buổi chăm sóc</Link>} />}
    {visit?.state === 'NOT_REQUIRED' && <Notice state="info" title="Buổi này không cần bàn giao."
      action={<Link className="sitter-workspace-link" to={visitPath}>Về buổi chăm sóc</Link>} />}
    {pending && <>
      <p className="handover-confirmation__summary">{[`Buổi ${shortDate(visit.startAt)}`, interval(visit), visit.bookingCode, visit.serviceName,
        visit.pets.map(pet => pet.name).join(', '), visit.serviceAddress].filter(Boolean).join(' · ')}</p>
      <Notice className="handover-confirmation__deadline" state="warning" title={visit.urgent
        ? 'Buổi được giao cho bạn khi còn chưa đầy 1 giờ. Hãy đọc và xác nhận ngay, trước khi check-in.'
        : `Bạn nhận buổi này thay người chăm sóc trước. Hãy đọc và xác nhận trước ${time(visit.accessOpensAt)} ngày ${shortDate(visit.accessOpensAt)} (1 giờ trước buổi). Chưa xác nhận thì nhân viên sẽ liên hệ bạn.`} />
      <div className="handover-confirmation__grid">
        <div className="handover-confirmation__main">
          <HandoverNote note={visit.note} assignedAt={visit.assignedAt} />
          <CareInstructions care={visit.care} />
          <EarlierReports reports={visit.reports} onView={setSelectedReport} />
        </div>
        <div className="handover-confirmation__side">
        <section className="handover-confirmation__card handover-confirmation__pets">
          <h2>Thú cưng</h2>
          <dl className="handover-confirmation__details handover-confirmation__details--inline">{visit.pets.map((pet, index) =>
            <Detail label={pet.name} key={index}>{pet.breed ?? 'Chưa ghi nhận giống'}</Detail>)}</dl>
          {!visit.pets.length && <p>Chưa ghi nhận thú cưng cho buổi này.</p>}
        </section>
        <form className="handover-confirmation__card handover-confirmation__confirm" onSubmit={submit}>
          <h2>Xác nhận</h2>
          <Input type="checkbox" className="handover-confirmation__checkbox"
            label="Tôi đã đọc hướng dẫn chăm sóc và ghi chú bàn giao." checked={checked}
            disabled={command.busy || command.pending} onChange={event => setChecked(event.target.checked)} />
          {command.pending
            ? <Button onClick={command.retry} loading={command.busy} loadingLabel="Đang xác nhận…">Thử xác nhận lại</Button>
            : <Button type="submit" disabled={!checked} loading={command.busy} loadingLabel="Đang xác nhận…">Xác nhận bàn giao</Button>}
          <p className="handover-confirmation__muted">{afterConfirm(visit)}</p>
          {command.message && !changed && !confirmed && <p role="status">{command.message}</p>}
        </form>
        </div>
      </div>
      <Dialog open={Boolean(selectedReport)} title="Báo cáo buổi chăm sóc" onClose={() => setSelectedReport(null)} className="visit-evidence-dialog">
        {selectedReport && <EarlierReportContent key={selectedReport.visitId} api={api} visitId={visitId} reportVisitId={selectedReport.visitId} />}
      </Dialog>
    </>}
  </section>;
}
