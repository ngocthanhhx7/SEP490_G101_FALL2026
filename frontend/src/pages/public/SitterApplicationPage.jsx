import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { Button, Notice } from '../../components/ui/index.js';
import { ApiError } from '../../services/api-client.js';
import { sitterApplicationApi } from '../../services/sitter-application-api.js';
import './sitter-application.css';
import { useApiResource } from '../../hooks/useApiResource.js';
import { loadPublicCatalog } from './public-catalog-adapter.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SUPPORTING_FILES = 5;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function lines(value) {
  return [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))];
}

function errorMessage(error) {
  if (error?.code === 'PROVIDER_UNAVAILABLE') return 'Chưa thể tải giấy tờ lên kho riêng tư. Hồ sơ chưa được gửi; vui lòng thử lại sau.';
  if (error?.code === 'AGE_REQUIREMENT_NOT_MET') return 'Ứng viên cần đủ 18 tuổi tại thời điểm nộp hồ sơ.';
  if (error?.code === 'APPLICATION_ALREADY_PENDING' || error?.code === 'REAPPLY_NOT_AVAILABLE') {
    return 'Không thể tiếp nhận hồ sơ này lúc này. Vui lòng liên hệ Paw World Care để được hỗ trợ.';
  }
  if (error?.code === 'VALIDATION_FAILED') return 'Một số thông tin chưa hợp lệ. Hãy kiểm tra lại các trường bắt buộc.';
  if (error?.code === 'FORBIDDEN') return 'Yêu cầu không được chấp nhận. Hãy tải lại trang rồi thử lại.';
  if (error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT') {
    return 'Chưa nhận được phản hồi từ máy chủ. Đừng gửi hồ sơ mới; hãy thử lại với cùng thông tin để đối soát kết quả.';
  }
  return 'Chưa thể gửi hồ sơ. Vui lòng thử lại sau.';
}

function validate({ displayName, contactChannel, contactValue, dateOfBirth, identityNumber,
  experience, services, areas, identityFile, supportingFiles }) {
  const errors = {};
  if (!displayName.trim()) errors.displayName = 'Nhập họ và tên.';
  else if (displayName.trim().length > 100) errors.displayName = 'Tối đa 100 ký tự.';
  if (!contactValue.trim()) errors.contactValue = 'Nhập email hoặc số điện thoại.';
  else if (contactChannel === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue.trim())) errors.contactValue = 'Email chưa đúng định dạng.';
  else if (contactChannel === 'PHONE' && !/^\+[1-9]\d{7,14}$/.test(contactValue.trim())) errors.contactValue = 'Dùng số điện thoại dạng quốc tế, ví dụ +84912345678.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) errors.dateOfBirth = 'Chọn ngày sinh hợp lệ.';
  if (!identityNumber.trim()) errors.identityNumber = 'Nhập số CCCD hoặc giấy tờ định danh.';
  if (experience.trim().length < 10) errors.experience = 'Mô tả ít nhất 10 ký tự về kinh nghiệm chăm sóc.';
  if (!lines(services).length) errors.services = 'Nhập ít nhất một dịch vụ mong muốn.';
  if (!lines(areas).length) errors.areas = 'Nhập ít nhất một khu vực mong muốn.';
  if (!identityFile) errors.identityFile = 'Chọn ảnh hoặc PDF giấy tờ định danh.';
  const files = [identityFile, ...supportingFiles].filter(Boolean);
  if (supportingFiles.length > MAX_SUPPORTING_FILES) errors.supportingFiles = `Tối đa ${MAX_SUPPORTING_FILES} giấy tờ bổ sung.`;
  if (files.some(file => !ACCEPTED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_BYTES)) {
    errors.files = 'Mỗi tệp phải là PDF, JPG hoặc PNG và không quá 5 MB.';
  }
  return errors;
}

