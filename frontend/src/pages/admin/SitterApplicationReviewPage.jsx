import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterApplicationAdminApi } from '../../services/sitter-application-api.js';
import { StateLabel } from './SitterApplicationsPage.jsx';
import { ApplicationDocumentDialog } from './ApplicationDocumentDialog.jsx';
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
  const [document, setDocument] = useState(null);

  async function startReview(interview = false) {
    setBusy(true); setNotice(null);
    try {
      await (interview === true ? api.startInterview : api.startReview)({ applicationId, expectedVersion: resource.data.version });
      setNotice({ state: 'success', message: interview === true
        ? 'Đã chuyển hồ sơ sang phỏng vấn. Bạn có thể theo dõi kết quả email thông báo bên dưới.'
        : 'Đã bắt đầu thẩm định hồ sơ. Bạn có thể theo dõi kết quả email thông báo bên dưới.' });
      resource.retry();
    } catch (error) {
      setNotice({ state: error?.status === 403 ? 'forbidden' : 'error', message: error?.code === 'CSRF_NOT_READY'
        ? 'Bảo vệ phiên thao tác Admin chưa được kết nối.' : 'Không thể bắt đầu thẩm định. Tải lại hồ sơ để kiểm tra phiên bản.' });
    } finally { setBusy(false); }
  }

  async function decide(action) {
    if (reason.trim().length < 3) {
      setNotice({ state: 'error', message: action === 'REJECT' ? 'Nhập lý do từ chối, tối thiểu 3 ký tự.' : 'Nhập lý do duyệt, tối thiểu 3 ký tự.' });
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const result = await api.decide({ applicationId, action, reason: reason.trim(),
        interviewNote: interviewNote.trim(), expectedVersion: resource.data.version });
      setNotice({ state: result.data?.state === 'REJECTED' ? 'pending' : 'success',
        message: result.data?.state === 'REJECTED'
          ? `Đã từ chối hồ sơ. Ứng viên có thể xem lý do và thời hạn nộp lại từ ${dateText(result.data.reapplyAt)} trong hồ sơ của mình. Kết quả email thông báo được hiển thị bên dưới.`
          : 'Đã duyệt hồ sơ và cấp quyền Pet Sitter. Ứng viên có tài khoản đã xác minh cần đăng nhập lại để nhận quyền mới. Kết quả email chúc mừng được hiển thị bên dưới.' });
      resource.retry();
    } catch (error) {
      const message = error?.code === 'CSRF_NOT_READY' ? 'Bảo vệ phiên thao tác Admin chưa được kết nối.'
        : error?.code === 'APPLICATION_STAGE_REQUIRED' ? 'Cần hoàn tất bước thẩm định và chuyển sang phỏng vấn trước khi quyết định.'
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
    <nav aria-label="Đường dẫn hồ sơ"><Link to="/admin/sitter-applications">← Danh sách hồ sơ ứng tuyển</Link></nav>
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
      <ol className="sitter-app-progress" aria-label="Tiến trình xét duyệt">
        {[['PENDING', 'Tiếp nhận'], ['UNDER_REVIEW', 'Thẩm định'], ['INTERVIEW', 'Phỏng vấn'],
          [resource.data.state === 'REJECTED' ? 'REJECTED' : 'APPROVED', 'Quyết định']].map(([state, label]) => {
            const event = resource.data.timeline?.find(row => row.state === state);
            return <li key={state} aria-current={resource.data.state === state ? 'step' : undefined}>
              <strong>{label}</strong><small>{event ? dateText(event.occurredAt) : 'Chưa ghi nhận'}</small></li>;
          })}
      </ol>
      <section className="sitter-app-detail" aria-label="Thông tin hồ sơ">
        <div className="sitter-app-detail__title"><div><h2>{resource.data.displayName}</h2>
          <p>{resource.data.contact.value} · {resource.data.contact.channel}</p></div>
          <StateLabel state={resource.data.state} /></div>
        <dl>
          <div><dt>Ngày nộp</dt><dd>{dateText(resource.data.createdAt)}</dd></div>
          <div><dt>Cập nhật gần nhất</dt><dd>{dateText(resource.data.updatedAt)}</dd></div>
          <div><dt>Đủ 18 tuổi</dt><dd>{resource.data.ageEligible ? 'Có' : 'Không'}</dd></div>
          <div><dt>Kinh nghiệm</dt><dd>{resource.data.experience}</dd></div>
          <div><dt>Hình thức làm việc mong muốn</dt><dd>{({ FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian' })[resource.data.employmentType] ?? 'Chưa cung cấp (hồ sơ cũ)'}</dd></div>
          <div><dt>Dịch vụ mong muốn</dt><dd>{resource.data.requestedServices.join(' · ')}</dd></div>
          <div><dt>Khu vực mong muốn</dt><dd>{resource.data.workAreas.join(' · ')}</dd></div>
          <div><dt>Lý do quyết định</dt><dd>{resource.data.decisionReason || 'Chưa có'}</dd></div>
          <div><dt>Nộp lại từ</dt><dd>{dateText(resource.data.reapplyAt)}</dd></div>
          <div><dt>Ghi chú phỏng vấn đã lưu (nội bộ)</dt><dd>{resource.data.interviewNote || 'Chưa ghi nhận'}</dd></div>
        </dl>
        <section aria-labelledby="sitter-app-documents-title">
          <h3 id="sitter-app-documents-title">Tài liệu riêng tư ({resource.data.documents.length})</h3>
          {resource.data.documents.length ? <ul>{resource.data.documents.map(document => <li key={document.documentId}>
            <span>{document.documentType === 'IDENTITY' ? 'Giấy tờ định danh' : 'Tài liệu bổ sung'}</span>
            <Button variant="secondary" onClick={() => setDocument(document)}>Xem {document.documentType === 'IDENTITY' ? 'giấy tờ định danh' : 'tài liệu bổ sung'}</Button>
          </li>)}</ul> : <p>Chưa có tài liệu.</p>}
        </section>
        {['PENDING', 'UNDER_REVIEW', 'INTERVIEW'].includes(resource.data.state) && <section className="sitter-app-review-form" aria-label="Ghi nhận thẩm định">
          <p>Chỉ duyệt khi đã hoàn tất thẩm định và có hợp đồng đã ký. Hình thức làm việc trong hồ sơ là nguyện vọng; hợp đồng, ca làm và quyền nhận việc được quản lý riêng.</p>
          {resource.data.state === 'PENDING' && <Button variant="secondary" disabled={busy} onClick={startReview}>Bắt đầu thẩm định</Button>}
          {resource.data.state === 'UNDER_REVIEW' && <Button variant="secondary" disabled={busy} onClick={() => startReview(true)}>Chuyển sang phỏng vấn</Button>}
          {resource.data.state !== 'INTERVIEW' && <Notice state="pending" title="Hoàn tất từng bước xét duyệt">Bắt đầu thẩm định, kiểm tra giấy tờ rồi chuyển hồ sơ sang phỏng vấn. Chỉ quyết định sau khi đã đến bước phỏng vấn. Mỗi lần chuyển trạng thái đều tạo email thông báo cho ứng viên.</Notice>}
          {resource.data.state === 'INTERVIEW' && <>
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
            <Button loading={busy} onClick={() => decide('APPROVE')}>Duyệt và cấp quyền Pet Sitter</Button>
            <Button variant="danger" loading={busy} onClick={() => decide('REJECT')}>Từ chối hồ sơ</Button>
          </div>
          </>}
        </section>}
        <section aria-label="Email cập nhật hồ sơ"><h3>Email thông báo</h3>
          <Button variant="secondary" onClick={resource.retry}>Cập nhật kết quả email</Button>
          {resource.data.emailNotifications?.length ? <ul>{resource.data.emailNotifications.map(mail => <li key={mail.version}>
            <StateLabel state={mail.state} /><span>{({ PENDING: 'Đang chờ gửi', SENDING: 'Đang gửi', ACCEPTED: 'SMTP đã tiếp nhận', FAILED: 'Gửi thất bại', UNKNOWN: 'Cần kiểm tra kết quả gửi', SKIPPED: 'Chưa có email đã xác minh để gửi' })[mail.deliveryState]}</span>
          </li>)}</ul> : <p>Chưa có bản ghi email cho hồ sơ này. Hệ thống sẽ thông báo từ lần cập nhật tiếp theo.</p>}
          <p className="sitter-app-private-note">SMTP tiếp nhận chưa đồng nghĩa người nhận đã đọc hoặc thư đã tới inbox.</p>
        </section>
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
    {document && <ApplicationDocumentDialog api={api} applicationId={applicationId} document={document} onClose={() => setDocument(null)} />}
  </main>;
}
