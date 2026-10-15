import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sendContactMessage } from '../../services/contact-api.js';
import './contact.css';

const questions = [
  { topic: 'BOOKING', question: 'Làm thế nào để đặt lịch chăm sóc cho bé?', answer: <>Đăng nhập hoặc đăng ký tài khoản, xem <Link to="/services">danh mục dịch vụ</Link> và kiểm tra khu vực phục vụ trước khi chọn lịch. Thông tin hồ sơ thú cưng và lời dặn giúp người chăm sóc chuẩn bị cho bé.</> },
  { topic: 'SERVICE', question: 'Paw World Care hỗ trợ chó hay mèo?', answer: <>Dự án tập trung chăm sóc chó, mèo tại nhà. Đối tượng áp dụng, phạm vi và giá của từng dịch vụ được hiển thị trong <Link to="/services">danh mục đang công bố</Link>.</> },
  { topic: 'SERVICE', question: 'Làm sao kiểm tra địa chỉ của tôi có được phục vụ?', answer: <>Xem <Link to="/service-areas">khu vực phục vụ</Link> hiện hành. Nếu chưa thấy khu vực của mình, bạn có thể gửi câu hỏi bằng form bên dưới; yêu cầu liên hệ không phải xác nhận đặt lịch.</> },
  { topic: 'BOOKING', question: 'Tôi theo dõi lượt chăm sóc của bé như thế nào?', answer: <>Theo dõi trạng thái lượt chăm sóc trong tài khoản và xem báo cáo gồm checklist, ảnh cùng ghi chú khi được cập nhật. Liên hệ hỗ trợ nếu cần làm rõ thông tin của một lượt chăm sóc.</> },
  { topic: 'POLICY', question: 'Tôi có thể xem quy định hủy lịch, thanh toán và hoàn tiền ở đâu?', answer: <>Vui lòng đọc <Link to="/policies">chính sách dịch vụ</Link> hiện hành và điều kiện áp dụng cho đặt lịch của bạn. Form liên hệ không tự động hủy lịch hoặc tạo yêu cầu hoàn tiền.</> },
  { topic: 'POLICY', question: 'Thông tin cá nhân của tôi được xử lý thế nào?', answer: <>Tham khảo <Link to="/policies/privacy">chính sách bảo mật</Link>. Trong form liên hệ, chỉ cung cấp thông tin cần thiết; không gửi mật khẩu, mã OTP hoặc thông tin thanh toán.</> },
];
const topics = [['BOOKING', 'Hướng dẫn đặt lịch'], ['SERVICE', 'Dịch vụ & khu vực'], ['POLICY', 'Chính sách & hỗ trợ']];
const empty = { name: '', phone: '', email: '', topic: 'BOOKING', message: '', consent: false };
function normalize(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase(); }

