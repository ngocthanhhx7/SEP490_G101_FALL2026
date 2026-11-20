import { useCallback, useId, useMemo } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  findPolicy,
  isUnpublishedPolicyPath,
  policyHref,
  publicPolicies
} from './policy-catalog.js';
import { usePublicPolicyState } from '../../../contexts/PublicPolicyContext.jsx';
import { useApiResource } from '../../../hooks/useApiResource.js';
import { loadPublicPolicyVersion } from '../../../services/public-policy-api.js';
import './public-policies.css';

const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase();
const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });

function effectiveDate(policy) {
  return Number.isFinite(Date.parse(policy.effectiveAt)) ? date.format(new Date(policy.effectiveAt)) : policy.effectiveDate;
}

function PolicyCard({ policy }) {
  const { search } = useLocation();
  return (
    <li className="policy-card">
      <div>
        <h2>
          <Link to={policyHref(policy.slug, policy.versionPath)} state={{ policyFrom: '/policies' + search }}>
            {policy.title}
          </Link>
        </h2>
        <p>{policy.summary}</p>
        {effectiveDate(policy) && <p>Hiệu lực từ <time dateTime={policy.effectiveAt}>{effectiveDate(policy)}</time></p>}
      </div>
      <Link
        className="policy-card__action"
        to={policyHref(policy.slug, policy.versionPath)}
        state={{ policyFrom: '/policies' + search }}
        aria-label={`Đọc ${policy.title}`}
      >
        Đọc chính sách <span aria-hidden="true">→</span>
      </Link>
    </li>
  );
}

export function PolicyIndexPage({ policies = publicPolicies }) {
  const state = usePublicPolicyState();
  const resolvedPolicies = policies === publicPolicies ? state.catalog : policies;
  const [params, setParams] = useSearchParams();
  const { state: navigationState } = useLocation();
  const query = params.get('q') ?? '';
  const filteredPolicies = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return resolvedPolicies;
    return resolvedPolicies.filter((policy) => {
      const bodyText = policy.sections.flatMap((section) => [
        section.heading,
        ...(section.paragraphs || []),
        ...(section.items || [])
      ]);
      return normalize([
        policy.title,
        policy.summary,
        policy.purpose,
        policy.keywords,
        ...bodyText
      ]
        .join(' '))
        .includes(normalizedQuery);
    });
  }, [resolvedPolicies, query]);

  return (
    <section className="public-policies" aria-labelledby="policy-index-title">
      <nav className="policy-breadcrumbs" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <span>Chính sách</span>
      </nav>
      <header className="policy-page-header">
        <p className="policy-eyebrow">Paw World Care · Thông tin công khai</p>
        <h1 id="policy-index-title">Chính sách &amp; hướng dẫn</h1>
        <p>
          Tìm các phiên bản chính sách đã được phê duyệt và đang có hiệu lực.
        </p>
      </header>
      {policies === publicPolicies && state.status !== 'ready' ? <PolicyStatus state={state} /> : resolvedPolicies.length === 0 ? (
        <p className="policy-empty-state" role="status">
          Hiện chưa có chính sách nào được phê duyệt để công khai. Nội dung dự
          thảo chưa được hiển thị trên trang này.
        </p>
      ) : (
        <>
          <div className="policy-search">
            <label htmlFor="policy-search-input">Tìm chính sách</label>
            <input
              id="policy-search-input"
              type="search"
              value={query}
              placeholder="Ví dụ: OTP, hủy lịch, thanh toán"
              onChange={event => setParams(event.target.value ? { q: event.target.value } : {}, { replace: true, state: navigationState })}
            />
            <p aria-live="polite">
              {filteredPolicies.length
                ? `Có ${filteredPolicies.length} chính sách${query.trim() ? ' phù hợp' : ''}.`
                : 'Không tìm thấy chính sách phù hợp. Hãy thử từ khóa khác.'}
            </p>
          </div>
          {filteredPolicies.length > 0 && (
            <ul className="policy-card-list">
              {filteredPolicies.map((policy) => (
                <PolicyCard key={policy.slug} policy={policy} />
              ))}
            </ul>
          )}
          <p className="policy-source-note">
            Chỉ phiên bản đã được phê duyệt mới xuất hiện tại đây.
          </p>
        </>
      )}
      <p><Link to="/contact" state={{ helpFrom: '/policies' + (query ? '?' + params : '') }}>Cần giải thích thêm?</Link></p>
    </section>
  );
}

function PolicyNotFound() {
  return (
    <section
      className="public-policies policy-not-found"
      aria-labelledby="policy-not-found-title"
    >
      <p className="policy-eyebrow">Paw World Care · Chính sách</p>
      <h1 id="policy-not-found-title">Không tìm thấy phiên bản này</h1>
      <p>Đường dẫn chính sách hoặc phiên bản không tồn tại.</p>
      <Link className="policy-back-link" to="/policies">
        Xem danh sách chính sách
      </Link>
    </section>
  );
}

