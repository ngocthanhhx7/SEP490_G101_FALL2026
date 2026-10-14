import { useRef, useState } from 'react';
import { Button, Input, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import './day-off-request.css';

const SERVICE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function getServiceCalendarDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SERVICE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.toISOString().slice(0, 10) === value;
}

function makeIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Secure idempotency key generation is unavailable');
  }
  return globalThis.crypto.randomUUID();
}

function safeErrorText(error) {
  if (error?.code === 'VERSION_CONFLICT') return 'Lịch đã thay đổi. Tải lại dữ liệu trước khi gửi yêu cầu mới.';
  if (error?.code === 'INVALID_STATE') return 'Khoảng ngày này đã có một yêu cầu đang xử lý.';
  if (error?.status === 403) return 'Tài khoản hiện không có quyền gửi yêu cầu ngày nghỉ.';
  return 'Không thể gửi yêu cầu lúc này. Hãy kiểm tra thông tin và thử lại.';
}

function requestStateLabel(state) {
  if (state === 'PENDING') return 'Chờ nhân viên duyệt';
  if (state === 'APPROVED') return 'Đã duyệt';
  if (state === 'REJECTED') return 'Bị từ chối';
  return 'Đang được xử lý';
}

function isAcknowledgementUncertain(error) {
  return !error?.status || error.status >= 500 || error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR';
}

/**
 * P18 page-level control. The host injects load and submit adapters; this
 * component does not register a route or claim that the P01 API is wired.
 */
