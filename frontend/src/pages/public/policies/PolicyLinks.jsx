import { Link } from 'react-router-dom';
import { usePublicPolicyCatalog } from '../../../contexts/PublicPolicyContext.jsx';
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
  const policies = usePublicPolicyCatalog();
  const hrefFor = slug => {
    const now = Date.now();
    const candidates = Array.isArray(policies) ? policies.filter(policy => policy?.slug === slug
      && policy.status === 'APPROVED' && (policy.versionPath || policy.versionId)
      && Number.isFinite(Date.parse(policy.approvedAt)) && Date.parse(policy.approvedAt) <= now
      && Number.isFinite(Date.parse(policy.effectiveAt)) && Date.parse(policy.effectiveAt) <= now
      && (policy.expiresAt === null || policy.expiresAt === undefined || Date.parse(policy.expiresAt) > now)) : [];
    candidates.sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt));
    return policyHref(slug, candidates[0]?.versionPath || candidates[0]?.versionId || 'draft-v1');
  };
  return <nav className="policy-context-links" aria-label="Chính sách liên quan">
    {slugs.map(slug => {
      return <Link key={slug} to={hrefFor(slug)}>{labelOverrides[slug]}</Link>;
    })}
    <Link to="/policies">Tất cả chính sách</Link>
  </nav>;
}