function PolicyUnpublished() {
  return (
    <section
      className="public-policies policy-unpublished"
      aria-labelledby="policy-unpublished-title"
    >
      <p className="policy-eyebrow">Paw World Care · Chính sách</p>
      <h1 id="policy-unpublished-title">Chính sách chưa được xuất bản</h1>
      <p>
        Chưa có phiên bản được phê duyệt để công khai. Nội dung đang chờ duyệt
        và chưa có hiệu lực.
      </p>
      <Link className="policy-back-link" to="/policies">
        Xem danh sách chính sách
      </Link>
    </section>
  );
}

function PolicyContent({ content }) {
  return <>
    {content.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    {content.items?.length > 0 && <ul>{content.items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
  </>;
}

function PolicyStatus({ state }) {
  return state.status === 'loading' ? <p role="status">Đang tải chính sách…</p> : <div role="alert">
    <p>Chưa tải được chính sách. Hãy kiểm tra kết nối.</p>
    <button type="button" className="pwc-button pwc-button--secondary" onClick={state.retry}>Thử lại</button>
  </div>;
}

function PolicyArticle({ policy, embedded }) {
  const key = useId();
  const headingId = index => key + '-policy-section-' + index;
  const formattedDate = effectiveDate(policy);
  const location = useLocation();
  const Title = embedded ? 'h2' : 'h1';
  return <article className="policy-article" aria-labelledby={key + '-title'}>
    <header className="policy-page-header policy-page-header--article">
      <Title id={key + '-title'}>{policy.title}</Title>
      {formattedDate && <p>Ngày hiệu lực <time dateTime={policy.effectiveAt}>{formattedDate}</time></p>}
      {policy.archived && <p><strong>Phiên bản lưu trữ</strong>{!embedded && policy.currentVersionId && <> ·
        <Link to={policyHref(policy.slug, policy.currentVersionId)}>Đọc phiên bản hiện hành</Link></>}</p>}
      <p>{policy.summary ?? policy.purpose}</p>
      {policy.purpose && policy.summary && policy.purpose !== policy.summary && <p>{policy.purpose}</p>}
    </header>
    <nav className="policy-contents" aria-label="Mục lục bài viết">
      <h2>Mục lục</h2>
      <ol>{policy.sections.map((section, index) => <li key={index}>
        <a href={'#' + headingId(index)} onClick={event => {
          const target = document.getElementById(headingId(index));
          if (target) { event.preventDefault(); target.focus({ preventScroll: true }); target.scrollIntoView?.(); }
        }}>{section.heading}</a>
      </li>)}</ol>
    </nav>
    <div className="policy-article-content">{policy.sections.map((section, index) => <section key={index}>
      <h2 id={headingId(index)} tabIndex={-1}>{section.heading}</h2>
      <PolicyContent content={section} />
    </section>)}</div>
    <details className="policy-version-row"><summary>Thông tin phiên bản</summary>
      <p>{policy.version}</p>
      {!embedded && <Link to={policyHref(policy.slug, policy.versionPath)}>Mở liên kết phiên bản cố định</Link>}
    </details>
    {!embedded && <p><Link to="/contact" state={{ helpFrom: location.pathname }}>Cần giải thích thêm?</Link></p>}
  </article>;
}

export function PolicyReader({ slug, version, policies = publicPolicies, embedded = false }) {
  const state = usePublicPolicyState();
  const resolved = policies === publicPolicies ? state.catalog : policies;
  const current = findPolicy(slug, version, resolved);
  const archived = Boolean(version && version !== 'draft-v1' && !current && policies === publicPolicies);
  const load = useCallback(({ signal }) => archived
    ? loadPublicPolicyVersion(slug, version, { signal }) : Promise.resolve({ data: null }), [archived, slug, version]);
  const resource = useApiResource(load);
  if (current) return <PolicyArticle policy={current} embedded={embedded} />;
  if (archived) {
    if (resource.status === 'success' && resource.data?.versionId === version && resource.data.slug === slug)
      return <PolicyArticle policy={resource.data} embedded={embedded} />;
    if (resource.status !== 'empty') return <PolicyStatus state={resource} />;
    return embedded ? <p>Không tìm thấy phiên bản này.</p> : <PolicyNotFound />;
  }
  if (policies === publicPolicies && state.status !== 'ready') return <PolicyStatus state={state} />;
  if (embedded) return <p>Chính sách chưa được xuất bản.</p>;
  return isUnpublishedPolicyPath(slug, version) ? <PolicyUnpublished /> : <PolicyNotFound />;
}

export function PolicyArticlePage({ policies }) {
  const { slug, version } = useParams();
  return <div className="public-policies"><PolicyReader key={slug + ':' + (version ?? '')} slug={slug} version={version} policies={policies} /></div>;
}
