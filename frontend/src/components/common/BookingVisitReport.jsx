import { CareWorkflowReport } from './CareWorkflowReport.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dialog } from '../ui/index.js';
import { complaintDeadline } from '../../utils/complaint-presentation.js';
import { VisitEvidencePreview } from './VisitEvidencePreview.jsx';

const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận';

function complaintCutoffText(action) {
  if (action?.deadlineSource === 'INCIDENT_RESULT') return 'nhận kết quả sự cố';
  if (action?.deadlineSource === 'VISIT_CLOSED' || action?.visitState === 'STAFF_CLOSED') return 'buổi được đóng';
  return 'buổi kết thúc';
}

export function BookingVisitReport({ visit, readEvidence, complaintAction = null }) {
  const [open, setOpen] = useState(false);
  const canShowComplaint = Boolean(
    complaintAction?.to
    && (complaintAction.eligible === true || complaintAction.reason === 'COMPLAINT_ALREADY_OPEN')
  );
  const deadlineText = canShowComplaint ? complaintDeadline(complaintAction.deadlineAt) : null;
  return <><Button variant="secondary" onClick={() => setOpen(true)}>Xem báo cáo và ảnh</Button>
    <Dialog open={open} title="Báo cáo buổi chăm sóc" onClose={() => setOpen(false)} className="visit-evidence-dialog">
      {open && <div className="booking-visit-report">
        <p>Lịch chăm sóc: {date(visit.startAt)} – {date(visit.endAt)}</p>
        <p>Người chăm sóc: {visit.sitterName ?? 'Chưa phân công'}</p>
        <dl><dt>Check-in thực tế</dt><dd>{date(visit.checkInAt)}</dd><dt>Check-out thực tế</dt><dd>{date(visit.checkOutAt)}</dd></dl>
        <h3>Nội dung chăm sóc đã ghi nhận</h3>
        {visit.workflow && visit.workflow.mode !== 'LEGACY'
          ? <CareWorkflowReport workflow={visit.workflow} readEvidence={readEvidence} />
          : visit.checklist?.length ? <ul>{visit.checklist.map(item => <li key={item.itemId}>
          <strong>{item.label}</strong><p>{item.status === 'DONE' ? 'Đã thực hiện' : item.status === 'SKIPPED' ? 'Không thực hiện' : 'Chưa ghi nhận'}{item.reason ? ` · ${item.reason}` : ''}</p>
        </li>)}</ul> : <p>Người chăm sóc chưa lưu checklist cho buổi này.</p>}
        {visit.customerNote && <>
          <h3>Ghi chú cho khách</h3>
          <p className="booking-visit-report__note">{visit.customerNote}</p>
        </>}
        <h3>Ảnh bằng chứng</h3>
        {visit.evidence?.length ? <div className="visit-evidence-gallery">{visit.evidence.map(item => <VisitEvidencePreview
          key={item.kind + item.mediaId} mediaId={item.mediaId} read={readEvidence}
          label={item.kind === 'CHECK_IN' ? 'Ảnh check-in' : 'Ảnh check-out'} />)}</div>
          : <p>Ảnh sẽ xuất hiện khi người chăm sóc gửi bằng chứng cho buổi này.</p>}
        {canShowComplaint && <div className="booking-visit-report__complaint">
          <Link className="pwc-button pwc-button--secondary" to={complaintAction.to} onClick={() => setOpen(false)}>Gửi khiếu nại</Link>
          {deadlineText && <p className="booking-visit-report__complaint-deadline">
            Bạn gửi được khiếu nại đến {deadlineText} (7 ngày sau khi {complaintCutoffText(complaintAction)}).
          </p>}
        </div>}
      </div>}
    </Dialog></>;
}
