import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePublicPolicyCatalog } from '../../../contexts/PublicPolicyContext.jsx';
import { Dialog } from '../../../components/ui/index.js';
import { PolicyReader } from './PolicyPages.jsx';
import { policyHref } from './policy-catalog.js';
import './public-policies.css';

const policyLinksByContext = {
  registration: ['terms', 'privacy', 'contact-verification'],
  productOrder: ['terms', 'privacy'],
  contact: ['privacy'],
  booking: ['booking', 'payments', 'cancellations-refunds', 'service-areas'],
  account: ['privacy', 'terms', 'contact-verification'],
  sitterApplication: ['terms', 'privacy', 'sitter-onboarding', 'contact-verification'],
};

const labelOverrides = {
  terms: 'Điều khoản sử dụng tài khoản',
  privacy: 'Chính sách quyền riêng tư',
  'contact-verification': 'Chính sách OTP và liên hệ',
  booking: 'Chính sách đặt dịch vụ',
  payments: 'Thanh toán và đặt trước',
  'cancellations-refunds': 'Hủy lịch và hoàn tiền',
  'service-areas': 'Khu vực phục vụ',
  'sitter-onboarding': 'Ứng tuyển Pet Sitter',
};

export function PolicyReadingLinks({ entries }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new globalThis.URLSearchParams(location.search);
  const selection = entries.find(entry => entry.slug === params.get('read-policy'));
  const version = params.get('policy-version') || undefined;
  const opener = useRef(null);
  useEffect(() => {
    if (selection || !opener.current) return;
    const link = opener.current;
    const frame = window.requestAnimationFrame(() => {
      if (link.isConnected) link.focus({ preventScroll: true });
      opener.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selection]);
  function open(entry, link) {
    opener.current = link;
    const next = new globalThis.URLSearchParams(location.search);
    next.set('read-policy', entry.slug);
    if (entry.version) next.set('policy-version', entry.version);
    else next.delete('policy-version');
    navigate({ pathname: location.pathname, search: '?' + next, hash: location.hash },
      { state: { ...location.state, policyOverlay: true }, preventScrollReset: true });
  }
  function close() {
    if (location.state?.policyOverlay) return navigate(-1);
    params.delete('read-policy');
    params.delete('policy-version');
    navigate({ pathname: location.pathname, search: '?' + params, hash: location.hash }, { replace: true, state: location.state });
  }
  return <>
    <nav className="policy-context-links" aria-label="Chính sách liên quan">
      {entries.map(entry => <Link key={entry.slug}
        to={entry.version ? policyHref(entry.slug, entry.version) : '/policies/' + entry.slug}
        onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          open(entry, event.currentTarget);
        }}>{entry.label}</Link>)}
    </nav>
    {selection && <Dialog open title={selection.label} onClose={close} className="mobile-flow-dialog policy-reader-dialog">
      <PolicyReader key={selection.slug + ':' + (version ?? '')} slug={selection.slug} version={version} embedded />
    </Dialog>}
  </>;
}

export function PolicyContextLinks({ context = 'registration' }) {
  const slugs = policyLinksByContext[context] || policyLinksByContext.registration;
  const policies = usePublicPolicyCatalog();
  const entries = slugs.map(slug => {
    const current = policies.find(policy => policy.slug === slug);
    return { slug, label: labelOverrides[slug], version: current?.versionPath ?? current?.versionId };
  });
  return <PolicyReadingLinks entries={entries} />;
}
