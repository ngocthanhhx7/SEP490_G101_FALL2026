import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import { primaryRole } from '../../utils/role-access.js';
import { PolicyContextLinks } from './policies/PolicyLinks.jsx';
import { Button, Dialog } from '../../components/ui/index.js';
import { usePhoneApp } from '../../hooks/usePhoneApp.js';
import { sendContactMessage } from '../../services/contact-api.js';
import './contact.css';

function HelpPrivacyLink() {
  const { search } = useLocation();
  return <Link to="/policies/privacy" state={{ policyFrom: '/contact' + search }}>chính sách bảo mật</Link>;
}

const privacyQuestion = { topic: 'POLICY', question: 'Thông tin cá nhân của tôi được xử lý thế nào?', answer: <>Tham khảo <HelpPrivacyLink />. Trong form liên hệ, chỉ cung cấp thông tin cần thiết; không gửi mật khẩu, mã OTP hoặc thông tin thanh toán.</> };
const questions = [
  { topic: 'BOOKING', question: 'Làm thế nào để đặt lịch chăm sóc cho bé?', answer: <>Đăng nhập hoặc đăng ký tài khoản, xem <Link to="/services">danh mục dịch vụ</Link> và kiểm tra khu vực phục vụ trước khi chọn lịch. Thông tin hồ sơ thú cưng và lời dặn giúp người chăm sóc chuẩn bị cho bé.</> },
  { topic: 'SERVICE', question: 'Paw World Care hỗ trợ chó hay mèo?', answer: <>Dự án tập trung chăm sóc chó, mèo tại nhà. Đối tượng áp dụng, phạm vi và giá của từng dịch vụ được hiển thị trong <Link to="/services">danh mục đang công bố</Link>.</> },
  { topic: 'SERVICE', question: 'Làm sao kiểm tra địa chỉ của tôi có được phục vụ?', answer: <>Xem <Link to="/service-areas">khu vực phục vụ</Link> hiện hành. Nếu chưa thấy khu vực của mình, bạn có thể gửi câu hỏi bằng form bên dưới; yêu cầu liên hệ không phải xác nhận đặt lịch.</> },
  { topic: 'BOOKING', question: 'Tôi theo dõi lượt chăm sóc của bé như thế nào?', answer: <>Theo dõi trạng thái lượt chăm sóc trong tài khoản và xem báo cáo gồm checklist, ảnh cùng ghi chú khi được cập nhật. Liên hệ hỗ trợ nếu cần làm rõ thông tin của một lượt chăm sóc.</> },
  { topic: 'POLICY', question: 'Tôi muốn đổi giờ, hủy lịch hoặc hỏi về hoàn tiền', keywords: 'đổi lịch hủy dịch vụ hoàn tiền payOS', answer: <>Mở <Link to="/account/bookings">Lịch hẹn</Link>, chọn đơn và xem mục Thay đổi lịch hẹn để biết buổi nào có thể gửi yêu cầu đổi giờ. Giờ hiện tại được giữ cho đến khi yêu cầu được duyệt. Nếu cần hỏi về hủy hoặc hoàn tiền, hãy dùng Gửi lời nhắn. Lời nhắn chỉ dùng để liên hệ hỗ trợ.</> },
  privacyQuestion,
  { topic: 'POLICY', question: 'Tôi cần hỗ trợ về đơn mua hàng', keywords: 'sản phẩm giỏ hàng đơn mua thanh toán giao hàng', answer: <>Mở <Link to="/customer/product-orders">Đơn mua hàng</Link> để kiểm tra trạng thái. Nếu cần đội ngũ xem lại, hãy gửi lời nhắn kèm mã đơn và thông tin cần làm rõ.</> },
  { topic: 'BOOKING', question: 'Tôi muốn phản ánh về buổi chăm sóc đã kết thúc', keywords: 'khiếu nại báo cáo hình ảnh sự cố', answer: <>Mở <Link to="/account/bookings">Lịch hẹn</Link>, chọn lịch liên quan và dùng mục khiếu nại nếu lịch đủ điều kiện. Đính kèm thông tin về buổi chăm sóc để đội ngũ kiểm tra.</> },
];
const sitterQuestions = [
  { topic: 'BOOKING', question: 'Tôi xem và phản hồi lời mời nhận ca ở đâu?', keywords: 'lời mời nhận việc bàn giao', answer: <>Mở <Link to="/sitter/invitations">Lời mời</Link> để xem chi tiết trước khi phản hồi. Xem các buổi đã được giao trong <Link to="/sitter/schedule">Ca làm</Link>.</> },
  { topic: 'SERVICE', question: 'Tôi gặp khó khăn khi thực hiện ca hoặc tải ảnh', keywords: 'quy trình camera upload checklist ảnh minh chứng', answer: <>Mở buổi liên quan trong <Link to="/sitter/schedule">Ca làm</Link> để xem các bước và ảnh bắt buộc. Kiểm tra quyền camera hoặc thư viện ảnh và kết nối trước khi thử lại.</> },
  { topic: 'SERVICE', question: 'Tôi cần báo sự cố trong buổi chăm sóc', keywords: 'sự cố an toàn không thể đến bàn giao rút khỏi buổi', answer: <>Mở buổi liên quan từ <Link to="/sitter/schedule">Ca làm</Link> và dùng báo sự cố khi thao tác này khả dụng để báo cáo được gắn với buổi.</> },
  { topic: 'POLICY', question: 'Tôi xem hồ sơ và thu nhập ở đâu?', keywords: 'bảng lương hồ sơ tài khoản', answer: <>Mở <Link to="/account">Tài khoản</Link> để tìm thông tin hồ sơ hoặc vào <Link to="/sitter/payroll">Thu nhập</Link> để xem thông tin đang hiển thị.</> },
  privacyQuestion,
];
const topics = [['BOOKING', 'Hướng dẫn đặt lịch'], ['SERVICE', 'Dịch vụ & khu vực'], ['POLICY', 'Chính sách & hỗ trợ']];
const empty = { name: '', phone: '', email: '', topic: 'BOOKING', message: '', consent: false };
function normalize(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase(); }

