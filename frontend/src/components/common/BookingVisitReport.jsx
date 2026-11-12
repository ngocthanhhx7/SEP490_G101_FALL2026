import { useState } from 'react';
import { Button, Dialog } from '../ui/index.js';
import { VisitEvidencePreview } from './VisitEvidencePreview.jsx';

const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận';
export function BookingVisitReport({ visit, readEvidence }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="secondary" onClick={() => setOpen(true)}>Xem báo cáo và ảnh</Button>
    <Dialog open={open} title="Báo cáo buổi chăm sóc" onClose={() => setOpen(false)} className="visit-evidence-dialog">
      {open && <div className="booking-visit-report">
        <p>Lịch chăm sóc: {date(visit.startAt)} – {date(visit.endAt)}</p>
        <p>Người chăm sóc: {visit.sitterName ?? 'Chưa phân công'}</p>
        <dl><dt>Check-in thực tế</dt><dd>{date(visit.checkInAt)}</dd><dt>Check-out thực tế</dt><dd>{date(visit.checkOutAt)}</dd></dl>
        <h3>Nội dung chăm sóc đã ghi nhận</h3>
        {visit.checklist?.length ? <ul>{visit.checklist.map(item => <li key={item.itemId}>
          <strong>{item.label}</strong><p>{item.status === 'DONE' ? 'Đã thực hiện' : item.status === 'SKIPPED' ? 'Không thực hiện' : 'Chưa ghi nhận'}{item.reason ? ` · ${item.reason}` : ''}</p>
        </li>)}</ul> : <p>Người chăm sóc chưa lưu checklist cho buổi này.</p>}
        <h3>Ảnh bằng chứng</h3>
        {visit.evidence?.length ? <div className="visit-evidence-gallery">{visit.evidence.map(item => <VisitEvidencePreview
          key={item.kind + item.mediaId} mediaId={item.mediaId} read={readEvidence}
          label={item.kind === 'CHECK_IN' ? 'Ảnh check-in' : 'Ảnh check-out'} />)}</div>
          : <p>Ảnh sẽ xuất hiện khi người chăm sóc gửi bằng chứng cho buổi này.</p>}
      </div>}
    </Dialog></>;
}
