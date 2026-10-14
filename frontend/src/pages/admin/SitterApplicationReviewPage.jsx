import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterApplicationAdminApi } from '../../services/sitter-application-api.js';
import { StateLabel } from './SitterApplicationsPage.jsx';
import './sitter-applications.css';

function dateText(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function SitterApplicationReviewPage({ api = sitterApplicationAdminApi, applicationId: suppliedId }) {
  const params = useParams();
  const applicationId = suppliedId ?? params.applicationId;
  const load = useCallback(({ signal }) => api.get({ applicationId, signal }), [api, applicationId]);
  const resource = useApiResource(load);
  const [reason, setReason] = useState('');
  const [interviewNote, setInterviewNote] = useState('');
  const [sitterStatusReason, setSitterStatusReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  async function startReview(interview = false) {
    setBusy(true); setNotice(null);
    try {
      await (interview === true ? api.startInterview : api.startReview)({ applicationId, expectedVersion: resource.data.version });
      resource.retry();
    } catch (error) {
      setNotice({ state: error?.status === 403 ? 'forbidden' : 'error', message: error?.code === 'CSRF_NOT_READY'
        ? 'Bảo vệ phiên thao tác Admin chưa được kết nối.' : 'Không thể bắt đầu thẩm định. Tải lại hồ sơ để kiểm tra phiên bản.' });
    } finally { setBusy(false); }
  }

  async function decide(action) {
    if (action === 'REJECT' && reason.trim().length < 3) {
      setNotice({ state: 'error', message: 'Nhập lý do từ chối, tối thiểu 3 ký tự.' });
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const result = await api.decide({ applicationId, action, reason: reason.trim(),
        interviewNote: interviewNote.trim(), expectedVersion: resource.data.version });
      setNotice({ state: result.data?.state === 'REJECTED' ? 'pending' : 'success',
        message: result.data?.state === 'REJECTED'
          ? `Đã lưu quyết định. Có thể nộp lại sau ${dateText(result.data.reapplyAt)}. Thông báo cho ứng viên đang chờ tích hợp.`
          : 'Đã duyệt và tạo tài khoản Sitter. Liên kết liên hệ và kích hoạt đăng nhập còn chờ xác minh.' });
      resource.retry();
    } catch (error) {
      const message = error?.code === 'CSRF_NOT_READY' ? 'Bảo vệ phiên thao tác Admin chưa được kết nối.'
        : error?.code === 'VERSION_CONFLICT' ? 'Hồ sơ đã được cập nhật. Hãy tải lại trước khi quyết định.'
          : 'Không thể lưu quyết định. Hãy kiểm tra hồ sơ và thử lại.';
      setNotice({ state: error?.status === 403 ? 'forbidden' : 'error', message });
    } finally { setBusy(false); }
  }

  async function changeSitterStatus(action) {
    if (sitterStatusReason.trim().length < 3) {
      setNotice({ state: 'error', message: 'Nhập lý do trạng thái, tối thiểu 3 ký tự.' });
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const result = await api.changeSitterStatus({ applicationId, action,
        reason: sitterStatusReason.trim(), expectedVersion: resource.data.sitterStatus.version });
      setNotice({ state: 'success', message: result.data?.status === 'SUSPENDED'
        ? 'Đã tạm ngưng Sitter. Quyền đọc lịch sử và phiên đăng nhập được giữ nguyên.'
        : 'Đã khôi phục trạng thái Sitter. Lý do thao tác đã được ghi audit.' });
      resource.retry();
    } catch (error) {
      const message = error?.code === 'CSRF_NOT_READY' ? 'Bảo vệ phiên thao tác Admin chưa được kết nối.'
        : error?.code === 'VERSION_CONFLICT' ? 'Trạng thái đã được cập nhật. Hãy tải lại trước khi thử lại.'
          : 'Không thể cập nhật trạng thái Sitter. Hãy kiểm tra hồ sơ và thử lại.';
      setNotice({ state: error?.status === 403 ? 'forbidden' : 'error', message });
    } finally { setBusy(false); }
  }

  return <main className="sitter-app-admin" aria-labelledby="sitter-review-title">
    <header className="sitter-app-admin__header"><div>
      <p className="sitter-app-admin__eyebrow">Paw World Care · Thẩm định</p>
      <h1 id="sitter-review-title">Chi tiết hồ sơ ứng tuyển</h1>
    </div></header>
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải hồ sơ"><p>Đang tải thông tin được phân quyền.</p></Notice>}
    {resource.status === 'pending' && <Notice state="pending" title="Đang chờ máy chủ"><p>Chưa nhận được hồ sơ hoàn chỉnh.</p></Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền"><p>Chỉ Admin được mở chi tiết hồ sơ.</p></Notice>}
    {resource.status === 'error' && <Notice state="error" title="Không thể tải hồ sơ"><p>Hồ sơ không tồn tại hoặc chưa thể truy cập.</p>
      <Button variant="secondary" onClick={resource.retry}>Thử lại</Button></Notice>}
    {resource.status === 'success' && <>
      <section className="sitter-app-detail" aria-label="Thông tin hồ sơ">
        <div className="sitter-app-detail__title"><div><h2>{resource.data.displayName}</h2>
          <p>{resource.data.contact.value} · {resource.data.contact.channel}</p></div>
          <StateLabel state={resource.data.state} /></div>
        <dl>
          <div><dt>Đủ 18 tuổi</dt><dd>{resource.data.ageEligible ? 'Có' : 'Không'}</dd></div>
          <div><dt>Kinh nghiệm</dt><dd>{resource.data.experience}</dd></div>
          <div><dt>Dịch vụ mong muốn</dt><dd>{resource.data.requestedServices.join(' · ')}</dd></div>
          <div><dt>Khu vực mong muốn</dt><dd>{resource.data.workAreas.join(' · ')}</dd></div>
          <div><dt>Lý do quyết định</dt><dd>{resource.data.decisionReason || 'Chưa có'}</dd></div>
          <div><dt>Nộp lại từ</dt><dd>{dateText(resource.data.reapplyAt)}</dd></div>
        </dl>
        <section aria-labelledby="sitter-app-documents-title">
          <h3 id="sitter-app-documents-title">Tài liệu riêng tư</h3>
          {resource.data.documents.length ? <ul>{resource.data.documents.map(document => <li key={document.documentId}>
            <span>{document.documentType === 'IDENTITY' ? 'Giấy tờ định danh' : 'Tài liệu bổ sung'}</span>
            <a href={api.documentUrl({ applicationId, documentId: document.documentId })} target="_blank" rel="noreferrer">
              Mở tài liệu đã kiểm soát quyền
            </a>
          </li>)}</ul> : <p>Chưa có tài liệu.</p>}
        </section>
        {['PENDING', 'UNDER_REVIEW', 'INTERVIEW'].includes(resource.data.state) && <section className="sitter-app-review-form" aria-label="Ghi nhận thẩm định">
          {resource.data.state === 'PENDING' && <Button variant="secondary" disabled={busy} onClick={startReview}>Bắt đầu thẩm định</Button>}
          {resource.data.state === 'UNDER_REVIEW' && <Button variant="secondary" disabled={busy} onClick={() => startReview(true)}>Chuyển sang phỏng vấn</Button>}
          <label className="sitter-app-admin__search" htmlFor="sitter-interview-note">
            <span>Ghi chú phỏng vấn nội bộ</span>
            <textarea id="sitter-interview-note" rows="3" maxLength="2000" value={interviewNote}
              onChange={event => setInterviewNote(event.target.value)} />
          </label>
          <label className="sitter-app-admin__search" htmlFor="sitter-decision-reason">
            <span>Lý do quyết định</span>
            <textarea id="sitter-decision-reason" rows="3" maxLength="1000" value={reason}
              onChange={event => setReason(event.target.value)} />
          </label>
          <div className="sitter-app-review-form__actions">
            <Button loading={busy} onClick={() => decide('APPROVE')}>Duyệt và tạo tài khoản</Button>
            <Button variant="danger" loading={busy} onClick={() => decide('REJECT')}>Từ chối hồ sơ</Button>
          </div>
        </section>}
        {resource.data.state === 'APPROVED' && resource.data.sitterStatus && <section className="sitter-app-review-form" aria-label="Trạng thái Sitter">
          <h3>Trạng thái tài khoản Sitter</h3>
          <p>Hiện tại: <strong>{resource.data.sitterStatus.status === 'SUSPENDED' ? 'Tạm ngưng' : 'Đang hoạt động'}</strong></p>
          {resource.data.sitterStatus.reason && <p>Lý do gần nhất: {resource.data.sitterStatus.reason}</p>}
          <label className="sitter-app-admin__search" htmlFor="sitter-status-reason">
            <span>Lý do thay đổi trạng thái</span>
            <textarea id="sitter-status-reason" rows="3" maxLength="1000" value={sitterStatusReason}
              onChange={event => setSitterStatusReason(event.target.value)} />
          </label>
          <div className="sitter-app-review-form__actions">
            {resource.data.sitterStatus.status === 'ACTIVE'
              ? <Button variant="danger" loading={busy} onClick={() => changeSitterStatus('SUSPEND')}>Tạm ngưng Sitter</Button>
              : <Button loading={busy} onClick={() => changeSitterStatus('REINSTATE')}>Khôi phục Sitter</Button>}
          </div>
          <Notice state="pending" title="Offer check đang chờ P21">
            Trạng thái này không khóa phiên hoặc lịch sử. P21 phải kiểm tra trạng thái trước khi phát offer.
          </Notice>
        </section>}
      </section>
      {notice && <Notice state={notice.state} title="Kết quả thao tác"><p>{notice.message}</p></Notice>}
    </>}
  </main>;
}
