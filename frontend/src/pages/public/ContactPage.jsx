import { useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import { primaryRole } from '../../utils/role-access.js';
import { CalendarDays, ChevronDown, ChevronRight, MapPin, Search, ShieldCheck, X } from 'lucide-react';
import { Button, Dialog } from '../../components/ui/index.js';
import { usePhoneApp } from '../../hooks/usePhoneApp.js';
import { sendContactMessage } from '../../services/contact-api.js';
import { ContactMessageForm, useContactMessageForm } from './ContactMessageForm.jsx';
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
const topics = [
  { key: 'BOOKING', label: 'Hướng dẫn đặt lịch', sitterLabel: 'Lời mời', icon: CalendarDays, description: 'Chuẩn bị và theo dõi lịch chăm sóc.' },
  { key: 'SERVICE', label: 'Dịch vụ & khu vực', sitterLabel: 'Ca làm & sự cố', icon: MapPin, description: 'Tìm dịch vụ phù hợp và kiểm tra khu vực phục vụ.' },
  { key: 'POLICY', label: 'Chính sách & hỗ trợ', sitterLabel: 'Hồ sơ & hỗ trợ', icon: ShieldCheck, description: 'Thanh toán, đổi lịch, hoàn tiền và bảo mật.' },
];
function normalize(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase(); }

function FaqItem({ item }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  return <div className="pwc-contact-faq-item">
    <h3><button type="button" aria-expanded={expanded} aria-controls={id + '-answer'}
      onClick={() => setExpanded(value => !value)}>
      <span>{item.question}</span><ChevronDown aria-hidden="true" size={20} />
    </button></h3>
    <div className="pwc-contact-answer" id={id + '-answer'} hidden={!expanded}>
      <p>{item.answer}</p>
    </div>
  </div>;
}

export function ContactPage({ send = sendContactMessage }) {
  const compact = usePhoneApp();
  const { user } = useSession({ optional: true });
  const sitter = primaryRole(user) === 'PET_SITTER';
  const { hash, state } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = params.get('q') ?? '';
  const category = params.get('topic') ?? '';
  const [open, setOpen] = useState(false);
  const form = useContactMessageForm(send);
  const searchInput = useRef(null);
  const contactSection = useRef(null);
  const filtering = Boolean(query.trim() || category);
  const filtered = useMemo(() => {
    const search = normalize(query.trim());
    return (sitter ? sitterQuestions : questions).filter(item => {
      if (category && item.topic !== category) return false;
      const topic = topics.find(({ key }) => key === item.topic);
      return normalize([item.question, item.keywords, topic?.label, sitter && topic?.sitterLabel].filter(Boolean).join(' ')).includes(search);
    });
  }, [category, query, sitter]);

  function filter(q, topic) {
    const next = new globalThis.URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    if (topic) next.set('topic', topic);
    else next.delete('topic');
    navigate({ search: next.toString(), hash }, { replace: true, state, preventScrollReset: true });
  }

  const messageForm = <ContactMessageForm {...form} topics={topics} compact={compact} />;
  return <div className={compact ? 'pwc-contact-page pwc-contact-page--compact' : 'pwc-contact-page'}>
    <section className="pwc-contact-hero" aria-labelledby="pwc-contact-heading">
      <h1 id="pwc-contact-heading">{compact ? 'Bạn cần hỗ trợ việc gì?' : 'Chúng mình có thể giúp gì cho bạn?'}</h1>
      {!compact && <p>Tìm hướng dẫn về dịch vụ, lịch hẹn và chính sách.</p>}
      <div className="pwc-contact-search" role="search" aria-label="Tìm kiếm hỗ trợ">
        <Search aria-hidden="true" size={20} />
        <label className="pwc-visually-hidden" htmlFor="pwc-contact-search">Tìm câu hỏi hỗ trợ</label>
        <input id="pwc-contact-search" ref={searchInput} type="search" maxLength={120} placeholder="Tìm câu hỏi hỗ trợ…"
          value={query} onChange={event => filter(event.target.value, category)} aria-controls="pwc-support-results" />
        {query && <button type="button" aria-label="Xóa từ khóa" onClick={() => {
          filter('', category);
          searchInput.current?.focus();
        }}><X aria-hidden="true" size={18} /></button>}
      </div>
      {compact && <div className="pwc-contact-entry">
        <Link to={sitter ? '/sitter/schedule' : '/account/bookings'}>{sitter ? 'Xem ca làm' : 'Về lịch hẹn'}</Link>
        {!sitter && <Link to="/customer/product-orders">Về đơn mua hàng</Link>}
        <Button onClick={() => setOpen(true)}>Viết lời nhắn</Button>
      </div>}
    </section>
    <section className="pwc-contact-help pwc-contact-container" aria-labelledby="pwc-contact-help-title">
      <h2 id="pwc-contact-help-title">Danh mục hỗ trợ</h2>
      <div className="pwc-contact-categories">{topics.map(({ key, label, sitterLabel, icon: Icon, description }) =>
        <button type="button" key={key} aria-pressed={category === key} aria-controls="pwc-support-results"
          onClick={() => filter(query, category === key ? '' : key)}>
          <Icon aria-hidden="true" size={24} />
          <span className="pwc-contact-category-copy">
            <strong>{sitter ? sitterLabel : label}</strong>
            {!compact && !sitter && <span>{description}</span>}
          </span>
          <ChevronRight aria-hidden="true" size={20} />
        </button>)}</div>
      <section id="pwc-support-results" className="pwc-contact-faq" aria-labelledby="pwc-support-faq-title">
        <div className="pwc-contact-faq-heading">
          <h2 id="pwc-support-faq-title">Câu hỏi thường gặp</h2>
          {filtering && <button type="button" className="pwc-text-button" onClick={() => {
            filter('', '');
            searchInput.current?.focus();
          }}>Xem tất cả câu hỏi</button>}
        </div>
        <div aria-live="polite" aria-atomic="true">
          {filtering && <p className="pwc-contact-results">
            {filtered.length ? `${filtered.length} câu hỏi phù hợp` : 'Chưa tìm thấy câu hỏi phù hợp.'}
          </p>}
        </div>
        {filtered.map(item => <FaqItem key={item.question} item={item} />)}
        {!filtered.length && (compact
          ? <Button variant="ghost" onClick={() => setOpen(true)}>Gửi lời nhắn</Button>
          : <a href="#send-message" onClick={() => contactSection.current?.focus({ preventScroll: true })}>Gửi lời nhắn</a>)}
      </section>
    </section>
    <section ref={contactSection} className="pwc-contact-message" id="send-message" aria-label="Gửi lời nhắn" tabIndex={compact ? undefined : -1}>
      {compact ? <Dialog open={open} onClose={() => setOpen(false)} title="Gửi lời nhắn"
        className="mobile-flow-dialog" dismissible={!form.busy}>{messageForm}</Dialog>
        : <div className="pwc-contact-container pwc-contact-message-layout">
          <div className="pwc-contact-message-intro">
            <h2>Chúng mình luôn lắng nghe bạn</h2>
            <p>Hãy gửi câu hỏi về dịch vụ hoặc góp ý về trải nghiệm của bạn. Lời nhắn chỉ dùng để liên hệ hỗ trợ.</p>
            <img src="/assets/figma-public/home-Image659.webp" alt="" width="1200" height="1200" loading="lazy" />
            <div className="pwc-contact-privacy">
              <ShieldCheck aria-hidden="true" size={22} />
              <div><h3>Bảo vệ thông tin của bạn</h3>
                <p>Vui lòng tránh gửi mật khẩu, mã OTP, thông tin thẻ hoặc dữ liệu nhạy cảm.</p>
              </div>
            </div>
          </div>
          <div className="pwc-contact-card">
            <header>
              <h2>Gửi lời nhắn</h2>
              <p>Để lại email để đội ngũ có thể phản hồi.</p>
            </header>
            {messageForm}
          </div>
        </div>}
    </section>
  </div>;
}
