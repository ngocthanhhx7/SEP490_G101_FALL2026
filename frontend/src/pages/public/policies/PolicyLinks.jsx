import { Link } from 'react-router-dom';
import { policyHref } from './policy-catalog.js';
import './public-policies.css';

const policyLinksByContext = {
  registration: ['terms', 'privacy', 'contact-verification'],
  booking: ['booking', 'payments', 'cancellations-refunds', 'service-areas'],
  account: ['privacy', 'terms', 'contact-verification'],
  sitterApplication: ['terms', 'privacy', 'sitter-onboarding', 'contact-verification'],
};

const labelOverrides = {
  terms: 'Điều khoản dịch vụ',
  privacy: 'Chính sách quyền riêng tư',
  'contact-verification': 'Chính sách OTP và liên hệ',
  booking: 'Chính sách đặt dịch vụ',
  payments: 'Thanh toán và đặt trước',
  'cancellations-refunds': 'Hủy lịch và hoàn tiền',
  'service-areas': 'Khu vực phục vụ',
  'sitter-onboarding': 'Ứng tuyển Pet Sitter',
};

export function PolicyContextLinks({ context = 'registration' }) {
  const slugs = policyLinksByContext[context] || policyLinksByContext.registration;
  return <nav className="policy-context-links" aria-label="Chính sách liên quan">
    {slugs.map(slug => {
      return <Link key={slug} to={policyHref(slug)}>{labelOverrides[slug]}</Link>;
    })}
    <Link to="/policies">Tất cả chính sách</Link>
  </nav>;
}
