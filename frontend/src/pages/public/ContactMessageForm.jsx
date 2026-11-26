import { useId, useRef, useState } from 'react';
import { Button, Input, Select } from '../../components/ui/index.js';
import { PolicyContextLinks } from './policies/PolicyLinks.jsx';

const messageLimit = 3000;
const empty = { name: '', phone: '', email: '', topic: 'BOOKING', message: '', consent: false };
const requiredErrors = {
  name: 'Nhập họ và tên của bạn.',
  email: 'Nhập email để Paw World Care có thể phản hồi.',
  message: 'Nhập nội dung bạn cần hỗ trợ.',
  consent: 'Đồng ý với việc sử dụng thông tin để gửi lời nhắn.',
};
const shortErrors = {
  name: 'Họ và tên cần ít nhất 2 ký tự.',
  message: 'Nội dung cần ít nhất 10 ký tự.',
};

function browserError(control) {
  const { name, validity } = control;
  if (validity.valueMissing) return requiredErrors[name];
  if (validity.typeMismatch) return 'Nhập địa chỉ email hợp lệ.';
  if (validity.tooShort) return shortErrors[name];
  if (validity.tooLong) return 'Nội dung tối đa 3.000 ký tự.';
  return control.validationMessage;
}

export function useContactMessageForm(send) {
  const sending = useRef(false);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const busy = status?.kind === 'loading';

  function change({ target }) {
    const { name, type, checked, value } = target;
    setForm(previous => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors(previous => ({ ...previous, [name]: undefined }));
    if (status?.kind === 'success') setStatus(null);
  }

  function invalid(event) {
    event.preventDefault();
    const control = event.target;
    setErrors(previous => ({ ...previous, [control.name]: browserError(control) }));
    setStatus(null);
    if (control === event.currentTarget.querySelector('input:invalid, select:invalid, textarea:invalid')) control.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (sending.current) return;
    const payload = { ...form, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), message: form.message.trim() };
    const fieldErrors = {};
    if (payload.name.length < 2) fieldErrors.name = shortErrors.name;
    if (payload.phone && !/^[+0-9 ()-]{8,20}$/.test(payload.phone)) fieldErrors.phone = 'Kiểm tra lại số điện thoại.';
    if (payload.message.length < 10) fieldErrors.message = shortErrors.message;
    const firstError = Object.keys(fieldErrors)[0];
    setErrors(fieldErrors);
    if (firstError) {
      setStatus(null);
      event.currentTarget.elements.namedItem(firstError)?.focus();
      return;
    }

    sending.current = true;
    setStatus({ kind: 'loading', text: 'Đang gửi lời nhắn…' });
    try {
      await send(payload);
      setForm(empty);
      setStatus({ kind: 'success', text: 'Máy chủ email đã tiếp nhận lời nhắn. Cảm ơn bạn đã liên hệ Paw World Care.' });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error?.code === 'CONTACT_DELIVERY_UNCERTAIN'
          ? 'Chưa xác nhận được kết quả gửi. Thư có thể đã được tiếp nhận. Vui lòng kiểm tra trước khi gửi lại.'
          : error?.status === 429 ? 'Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau.'
            : error?.status === 422 ? 'Kiểm tra lại thông tin liên hệ và nội dung lời nhắn.'
              : 'Chưa thể gửi email. Nội dung của bạn vẫn còn trong biểu mẫu. Vui lòng thử lại sau.',
      });
    } finally {
      sending.current = false;
    }
  }

  return { form, errors, status, busy, change, invalid, submit };
}

export function ContactMessageForm({ form, errors, status, busy, change, invalid, submit, topics, compact }) {
  const id = useId();
  const errorFor = name => errors[name] && <span role="alert">{errors[name]}</span>;
  return <form className="pwc-contact-form" aria-label="Gửi lời nhắn" onInvalid={invalid} onSubmit={submit}>
    {compact && <p className="pwc-contact-hint">Để bảo vệ thông tin của bạn, vui lòng tránh gửi mật khẩu, mã OTP, thông tin thẻ hoặc dữ liệu nhạy cảm.</p>}
    <fieldset className="pwc-contact-fields" disabled={busy}>
      <div className="pwc-contact-form-pair">
        <Input name="name" label="Họ và tên" autoComplete="name" placeholder="Tên của bạn"
          required minLength={2} maxLength={80} value={form.name} onChange={change} error={errorFor('name')} />
        <Input name="email" label="Email phản hồi" type="email" autoComplete="email" placeholder="ban@email.com"
          required maxLength={254} value={form.email} onChange={change} error={errorFor('email')} />
      </div>
      <Input name="phone" label="Số điện thoại (không bắt buộc)" type="tel" autoComplete="tel"
        maxLength={20} value={form.phone} onChange={change} error={errorFor('phone')} />
      <Select name="topic" label="Chủ đề" value={form.topic} onChange={change}>
        {topics.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
        <option value="OTHER">Liên hệ khác</option>
      </Select>
      <div className="pwc-field">
        <label className="pwc-label" htmlFor={id + '-message'}>Nội dung <span aria-hidden="true">*</span></label>
        <textarea id={id + '-message'} className="pwc-control" name="message" rows={5} required minLength={10}
          maxLength={messageLimit} value={form.message} onChange={change} placeholder="Bạn cần hỗ trợ điều gì?"
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={[id + '-message-hint', errors.message && id + '-message-error'].filter(Boolean).join(' ')} />
        <div className="pwc-contact-message-meta">
          <span id={id + '-message-hint'}>Từ 10 đến 3.000 ký tự</span>
          <span><span className="pwc-visually-hidden">Số ký tự đã nhập </span>{form.message.length.toLocaleString('vi-VN')} / 3.000</span>
        </div>
        {errors.message && <p id={id + '-message-error'} className="pwc-field-error" role="alert">{errors.message}</p>}
      </div>
      <div className="pwc-contact-permission">
        <label className="pwc-contact-consent">
          <input name="consent" type="checkbox" required checked={form.consent} onChange={change}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? id + '-consent-error' : undefined} />
          <span>Tôi đồng ý để Paw World Care sử dụng thông tin đã cung cấp để phản hồi lời nhắn.</span>
        </label>
        <PolicyContextLinks context="contact" />
        {errors.consent && <p id={id + '-consent-error'} className="pwc-field-error" role="alert">{errors.consent}</p>}
      </div>
    </fieldset>
    <Button type="submit" className="pwc-contact-send" loading={busy} loadingLabel="Đang gửi…">Gửi lời nhắn</Button>
    {status && <p className={`pwc-contact-status pwc-contact-status--${status.kind}`}
      role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
  </form>;
}
