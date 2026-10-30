import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { Button, Notice } from '../../components/ui/index.js';
import { ApiError } from '../../services/api-client.js';
import { sitterApplicationApi } from '../../services/sitter-application-api.js';
import './sitter-application.css';
import { useApiResource } from '../../hooks/useApiResource.js';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import { useRegistrationPolicies } from '../../contexts/PublicPolicyContext.jsx';
import { PolicyContextLinks } from './policies/PolicyLinks.jsx';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SUPPORTING_FILES = 5;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png']);

function lines(value) {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function errorMessage(error) {
  if (error?.code === 'POLICY_NOT_AVAILABLE') return 'Chính sách đăng ký đã thay đổi hoặc chưa có hiệu lực. Vui lòng tải lại trang và xác nhận chính sách hiện hành.';
  if (error?.code === 'UNAUTHENTICATED' || error?.code === 'CSRF_UNAVAILABLE') return 'Phiên đăng nhập cần được xác nhận lại. Vui lòng đăng nhập rồi mở lại hồ sơ.';
  if (error?.code === 'MEDIA_QUOTA_EXCEEDED') return 'Tài khoản đã đạt giới hạn lưu trữ 20 ảnh. Vui lòng liên hệ PawWorld để được hỗ trợ.';
  if (error?.code === 'INVALID_DOCUMENT') return 'Chọn ảnh JPG hoặc PNG hợp lệ, tối đa 5 MB.';
  if (error?.code === 'PROVIDER_UNAVAILABLE')
    return 'Chưa thể tải giấy tờ lên kho riêng tư. Hồ sơ chưa được gửi; vui lòng thử lại sau.';
  if (error?.code === 'AGE_REQUIREMENT_NOT_MET')
    return 'Ứng viên cần đủ 18 tuổi tại thời điểm nộp hồ sơ.';
  if (
    error?.code === 'APPLICATION_ALREADY_PENDING' ||
    error?.code === 'REAPPLY_NOT_AVAILABLE'
  ) {
    return 'Không thể tiếp nhận hồ sơ này lúc này. Vui lòng liên hệ Paw World Care để được hỗ trợ.';
  }
  if (error?.code === 'VALIDATION_FAILED')
    return 'Một số thông tin chưa hợp lệ. Hãy kiểm tra lại các trường bắt buộc.';
  if (error?.code === 'FORBIDDEN')
    return 'Yêu cầu không được chấp nhận. Hãy tải lại trang rồi thử lại.';
  if (error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT') {
    return 'Chưa nhận được phản hồi từ máy chủ. Đừng gửi hồ sơ mới; hãy thử lại với cùng thông tin để đối soát kết quả.';
  }
  return 'Chưa thể gửi hồ sơ. Vui lòng thử lại sau.';
}

function validate({
  displayName,
  contactChannel,
  contactValue,
  dateOfBirth,
  identityNumber,
  experience,
  services,
  areas,
  identityFile,
  supportingFiles
}) {
  const errors = {};
  if (!displayName.trim()) errors.displayName = 'Nhập họ và tên.';
  else if (displayName.trim().length > 100)
    errors.displayName = 'Tối đa 100 ký tự.';
  if (!contactValue.trim())
    errors.contactValue = 'Nhập email hoặc số điện thoại.';
  else if (
    contactChannel === 'EMAIL' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue.trim())
  )
    errors.contactValue = 'Email chưa đúng định dạng.';
  else if (
    contactChannel === 'PHONE' &&
    !/^\+[1-9]\d{7,14}$/.test(contactValue.trim())
  )
    errors.contactValue =
      'Dùng số điện thoại dạng quốc tế, ví dụ +84912345678.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth))
    errors.dateOfBirth = 'Chọn ngày sinh hợp lệ.';
  if (!/^[A-Z0-9]{8,20}$/.test(identityNumber.normalize('NFKC').replace(/[\s-]/g, '').toUpperCase()))
    errors.identityNumber = 'Nhập số CCCD hoặc giấy tờ định danh.';
  if (experience.trim().length < 10)
    errors.experience = 'Mô tả ít nhất 10 ký tự về kinh nghiệm chăm sóc.';
  if (!lines(services).length)
    errors.services = 'Nhập ít nhất một dịch vụ mong muốn.';
  if (!lines(areas).length)
    errors.areas = 'Nhập ít nhất một khu vực mong muốn.';
  if (!identityFile)
    errors.identityFile = 'Chọn ảnh giấy tờ định danh.';
  const files = [identityFile, ...supportingFiles].filter(Boolean);
  if (supportingFiles.length > MAX_SUPPORTING_FILES)
    errors.supportingFiles = `Tối đa ${MAX_SUPPORTING_FILES} giấy tờ bổ sung.`;
  if (
    files.some(
      (file) =>
        !ACCEPTED_TYPES.has(file.type) ||
        file.size <= 0 ||
        file.size > MAX_FILE_BYTES
    )
  ) {
    errors.files = 'Mỗi tệp phải là JPG hoặc PNG và không quá 5 MB.';
  }
  return errors;
}