export function DayOffRequestPanel({ api, now = new Date(), idempotencyKeyFactory = makeIdempotencyKey }) {
  if (typeof api?.load !== 'function' || typeof api?.submitDayOffRequest !== 'function') {
    throw new TypeError('DayOffRequestPanel requires load and submitDayOffRequest adapters');
  }

  const resource = useApiResource(api.load);
  const today = getServiceCalendarDate(now);
  const [dates, setDates] = useState(() => ({ startDate: today, endDate: today }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [submission, setSubmission] = useState({ status: 'idle' });
  const operation = useRef(null);
  const formRef = useRef(null);
  const loading = submission.status === 'submitting';
  const awaitingAcknowledgement = submission.status === 'awaiting-acknowledgement';
  const freezeForm = loading || awaitingAcknowledgement;

  function changeDate(field, value) {
    setDates(current => ({ ...current, [field]: value }));
    setFieldErrors(current => ({ ...current, [field]: undefined }));
    if (submission.status === 'error') {
      setSubmission({ status: 'idle' });
      operation.current = null;
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (resource.status === 'loading' || resource.status === 'pending' || resource.status === 'forbidden') return;
    const errors = {};
    if (!isCalendarDate(dates.startDate)) errors.startDate = 'Nhập ngày hợp lệ theo định dạng YYYY-MM-DD.';
    else if (dates.startDate < today) errors.startDate = 'Ngày bắt đầu không được ở trong quá khứ theo giờ Việt Nam.';
    if (!isCalendarDate(dates.endDate)) errors.endDate = 'Nhập ngày hợp lệ theo định dạng YYYY-MM-DD.';
    else if (dates.startDate <= dates.endDate && dates.endDate < today) errors.endDate = 'Ngày kết thúc không được ở trong quá khứ theo giờ Việt Nam.';
    if (isCalendarDate(dates.startDate) && isCalendarDate(dates.endDate) && dates.endDate < dates.startDate) {
      errors.endDate = 'Ngày kết thúc phải cùng ngày hoặc sau ngày bắt đầu.';
    }
    const availabilityVersion = resource.data?.expectedVersion;
    if (!Number.isSafeInteger(availabilityVersion) || availabilityVersion < 0) {
      setSubmission({ status: 'error', message: 'Chưa tải được phiên bản lịch hợp lệ. Hãy tải lại lịch.' });
      return;
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setSubmission({ status: 'idle' });
      return;
    }

    const payload = { startDate: dates.startDate, endDate: dates.endDate, expectedVersion: availabilityVersion };
    const signature = JSON.stringify(payload);
    if (!operation.current || operation.current.signature !== signature) {
      try {
        const idempotencyKey = idempotencyKeyFactory();
        if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) throw new Error('Invalid idempotency key');
        operation.current = { signature, idempotencyKey };
      } catch {
        setSubmission({ status: 'error', message: 'Không thể tạo mã an toàn cho yêu cầu. Hãy tải lại trang và thử lại.' });
        return;
      }
    }
    setFieldErrors({});
    setSubmission({ status: 'submitting' });

    try {
      const result = await api.submitDayOffRequest({
        ...payload,
        idempotencyKey: operation.current.idempotencyKey
      });
      if (result?.pending === true) {
        setSubmission({ status: 'awaiting-acknowledgement' });
        return;
      }
      if (!result?.request || result.request.state !== 'PENDING' || typeof result.request.id !== 'string') {
        setSubmission({ status: 'awaiting-acknowledgement' });
        return;
      }
      operation.current = null;
      setSubmission({ status: 'accepted', result });
    } catch (error) {
      if (error?.status === 403) {
        operation.current = null;
        setSubmission({ status: 'forbidden' });
      } else if (isAcknowledgementUncertain(error)) {
        setSubmission({ status: 'awaiting-acknowledgement', error });
      } else {
        operation.current = null;
        setSubmission({ status: 'error', message: safeErrorText(error), code: error?.code });
      }
    }
  }

  const savedRequests = Array.isArray(resource.data?.requests) ? resource.data.requests : [];
  const confirmedRequest = submission.status === 'accepted' ? submission.result.request : null;
  const requests = confirmedRequest && !savedRequests.some(request => request.id === confirmedRequest.id)
    ? [...savedRequests, confirmedRequest]
    : savedRequests;

  if (resource.status === 'loading') {
    return <section className="day-off-request" aria-labelledby="day-off-title">
      <h1 id="day-off-title">Ngày nghỉ của tôi</h1>
      <Notice state="loading" title="Đang tải lịch nghỉ"><p>Đang lấy lịch và các yêu cầu gần đây.</p></Notice>
    </section>;
  }
  if (resource.status === 'pending') {
    return <section className="day-off-request" aria-labelledby="day-off-title">
      <h1 id="day-off-title">Ngày nghỉ của tôi</h1>
      <Notice state="pending" title="Đang chờ xác nhận lịch"><p>Máy chủ chưa xác nhận dữ liệu lịch. Yêu cầu chưa được xem là đã gửi.</p>
        <Button variant="secondary" onClick={resource.retry}>Thử tải lại</Button></Notice>
    </section>;
  }
  if (resource.status === 'forbidden' || submission.status === 'forbidden') {
    return <section className="day-off-request" aria-labelledby="day-off-title">
      <h1 id="day-off-title">Ngày nghỉ của tôi</h1>
      <Notice state="forbidden" title="Không có quyền truy cập"><p>Chỉ Pet Sitter được quản lý yêu cầu ngày nghỉ của chính mình.</p></Notice>
    </section>;
  }
  if (resource.status === 'error') {
    return <section className="day-off-request" aria-labelledby="day-off-title">
      <h1 id="day-off-title">Ngày nghỉ của tôi</h1>
      <Notice state="error" title="Không tải được lịch"><p>Dữ liệu lịch chưa sẵn sàng. Hãy thử tải lại.</p>
        <Button variant="secondary" onClick={resource.retry}>Thử tải lại</Button></Notice>
    </section>;
  }

  const retrySameCommand = () => {
    formRef.current?.requestSubmit();
  };
  const submissionNotice = submission.status === 'awaiting-acknowledgement'
    ? <Notice state="pending" title="Đang xác nhận yêu cầu">
      <p>Chưa có xác nhận từ máy chủ. Nếu gửi lại, hệ thống sẽ kiểm tra cùng một yêu cầu.</p>
      <Button variant="secondary" onClick={retrySameCommand}>Kiểm tra lại cùng yêu cầu</Button>
    </Notice>
    : submission.status === 'accepted'
      ? <div className="day-off-request__accepted" aria-live="polite">
        <Notice state="success" title="Yêu cầu đã được ghi nhận">
          <p>Yêu cầu đang chờ nhân viên duyệt. Lịch hiện có được giữ nguyên cho đến khi có quyết định.</p>
        </Notice>
        {submission.result.conflicts?.count > 0 && <Notice state="warning" title="Có lịch đã xác nhận trùng ngày">
          <p>{submission.result.conflicts.count}{submission.result.conflicts.hasMore ? '+' : ''} lịch đã xác nhận cần nhân viên xử lý. Thông tin khách hàng không hiển thị ở đây.</p>
        </Notice>}
      </div>
      : submission.status === 'error'
        ? <Notice state="error" title="Chưa gửi được yêu cầu"><p>{submission.message || safeErrorText({ code: submission.code })}</p>
          {submission.code === 'VERSION_CONFLICT' && <Button variant="secondary" onClick={resource.retry}>Tải lại lịch</Button>}
        </Notice>
        : null;

  return <section className="day-off-request" aria-labelledby="day-off-title">
    <header className="day-off-request__header">
      <p className="day-off-request__eyebrow">Lịch làm việc</p>
      <h1 id="day-off-title">Ngày nghỉ của tôi</h1>
      <p>Chọn ngày theo lịch Việt Nam. Yêu cầu sẽ chờ nhân viên duyệt và không tự thay đổi lịch đã xác nhận.</p>
    </header>

    {submissionNotice}

    <section className="day-off-request__history" aria-labelledby="day-off-history-title">
      <h2 id="day-off-history-title">Yêu cầu gần đây</h2>
      {requests.length === 0
        ? <Notice state="empty" title="Chưa có yêu cầu ngày nghỉ"><p>Bạn có thể gửi yêu cầu cho ngày sắp tới bên dưới.</p></Notice>
        : <ul className="day-off-request__list">{requests.map(request => <li key={request.id} className="day-off-request__item">
          <div><strong>{request.startDate === request.endDate ? request.startDate : `${request.startDate} đến ${request.endDate}`}</strong>
            <span>{requestStateLabel(request.state)}</span></div>
        </li>)}</ul>}
    </section>

    <form ref={formRef} className="day-off-request__form" onSubmit={submit} noValidate>
      <h2>Gửi yêu cầu ngày nghỉ</h2>
      <p className="day-off-request__hint">Khoảng ngày tính cả ngày bắt đầu và ngày kết thúc.</p>
      <div className="day-off-request__dates">
        <Input label="Ngày bắt đầu" type="date" name="startDate" value={dates.startDate} min={today}
          onChange={event => changeDate('startDate', event.target.value)} error={fieldErrors.startDate}
          disabled={freezeForm || !Number.isSafeInteger(resource.data?.expectedVersion)} required />
        <Input label="Ngày kết thúc" type="date" name="endDate" value={dates.endDate} min={today}
          onChange={event => changeDate('endDate', event.target.value)} error={fieldErrors.endDate}
          disabled={freezeForm || !Number.isSafeInteger(resource.data?.expectedVersion)} required />
      </div>
      <Button type="submit" loading={loading} loadingLabel="Đang gửi yêu cầu…"
        disabled={freezeForm || !Number.isSafeInteger(resource.data?.expectedVersion)}>
        Gửi yêu cầu ngày nghỉ
      </Button>
    </form>
  </section>;
}