export function SitterApplicationPage({ api = sitterApplicationApi, initialValues }) {
  const catalog = useApiResource(loadPublicCatalog);
  const [form, setForm] = useState({ displayName: '', contactChannel: 'EMAIL', contactValue: '',
    dateOfBirth: '', identityNumber: '', experience: '', services: '', areas: '', ...initialValues });
  const [identityFile, setIdentityFile] = useState(null);
  const [supportingFiles, setSupportingFiles] = useState([]);
  const [uploadedDocuments, setUploadedDocuments] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const idempotencyKey = useRef(null);

  function update(field, value) {
    idempotencyKey.current = null;
    setUploadedDocuments(null);
    setForm(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: undefined, files: undefined }));
    setNotice(null);
  }

  function focusFirst(nextErrors) {
    const ids = { displayName: 'sitter-applicant-name', contactValue: 'sitter-applicant-contact',
      dateOfBirth: 'sitter-applicant-birth-date', identityNumber: 'sitter-applicant-id',
      experience: 'sitter-applicant-experience', services: 'sitter-applicant-services',
      areas: 'sitter-applicant-areas', identityFile: 'sitter-applicant-id-file' };
    const first = Object.keys(ids).find(field => nextErrors[field]);
    if (first) document.getElementById(ids[first])?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = validate({ ...form, services: form.services, areas: form.areas, identityFile, supportingFiles });
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setNotice(null);
      focusFirst(nextErrors);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      let documents = uploadedDocuments;
      if (!documents) {
        const files = [{ file: identityFile, documentType: 'IDENTITY' },
          ...supportingFiles.map(file => ({ file, documentType: 'CERTIFICATE' }))];
        documents = [];
        for (const item of files) {
          const uploaded = await api.uploadDocument(item.file, { documentType: item.documentType });
          if (!uploaded || typeof uploaded.documentId !== 'string' || typeof uploaded.storageRef !== 'string') {
            throw new ApiError('INVALID_RESPONSE');
          }
          documents.push({ ...uploaded, documentType: item.documentType });
        }
        setUploadedDocuments(documents);
      }
      if (!idempotencyKey.current) idempotencyKey.current = api.createIdempotencyKey?.();
      const result = await api.submit({
        displayName: form.displayName.trim(), contactChannel: form.contactChannel,
        contactValue: form.contactValue.trim(), dateOfBirth: form.dateOfBirth,
        identityNumber: form.identityNumber.trim(), experience: form.experience.trim(),
        requestedServices: lines(form.services), workAreas: lines(form.areas), documents
      }, { key: idempotencyKey.current });
      setReceipt(result);
      setForm({ displayName: '', contactChannel: 'EMAIL', contactValue: '', dateOfBirth: '',
        identityNumber: '', experience: '', services: '', areas: '' });
      setIdentityFile(null);
      setSupportingFiles([]);
      setUploadedDocuments(null);
      idempotencyKey.current = null;
    } catch (error) {
      const message = errorMessage(error);
      setNotice({ state: error?.status === 403 ? 'forbidden' : 'error', title: 'Chưa gửi được hồ sơ', message });
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return <section className="sitter-application" aria-labelledby="sitter-application-receipt-title">
      <div className="sitter-application__card sitter-application__receipt">
        <p className="sitter-application__eyebrow">Paw World Care · Ứng tuyển Sitter</p>
        <h1 id="sitter-application-receipt-title">Đã tiếp nhận hồ sơ</h1>
        <p>Hồ sơ đang chờ Admin xem xét. Việc gửi hồ sơ chưa tạo tài khoản hoặc phiên Sitter.</p>
        <Notice state="pending" title="Theo dõi hồ sơ">
          Giữ bí mật mã tra cứu: <strong>{receipt.applicationCode}</strong>. Dùng mã này và OTP gửi về kênh liên hệ đã nộp để tra cứu.
        </Notice>
        <Link to="/sitter/application-status">Tra cứu trạng thái hồ sơ</Link>
      </div>
    </section>;
  }

  const apiUnavailable = !api?.uploadDocument || api.uploadsAvailable === false;
  return <section className="sitter-application" aria-labelledby="sitter-application-title">
    <div className="sitter-application__card">
      <header className="sitter-application__header">
        <p className="sitter-application__eyebrow">Paw World Care · Cơ hội đồng hành</p>
        <h1 id="sitter-application-title">Ứng tuyển Pet Sitter</h1>
        <p>Gửi thông tin để đội ngũ xem xét. Xác thực email trước khi hoàn tất hồ sơ. Chỉ được cấp quyền Pet Sitter sau khi hồ sơ được duyệt.</p>
        <Notice state="info" title="Bảo vệ thông tin của bạn">
          Số định danh chỉ được dùng để phát hiện hồ sơ trùng và không hiển thị trong danh sách Admin. Tệp giấy tờ cần được tải lên kho riêng tư.
        </Notice>
      </header>

      {apiUnavailable && <Notice state="pending" title="Chưa mở tiếp nhận giấy tờ">Bạn có thể xem các thông tin cần chuẩn bị. PawWorld sẽ mở nộp hồ sơ khi kho giấy tờ riêng tư sẵn sàng; hiện chưa thể gửi hồ sơ.</Notice>}
      <form className="sitter-application__form" noValidate onSubmit={submit}>
        <div className="sitter-application__grid">
          <label className="sitter-application__field" htmlFor="sitter-applicant-name">
            <span>Họ và tên</span>
            <input id="sitter-applicant-name" name="displayName" autoComplete="name" maxLength="100" required
              value={form.displayName} aria-invalid={Boolean(errors.displayName)}
              onChange={event => update('displayName', event.target.value)} />
            {errors.displayName && <span className="sitter-application__error">{errors.displayName}</span>}
          </label>

          <fieldset className="sitter-application__contact">
            <legend>Kênh liên hệ</legend>
            <div className="sitter-application__contact-options">
              <label><input type="radio" name="contactChannel" value="EMAIL" checked={form.contactChannel === 'EMAIL'}
                onChange={() => update('contactChannel', 'EMAIL')} /> Email</label>
              <label><input type="radio" name="contactChannel" value="PHONE" checked={false}
                disabled /> SMS — chưa khả dụng</label>
            </div>
            <label className="sitter-application__field" htmlFor="sitter-applicant-contact">
              <span>{form.contactChannel === 'EMAIL' ? 'Email' : 'Số điện thoại'}</span>
              <input id="sitter-applicant-contact" type={form.contactChannel === 'EMAIL' ? 'email' : 'tel'} readOnly={Boolean(initialValues?.contactValue)}
                autoComplete={form.contactChannel === 'EMAIL' ? 'email' : 'tel'}
                inputMode={form.contactChannel === 'PHONE' ? 'tel' : undefined} required value={form.contactValue}
                aria-invalid={Boolean(errors.contactValue)} onChange={event => update('contactValue', event.target.value)} />
              {errors.contactValue && <span className="sitter-application__error">{errors.contactValue}</span>}
            </label>
          </fieldset>

          <label className="sitter-application__field" htmlFor="sitter-applicant-birth-date">
            <span>Ngày sinh</span>
            <input id="sitter-applicant-birth-date" type="date" autoComplete="bday" required value={form.dateOfBirth}
              aria-invalid={Boolean(errors.dateOfBirth)} onChange={event => update('dateOfBirth', event.target.value)} />
            {errors.dateOfBirth && <span className="sitter-application__error">{errors.dateOfBirth}</span>}
          </label>
          <label className="sitter-application__field" htmlFor="sitter-applicant-id">
            <span>Số CCCD hoặc giấy tờ định danh</span>
            <input id="sitter-applicant-id" name="identityNumber" autoComplete="off" required value={form.identityNumber}
              aria-invalid={Boolean(errors.identityNumber)} onChange={event => update('identityNumber', event.target.value)} />
            {errors.identityNumber && <span className="sitter-application__error">{errors.identityNumber}</span>}
          </label>
        </div>

        <label className="sitter-application__field">
          <span>Kinh nghiệm chăm sóc thú cưng</span>
          <textarea id="sitter-applicant-experience" rows="4" maxLength="2000" required
            value={form.experience} aria-invalid={Boolean(errors.experience)}
            onChange={event => update('experience', event.target.value)} />
          {errors.experience && <span className="sitter-application__error">{errors.experience}</span>}
        </label>

        <div className="sitter-application__grid">
          <div className="sitter-application__field" role="group" aria-labelledby="sitter-service-label">
            <label id="sitter-service-label" htmlFor="sitter-applicant-services">Dịch vụ mong muốn <small>(mỗi dòng một mục)</small></label>
            {catalog.data?.available && catalog.data.services.length > 0 ? <span className="pwc-sitter-service-choices">
              {catalog.data.services.map(service => <label key={service.id}><input type="checkbox"
                checked={lines(form.services).includes(service.name)} onChange={event => update('services',
                  (event.target.checked ? [...lines(form.services), service.name] : lines(form.services).filter(name => name !== service.name)).join('\n'))} />{service.name}</label>)}
            </span> : <textarea id="sitter-applicant-services" rows="3" maxLength="1000" required
              value={form.services} aria-invalid={Boolean(errors.services)}
              onChange={event => update('services', event.target.value)} />}
            {errors.services && <span className="sitter-application__error">{errors.services}</span>}
          </div>
          <label className="sitter-application__field">
            <span>Khu vực mong muốn <small>(quận/huyện hoặc địa bàn)</small></span>
            <textarea id="sitter-applicant-areas" rows="3" maxLength="1000" required
              value={form.areas} aria-invalid={Boolean(errors.areas)}
              onChange={event => update('areas', event.target.value)} />
            {errors.areas && <span className="sitter-application__error">{errors.areas}</span>}
          </label>
        </div>

        <fieldset className="sitter-application__files">
          <legend>Giấy tờ ứng tuyển</legend>
          <p>PDF, JPG hoặc PNG; tối đa 5 MB mỗi tệp. Tệp sẽ không được công khai.</p>
          <label className="sitter-application__field">
            <span>Giấy tờ định danh <strong aria-hidden="true">*</strong></span>
            <input id="sitter-applicant-id-file" type="file" accept=".pdf,image/jpeg,image/png" required
              aria-invalid={Boolean(errors.identityFile || errors.files)}
              onChange={event => { setIdentityFile(event.target.files?.[0] ?? null); setUploadedDocuments(null); idempotencyKey.current = null; setErrors(previous => ({ ...previous, identityFile: undefined, files: undefined })); setNotice(null); }} />
            {errors.identityFile && <span className="sitter-application__error">{errors.identityFile}</span>}
          </label>
          <label className="sitter-application__field">
            <span>Chứng chỉ hoặc tài liệu bổ sung <small>(không bắt buộc)</small></span>
            <input type="file" accept=".pdf,image/jpeg,image/png" multiple
              onChange={event => { setSupportingFiles(Array.from(event.target.files ?? [])); setUploadedDocuments(null); idempotencyKey.current = null; setErrors(previous => ({ ...previous, supportingFiles: undefined, files: undefined })); setNotice(null); }} />
            {errors.supportingFiles && <span className="sitter-application__error">{errors.supportingFiles}</span>}
          </label>
          {errors.files && <p className="sitter-application__error" role="alert">{errors.files}</p>}
        </fieldset>

        <Notice state="pending" title="Trạng thái tải giấy tờ">
          Tích hợp kho lưu trữ riêng tư đang chờ hoàn tất. Nếu tệp chưa tải lên được, hồ sơ chưa được gửi.
        </Notice>

        {notice && <Notice state={notice.state} title={notice.title}><p>{notice.message}</p></Notice>}
        <Button type="submit" loading={busy} loadingLabel="Đang gửi hồ sơ…" disabled={apiUnavailable}>
          Gửi hồ sơ ứng tuyển
        </Button>
      </form>
    </div>
  </section>;
}