export function SitterApplicationPage({
  api = sitterApplicationApi,
  initialValues, uploadsAvailable = api.uploadsAvailable, previousApplication
}) {
  const policies = useRegistrationPolicies();
  const [agreementKey, setAgreementKey] = useState('');
  const catalog = useApiResource(loadPublicCatalog);
  const [form, setForm] = useState({
    displayName: '',
    contactChannel: 'EMAIL',
    contactValue: '',
    dateOfBirth: '',
    identityNumber: '',
    experience: '',
    services: '',
    areas: '',
    ...initialValues
  });
  const [identityFile, setIdentityFile] = useState(null);
  const [supportingFiles, setSupportingFiles] = useState([]);
  const [uploadedDocuments, setUploadedDocuments] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(previousApplication ?? false);
  const idempotencyKey = useRef(null);

  function update(field, value) {
    idempotencyKey.current = null;
    setUploadedDocuments(null);
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({
      ...previous,
      [field]: undefined,
      files: undefined
    }));
    setNotice(null);
  }

  function focusFirst(nextErrors) {
    const ids = {
      displayName: 'sitter-applicant-displayName',
      contactValue: 'sitter-applicant-contactValue',
      dateOfBirth: 'sitter-applicant-dateOfBirth',
      identityNumber: 'sitter-applicant-identityNumber',
      experience: 'sitter-applicant-experience',
      services: 'sitter-applicant-services',
      areas: 'sitter-applicant-areas',
      identityFile: 'sitter-applicant-id-file'
    };
    const first = Object.keys(ids).find((field) => nextErrors[field]);
    if (first) document.getElementById(ids[first])?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const nextErrors = validate({
      ...form,
      services: form.services,
      areas: form.areas,
      identityFile,
      supportingFiles
    });
    if (!policies.current().ready || agreementKey !== policies.current().key) nextErrors.agreement = 'Bạn cần đồng ý với các chính sách đang có hiệu lực.';
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
        const files = [
          { file: identityFile, documentType: 'IDENTITY' },
          ...supportingFiles.map((file) => ({
            file,
            documentType: 'CERTIFICATE'
          }))
        ];
        documents = [];
        for (const item of files) {
          const uploaded = await api.uploadDocument(item.file, {
            documentType: item.documentType
          });
          if (
            !uploaded ||
            typeof uploaded.documentId !== 'string' ||
            typeof uploaded.storageRef !== 'string'
          ) {
            throw new ApiError('INVALID_RESPONSE');
          }
          documents.push({ ...uploaded, documentType: item.documentType });
        }
        setUploadedDocuments(documents);
      }
      if (!idempotencyKey.current)
        idempotencyKey.current = api.createIdempotencyKey?.();
      const result = await api.submit(
        {
          displayName: form.displayName.trim(),
          contactChannel: form.contactChannel,
          contactValue: form.contactValue.trim(),
          dateOfBirth: form.dateOfBirth,
          identityNumber: form.identityNumber.trim(),
          experience: form.experience.trim(),
          requestedServices: lines(form.services),
          workAreas: lines(form.areas),
          documents,
          policyVersions: policies.current().versions
        },
        { key: idempotencyKey.current }
      );
      setReceipt(result);
      setForm({
        displayName: '',
        contactChannel: 'EMAIL',
        contactValue: '',
        dateOfBirth: '',
        identityNumber: '',
        experience: '',
        services: '',
        areas: ''
      });
      setIdentityFile(null);
      setSupportingFiles([]);
      setUploadedDocuments(null);
      idempotencyKey.current = null;
    } catch (error) {
      const message = errorMessage(error);
      setNotice({
        state: error?.status === 403 ? 'forbidden' : 'error',
        title: 'Chưa gửi được hồ sơ',
        message
      });
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    const labels = { PENDING: 'Đã tiếp nhận hồ sơ', UNDER_REVIEW: 'Hồ sơ đang được xét duyệt', INTERVIEW: 'Đang ở bước phỏng vấn', APPROVED: 'Hồ sơ đã được duyệt', REJECTED: 'Hồ sơ chưa được duyệt' };
    return <section className="sitter-application" aria-labelledby="sitter-application-receipt-title">
      <div className="sitter-application__card sitter-application__receipt">
        <span className="sitter-application__success-icon" aria-hidden="true">✓</span>
        <p className="sitter-application__eyebrow">PawWorld · Hồ sơ của bạn</p>
        <h2 id="sitter-application-receipt-title">{labels[receipt.state] || 'Đã tiếp nhận hồ sơ'}</h2>
        <p>Hồ sơ chỉ được cấp quyền Pet Sitter sau khi PawWorld xét duyệt. Bạn vẫn có thể sử dụng tài khoản khách hàng trong thời gian chờ.</p>
        {receipt.reapplyAt && <p>Có thể nộp lại từ {new Date(receipt.reapplyAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</p>}
        <div className="sitter-application__tracking">
          <span>Mã hồ sơ của bạn</span><strong>{receipt.applicationCode}</strong>
          <small>Giữ mã này để tra cứu cùng OTP gửi tới email đã xác minh. Bạn cũng có thể mở lại trang ứng tuyển để xem mã.</small>
        </div>
        <Link className="registration-submit" to="/sitter/application-status">Theo dõi hồ sơ →</Link>
        <Link to="/account">Về tài khoản của tôi</Link>
      </div>
    </section>;
  }

  const apiUnavailable = !api?.uploadDocument || uploadsAvailable === false;
  function field(name, label, options = {}) {
    return <label className="sitter-application__field" htmlFor={`sitter-applicant-${name}`}>
      <span>{label} <b aria-hidden="true">*</b></span>
      <input id={`sitter-applicant-${name}`} autoComplete="off" required {...options} value={form[name]}
        aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `sitter-error-${name}` : undefined}
        onChange={event => update(name, event.target.value)} />
      {errors[name] && <small className="sitter-application__error" id={`sitter-error-${name}`}>{errors[name]}</small>}
    </label>;
  }
  return <section className="sitter-application" aria-labelledby="sitter-application-title">
    <div className="sitter-application__card">
      <header className="sitter-application__header">
        <p className="sitter-application__eyebrow">PawWorld · Pet Sitter</p>
        <h2 id="sitter-application-title">Kể chúng mình nghe về bạn</h2>
        <p>Hoàn thiện hồ sơ để bắt đầu hành trình chăm sóc những người bạn nhỏ.</p>
        <span className="sitter-application__verified">✓ Email đã xác minh · {form.contactValue}</span>
      </header>
      {apiUnavailable && <Notice state="pending" title="Chưa mở tiếp nhận giấy tờ">Kho giấy tờ riêng tư hiện chưa sẵn sàng. Bạn có thể chuẩn bị thông tin; hồ sơ chỉ được gửi khi hệ thống tiếp nhận hoạt động.</Notice>}
      <form className="sitter-application__form" noValidate onSubmit={submit}>
        <fieldset className="sitter-application__body" disabled={busy}>
          <legend className="pwc-visually-hidden">Thông tin ứng tuyển</legend>
          <div className="sitter-application__section-heading"><span>01</span><h3>Thông tin cá nhân</h3><small>Cần đủ 18 tuổi để ứng tuyển</small></div>
          <div className="sitter-application__grid">
            {field('displayName', 'Họ và tên', { autoComplete: 'name', maxLength: 100, placeholder: 'Nguyễn Văn A' })}
            {field('contactValue', 'Email', { type: 'email', readOnly: true, autoComplete: 'email' })}
            {field('dateOfBirth', 'Ngày sinh', { type: 'date', autoComplete: 'bday' })}
            {field('identityNumber', 'Số CCCD hoặc giấy tờ định danh', { maxLength: 24, placeholder: 'Nhập số trên giấy tờ của bạn' })}
          </div>
          <div className="sitter-application__section-heading"><span>02</span><h3>Công việc mong muốn</h3></div>
          <fieldset className="sitter-application__services" id="sitter-applicant-services" tabIndex={-1}>
            <legend>Nhóm dịch vụ có thể làm việc <b aria-hidden="true">*</b></legend>
            {catalog.data?.available && catalog.data.services.length ? <div className="sitter-application__service-choices">
              {catalog.data.services.map(service => <label key={service.id} className={lines(form.services).includes(service.name) ? 'is-selected' : ''}>
                <input type="checkbox" checked={lines(form.services).includes(service.name)} onChange={event => update('services',
                  (event.target.checked ? [...lines(form.services), service.name] : lines(form.services).filter(name => name !== service.name)).join('\n'))} />
                <span>{service.name}</span>
              </label>)}
            </div> : <label className="sitter-application__field"><span>Dịch vụ mong muốn (mỗi dòng một mục)</span>
              <textarea rows={2} maxLength={800} value={form.services} onChange={event => update('services', event.target.value)} placeholder="Nhập dịch vụ chăm sóc thú cưng bạn có thể thực hiện" />
            </label>}
            {errors.services && <p className="sitter-application__error">{errors.services}</p>}
          </fieldset>
          <div className="sitter-application__grid">
            <label className="sitter-application__field"><span>Thành phố</span><input value="Hà Nội" readOnly /><small>Khu vực phục vụ hiện tại của PawWorld</small></label>
            <label className="sitter-application__field"><span>Khu vực mong muốn <b aria-hidden="true">*</b></span>
              <textarea id="sitter-applicant-areas" rows={2} maxLength={800} required value={form.areas} placeholder="Nhập phường/xã bạn muốn làm việc, mỗi dòng một khu vực"
                aria-invalid={!!errors.areas} onChange={event => update('areas', event.target.value)} />
              {errors.areas && <small className="sitter-application__error">{errors.areas}</small>}
            </label>
          </div>
          <label className="sitter-application__field"><span>Kinh nghiệm chăm sóc thú cưng <b aria-hidden="true">*</b></span>
            <textarea id="sitter-applicant-experience" rows={4} minLength={10} maxLength={2000} required value={form.experience}
              placeholder="Bạn đã từng chăm sóc chó, mèo như thế nào? Chia sẻ kinh nghiệm và những điều bạn tự tin nhất."
              aria-invalid={!!errors.experience} onChange={event => update('experience', event.target.value)} />
            <small className="sitter-application__counter">Tối thiểu 10 ký tự · {form.experience.length}/2000</small>
            {errors.experience && <small className="sitter-application__error">{errors.experience}</small>}
          </label>
          <div className="sitter-application__section-heading"><span>03</span><h3>Giấy tờ ứng tuyển</h3></div>
          <p className="sitter-application__file-hint">Ảnh JPG hoặc PNG, tối đa 5 MB/tệp, tối đa 20 ảnh/tài khoản. Giấy tờ được lưu riêng tư, chỉ bạn và người xét duyệt có quyền xem.</p>
          <label className="sitter-application__upload"><span>Ảnh giấy tờ định danh <b aria-hidden="true">*</b></span>
            <small>Ảnh rõ nét, đầy đủ thông tin trên giấy tờ</small>
            <input id="sitter-applicant-id-file" type="file" accept="image/jpeg,image/png" required aria-invalid={!!(errors.identityFile || errors.files)}
              onChange={event => { setIdentityFile(event.target.files?.[0] ?? null); setUploadedDocuments(null); idempotencyKey.current = null; setErrors({}); setNotice(null); }} />
            {errors.identityFile && <small className="sitter-application__error">{errors.identityFile}</small>}
          </label>
          <label className="sitter-application__upload"><span>Ảnh chứng chỉ hoặc tài liệu bổ sung <small>(không bắt buộc)</small></span>
            <small>Tối đa 5 ảnh bổ sung về kinh nghiệm hoặc chứng chỉ của bạn</small>
            <input type="file" accept="image/jpeg,image/png" multiple
              onChange={event => { setSupportingFiles(Array.from(event.target.files ?? [])); setUploadedDocuments(null); idempotencyKey.current = null; setErrors({}); setNotice(null); }} />
            {supportingFiles.length > 0 && <small>Đã chọn {supportingFiles.length} ảnh</small>}
          </label>
          {(errors.files || errors.supportingFiles) && <p className="sitter-application__error" role="alert">{errors.files || errors.supportingFiles}</p>}
          <div className="registration-consent">
            <input id="sitter-agreement" type="checkbox" checked={agreementKey === policies.key && policies.ready} disabled={!policies.ready}
              onChange={event => { setAgreementKey(event.target.checked ? policies.current().key : ''); setErrors(previous => ({ ...previous, agreement: undefined })); }} />
            <label htmlFor="sitter-agreement">Tôi đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư của PawWorld.</label>
            <PolicyContextLinks context="sitterApplication" />
            {!policies.ready && <p role="status">Chính sách đăng ký hiện chưa sẵn sàng. Vui lòng thử lại sau.</p>}
            {errors.agreement && <p className="sitter-application__error" role="alert">{errors.agreement}</p>}
          </div>
        </fieldset>
        {notice && <Notice state={notice.state} title={notice.title}>{notice.message}</Notice>}
        <Button className="sitter-application__submit" type="submit" loading={busy} loadingLabel="Đang gửi hồ sơ…" disabled={apiUnavailable || !policies.ready}>Gửi hồ sơ ứng tuyển →</Button>
        <p className="sitter-application__review-hint">PawWorld sẽ kiểm tra hồ sơ và liên hệ với bạn về bước tiếp theo.</p>
      </form>
    </div>
  </section>;
}