export function ContactPage({ send = sendContactMessage }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const filtered = useMemo(() => questions.filter(item => (!category || item.topic === category)
    && normalize(item.question + ' ' + topics.find(([key]) => key === item.topic)?.[1]).includes(normalize(query.trim()))), [category, query]);
  function change(event) { setForm(previous => ({ ...previous, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })); }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setNotice(''); setFailed(false);
    try {
      await send({ ...form, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), message: form.message.trim() });
      setNotice('Máy chủ email đã tiếp nhận lời nhắn. Cảm ơn bạn đã liên hệ Paw World Care.');
      setForm(empty);
    } catch (error) {
      setFailed(true);
      setNotice(error?.code === 'CONTACT_DELIVERY_UNCERTAIN'
        ? 'Chưa xác nhận được kết quả gửi. Thư có thể đã được tiếp nhận; vui lòng kiểm tra trước khi gửi lại.'
        : error?.status === 429 ? 'Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau.'
          : 'Chưa thể gửi email. Vui lòng thử lại sau; nội dung của bạn vẫn được giữ trong form.');
    } finally { setBusy(false); }
  }
  return <div className="pwc-contact-page">
    <section className="pwc-contact-hero" aria-labelledby="pwc-contact-heading">
      <img src="/assets/figma-public/home-Frame2147225474.svg" alt="" />
      <h1 id="pwc-contact-heading">Chúng mình có thể<br />giúp gì cho bạn?</h1>
      <p>Tìm hướng dẫn chăm sóc, đặt lịch và hỗ trợ từ Paw World Care.<br />Hoặc gửi lời nhắn cho đội ngũ dự án bên dưới.</p>
      <label className="pwc-contact-search"><span className="pwc-visually-hidden">Tìm câu hỏi hỗ trợ</span>
        <input type="search" maxLength={120} placeholder="Tìm câu hỏi về đặt lịch, dịch vụ, chính sách…" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
    </section>
    <section className="pwc-contact-help" aria-labelledby="pwc-contact-help-title">
      <h2 id="pwc-contact-help-title">Danh mục hỗ trợ</h2>
      <div className="pwc-contact-categories">{topics.map(([key, label], i) => <button type="button" key={key} aria-pressed={category === key}
        onClick={() => setCategory(current => current === key ? '' : key)}>
        <span aria-hidden="true">{['01', '02', '03'][i]}</span><h3>{label}</h3>
        <p>{['Các bước chuẩn bị và lựa chọn lượt chăm sóc phù hợp cho bé.', 'Thông tin chăm sóc chó, mèo và phạm vi phục vụ hiện hành.', 'Thanh toán, hủy lịch, hoàn tiền và bảo mật thông tin.'][i]}</p>
      </button>)}</div>
      <div className="pwc-contact-faq"><h2>Câu hỏi thường gặp</h2>
        {filtered.length ? filtered.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)
          : <p role="status">Chưa tìm thấy câu hỏi phù hợp. Bạn có thể gửi lời nhắn bên dưới.</p>}
        {(query || category) && <button type="button" className="pwc-text-button" onClick={() => { setQuery(''); setCategory(''); }}>Xem tất cả câu hỏi</button>}
      </div>
    </section>
    <section className="pwc-contact-message" id="send-message" aria-labelledby="pwc-contact-form-title">
      <div className="pwc-contact-message-intro"><img src="/assets/figma-public/home-Image662.webp" alt="Chú mèo trắng của PawWorld" loading="lazy" />
        <p className="pwc-contact-eyebrow">PAW WORLD CARE Ở ĐÂY</p>
        <h2 id="pwc-contact-form-title">Chúng mình<br />luôn lắng nghe bạn</h2>
        <p>Bạn cần hỗ trợ về dịch vụ hoặc muốn góp ý cho dự án? Hãy để lại email để đội ngũ có thể phản hồi.</p>
        <p>Không gửi mật khẩu, mã OTP, thông tin thẻ hoặc dữ liệu nhạy cảm. Form này dành cho câu hỏi và góp ý, không thay thế thao tác đặt hay hủy lịch.</p>
        <Link to="/policies/privacy">Xem chính sách bảo mật</Link>
      </div>
      <form onSubmit={submit} className="pwc-contact-form" aria-label="Gửi lời nhắn">
        <p className="pwc-contact-eyebrow">ĐỂ LẠI LỜI NHẮN</p>
        <h2>Chúng mình có thể<br />giúp gì cho bạn?</h2>
        <p>Cứ kể điều bạn cần — chúng mình sẽ phản hồi qua thông tin bạn để lại.</p>
        <label>Họ và tên<input name="name" autoComplete="name" placeholder="Tên của bạn" required minLength={2} maxLength={80} value={form.name} onChange={change} /></label>
        <div className="pwc-contact-form-pair"><label>Số điện thoại (không bắt buộc)<input name="phone" type="tel" autoComplete="tel" maxLength={20} pattern="[+0-9 ()-]{8,20}" placeholder="Số điện thoại liên hệ" value={form.phone} onChange={change} /></label>
        <label>Email phản hồi<input name="email" type="email" autoComplete="email" placeholder="ban@email.com" required maxLength={254} value={form.email} onChange={change} /></label></div>
        <label>Chủ đề<select name="topic" value={form.topic} onChange={change}>{topics.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="OTHER">Liên hệ khác</option></select></label>
        <label>Nội dung<textarea name="message" rows={6} required minLength={10} maxLength={3000} value={form.message} onChange={change} placeholder="Bạn cần chúng mình hỗ trợ điều gì?" /></label>
        <p className="pwc-contact-form-hint">Từ 10 đến 3.000 ký tự. Vui lòng không gửi lại trong khi đang xử lý.</p>
        <label className="pwc-contact-consent"><input name="consent" type="checkbox" required checked={form.consent} onChange={change} />
          <span>Tôi đồng ý để Paw World Care sử dụng thông tin đã cung cấp nhằm liên hệ và phản hồi yêu cầu này.</span></label>
        <button className="pwc-design-button" type="submit" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi lời nhắn'}</button>
        <p className="pwc-contact-form-hint">Yêu cầu chỉ được báo tiếp nhận khi máy chủ email xác nhận. Thông tin không được lưu trong trình duyệt.</p>
        {notice && <p role={failed ? 'alert' : 'status'}>{notice}</p>}
      </form>
    </section>
  </div>;
}