export function ContactPage({ send = sendContactMessage }) {
  const compact = usePhoneApp();
  const { user } = useSession({ optional: true });
  const sitter = primaryRole(user) === 'PET_SITTER';
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('topic') ?? '';
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const filtered = useMemo(() => (sitter ? sitterQuestions : questions).filter(item => (!category || item.topic === category)
    && normalize([item.question, item.keywords, topics.find(([key]) => key === item.topic)?.[1]].filter(Boolean).join(' ')).includes(normalize(query.trim()))), [category, query, sitter]);
  function filter(q, topic) {
    const next = new globalThis.URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    if (topic) next.set('topic', topic);
    else next.delete('topic');
    setParams(next, { replace: true, state, preventScrollReset: true });
  }
  function change(event) { setForm(previous => ({ ...previous, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })); }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const payload = { ...form, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), message: form.message.trim() };
    const fieldError = payload.name.length < 2 ? ['name', 'Họ và tên cần ít nhất 2 ký tự.']
      : payload.phone && !/^[+0-9 ()-]{8,20}$/.test(payload.phone) ? ['phone', 'Kiểm tra lại số điện thoại.']
        : payload.message.length < 10 ? ['message', 'Nội dung cần ít nhất 10 ký tự.'] : null;
    if (fieldError) {
      const [field, message] = fieldError;
      setFailed(true);
      setNotice(message);
      event.currentTarget.elements.namedItem(field)?.focus();
      return;
    }
    setBusy(true); setNotice(''); setFailed(false);
    try {
      await send(payload);
      setNotice('Máy chủ email đã tiếp nhận lời nhắn. Cảm ơn bạn đã liên hệ Paw World Care.');
      setForm(empty);
    } catch (error) {
      setFailed(true);
      setNotice(error?.code === 'CONTACT_DELIVERY_UNCERTAIN'
        ? 'Chưa xác nhận được kết quả gửi. Thư có thể đã được tiếp nhận; vui lòng kiểm tra trước khi gửi lại.'
        : error?.status === 429 ? 'Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau.'
          : error?.status === 422 ? 'Kiểm tra lại thông tin liên hệ và nội dung lời nhắn.'
            : 'Chưa thể gửi email. Vui lòng thử lại sau; nội dung của bạn vẫn được giữ trong form.');
    } finally { setBusy(false); }
  }
  const messageForm = <form onSubmit={submit} className="pwc-contact-form" aria-label="Gửi lời nhắn">
    {!compact && <><p className="pwc-contact-eyebrow">ĐỂ LẠI LỜI NHẮN</p>
      <h2>Chúng mình có thể<br />giúp gì cho bạn?</h2></>}
    <label>Họ và tên<input name="name" autoComplete="name" placeholder="Tên của bạn" required minLength={2} maxLength={80} value={form.name} onChange={change} /></label>
    <div className="pwc-contact-form-pair"><label>Số điện thoại (không bắt buộc)<input name="phone" type="tel" autoComplete="tel" maxLength={20} placeholder="Số điện thoại liên hệ" value={form.phone} onChange={change} /></label>
    <label>Email phản hồi<input name="email" type="email" autoComplete="email" placeholder="ban@email.com" required maxLength={254} value={form.email} onChange={change} /></label></div>
    <label>Chủ đề<select name="topic" value={form.topic} onChange={change}>{topics.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="OTHER">Liên hệ khác</option></select></label>
    <label>Nội dung<textarea name="message" rows={6} required minLength={10} maxLength={3000} value={form.message} onChange={change} placeholder="Bạn cần chúng mình hỗ trợ điều gì?" /></label>
    <p className="pwc-contact-form-hint">Từ 10 đến 3.000 ký tự. Vui lòng không gửi lại trong khi đang xử lý.</p>
    <label className="pwc-contact-consent"><input name="consent" type="checkbox" required checked={form.consent} onChange={change} />
      <span>Tôi đồng ý để Paw World Care sử dụng thông tin đã cung cấp nhằm liên hệ và phản hồi yêu cầu này.</span></label>
    <PolicyContextLinks context="contact" />
    <button className="pwc-design-button" type="submit" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi lời nhắn'}</button>
    <p className="pwc-contact-form-hint">Yêu cầu chỉ được báo tiếp nhận khi máy chủ email xác nhận. Thông tin không được lưu trong trình duyệt.</p>
    {notice && <p role={failed ? 'alert' : 'status'}>{notice}</p>}
  </form>;
  return <div className={compact ? "pwc-contact-page pwc-contact-page--compact" : "pwc-contact-page"}>
    <section className="pwc-contact-hero" aria-labelledby="pwc-contact-heading">
      {!compact && <img src="/assets/figma-public/home-Frame2147225474.svg" alt="" />}
      <h1 id="pwc-contact-heading">{compact ? "Bạn cần hỗ trợ việc gì?" : <>Chúng mình có thể<br />giúp gì cho bạn?</>}</h1>
      {!compact && <p>Tìm hướng dẫn chăm sóc, đặt lịch và hỗ trợ từ Paw World Care.</p>}
      <label className="pwc-contact-search"><span className="pwc-visually-hidden">Tìm câu hỏi hỗ trợ</span>
        <input type="search" maxLength={120} placeholder="Tìm câu hỏi…" value={query} onChange={event => filter(event.target.value, category)} />
      </label>
      {compact && <div className="pwc-contact-entry">
        <Link to={sitter ? "/sitter/schedule" : "/account/bookings"}>{sitter ? "Xem ca làm" : "Về lịch hẹn"}</Link>
        {!sitter && <Link to="/customer/product-orders">Về đơn mua hàng</Link>}
        <Button onClick={() => setOpen(true)}>Viết lời nhắn</Button>
      </div>}
    </section>
    <section className="pwc-contact-help" aria-labelledby="pwc-contact-help-title">
      <h2 id="pwc-contact-help-title">Danh mục hỗ trợ</h2>
      <div className="pwc-contact-categories">{topics.map(([key, label], i) => <button type="button" key={key} aria-pressed={category === key}
        onClick={() => filter(query, category === key ? '' : key)}>
        <h3>{sitter ? ['Lời mời', 'Ca làm & sự cố', 'Hồ sơ & hỗ trợ'][i] : label}</h3>
        {!sitter && <p>{['Các bước chuẩn bị và lựa chọn lượt chăm sóc phù hợp cho bé.', 'Thông tin chăm sóc chó, mèo và phạm vi phục vụ hiện hành.', 'Thanh toán, hủy lịch, hoàn tiền và bảo mật thông tin.'][i]}</p>}
      </button>)}</div>
      <div className="pwc-contact-faq"><h2>Câu hỏi thường gặp</h2>
        {filtered.length ? filtered.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)
          : <p role="status">Chưa tìm thấy câu hỏi phù hợp. Bạn có thể gửi lời nhắn bên dưới.</p>}
        {(query || category) && <button type="button" className="pwc-text-button" onClick={() => filter('', '')}>Xem tất cả câu hỏi</button>}
      </div>
    </section>
    <section className="pwc-contact-message" id="send-message" aria-label="Gửi lời nhắn">
      {!compact && <div className="pwc-contact-message-intro"><img src="/assets/figma-public/home-Image662.webp" alt="Chú mèo trắng của PawWorld" loading="lazy" />
        <p className="pwc-contact-eyebrow">PAW WORLD CARE Ở ĐÂY</p>
        <h2 id="pwc-contact-form-title">Chúng mình<br />luôn lắng nghe bạn</h2>
        <p>Bạn cần hỗ trợ về dịch vụ hoặc muốn góp ý cho dự án? Hãy để lại email để đội ngũ có thể phản hồi.</p>
        <p>Không gửi mật khẩu, mã OTP, thông tin thẻ hoặc dữ liệu nhạy cảm. Form này dành cho câu hỏi và góp ý, không thay thế thao tác đặt hay hủy lịch.</p>
        <Link to="/policies/privacy">Xem chính sách bảo mật</Link>
      </div>}
      {compact ? <>
        <Dialog open={open} onClose={() => setOpen(false)} title="Gửi lời nhắn"
          className="mobile-flow-dialog" dismissible={!busy}>{messageForm}</Dialog>
      </> : messageForm}
    </section>
  </div>;
}
