import { ArrowLeft, ArrowRight, ChevronRight, Link2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
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
const policyDate = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh'
});

function EffectiveDate({ policy }) {
  const date = policy.effectiveAt ?? policy.effectiveDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(date) || !Number.isFinite(Date.parse(date))) {
    return policy.effectiveDate;
  }
  return <time dateTime={date}>{policyDate.format(new Date(date))}</time>;
}

function PolicyBackLink({ children = 'Xem danh sách chính sách' }) {
  return <Link className="policy-action policy-back-link" to="/policies">
    <ArrowLeft size={17} aria-hidden="true" />
    {children}
  </Link>;
}

function PolicyCard({ policy }) {
  const { search } = useLocation();
  return (
    <li className="policy-card">
      <div>
        <h2>{policy.title}</h2>
        <p>{policy.summary}</p>
        {policy.purpose !== policy.summary && <p className="policy-card__purpose">
          <strong>Mục đích:</strong> {policy.purpose}
        </p>}
      </div>
      <Link
        className="policy-action"
        to={policyHref(policy.slug, policy.versionPath)}
        state={{ policyFrom: '/policies' + search }}
        aria-label={`Đọc ${policy.title}`}
      >
        Đọc chính sách <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function PolicyIndexPage({ policies = publicPolicies }) {
  const state = usePublicPolicyState();
  const resolvedPolicies = policies === publicPolicies ? state.catalog : policies;
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const setQuery = value => setParams(current => {
    const next = new globalThis.URLSearchParams(current);
    if (value) next.set('q', value);
    else next.delete('q');
    return next;
  }, { replace: true });
  const searchInput = useRef(null);
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

  if (policies === publicPolicies && state.status !== 'ready') return <PolicyStatus state={state} />;
  return (
    <section className="public-policies" aria-labelledby="policy-index-title">
      <header className="policy-page-header">
        <h1 id="policy-index-title">Chính sách &amp; hướng dẫn</h1>
        <p>
          Tìm các phiên bản chính sách đã được phê duyệt và đang có hiệu lực.
        </p>
      </header>
      {resolvedPolicies.length === 0 ? (
        <p className="policy-empty-state" role="status">
          Hiện chưa có chính sách nào được phê duyệt để công khai. Nội dung dự
          thảo chưa được hiển thị trên trang này.
        </p>
      ) : (
        <>
          <div className="policy-search" role="search" aria-label="Chính sách">
            <label htmlFor="policy-search-input">Tìm chính sách</label>
            <div className="policy-search__field">
              <Search size={19} aria-hidden="true" />
              <input
                ref={searchInput}
                id="policy-search-input"
                type="search"
                value={query}
                placeholder="Ví dụ: quyền riêng tư, OTP"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && <button type="button" aria-label="Xóa từ khóa"
                onClick={() => {
                  setQuery('');
                  searchInput.current?.focus();
                }}>
                <X size={18} aria-hidden="true" />
              </button>}
            </div>
            <p aria-live="polite">{query.trim() && (filteredPolicies.length
              ? `Có ${filteredPolicies.length} chính sách phù hợp.`
              : 'Không tìm thấy chính sách phù hợp. Hãy thử từ khóa khác.')}</p>
          </div>
          {filteredPolicies.length > 0 && (
            <ul className="policy-card-list">
              {filteredPolicies.map((policy) => (
                <PolicyCard key={policy.slug} policy={policy} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function PolicyNotFound() {
  return (
    <section
      className="public-policies policy-not-found"
      aria-labelledby="policy-not-found-title"
    >
      <h1 id="policy-not-found-title">Không tìm thấy phiên bản này</h1>
      <p>Đường dẫn chính sách hoặc phiên bản không tồn tại.</p>
      <PolicyBackLink />
    </section>
  );
}

function PolicyUnpublished() {
  return (
    <section
      className="public-policies policy-unpublished"
      aria-labelledby="policy-unpublished-title"
    >
      <h1 id="policy-unpublished-title">Chính sách chưa được xuất bản</h1>
      <p>
        Chưa có phiên bản được phê duyệt để công khai. Nội dung đang chờ duyệt
        và chưa có hiệu lực.
      </p>
      <PolicyBackLink />
    </section>
  );
}

function PolicyContent({ content }) {
  if (content.paragraphs)
    return content.paragraphs.map((paragraph, index) => (
      <p key={index}>{paragraph}</p>
    ));
  return (
    <ul>
      {content.items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function PolicyArticle({ policy, versioned }) {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!/^#policy-section-\d+$/.test(hash)) return;
    const target = document.getElementById(hash.slice(1));
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'start' });
  }, [hash, policy]);

  return (
    <article className="public-policies" aria-labelledby="policy-article-title">
      <PolicyBackLink>Tất cả chính sách</PolicyBackLink>
      <header className="policy-page-header">
        <h1 id="policy-article-title">{policy.title}</h1>
        <p>{policy.summary}</p>
        {policy.archived && <p>Phiên bản lưu trữ</p>}
        {policy.purpose !== policy.summary && <p>{policy.purpose}</p>}
      </header>
      <div className="policy-publication">
        <details className="policy-version-row"><summary>Thông tin phiên bản</summary><dl className="policy-metadata">
          <div>
            <dt>Ngày hiệu lực</dt>
            <dd><EffectiveDate policy={policy} /></dd>
          </div>
          <div>
            <dt>Phiên bản</dt>
            <dd>{policy.version}</dd>
          </div>
        </dl></details>
        {!versioned && <Link className="policy-action" to={policyHref(policy.slug, policy.versionPath)}>
          <Link2 size={17} aria-hidden="true" />
          Mở bản cố định
        </Link>}
      </div>
      <div className="policy-article-layout">
        {policy.sections.length > 0 && <nav className="policy-contents" aria-label="Mục lục bài viết">
          <p>Mục lục</p>
          <ul>
            {policy.sections.map((section, index) => (
              <li key={section.heading}>
                <a href={`#policy-section-${index}`}>
                  {section.heading}
                  <ChevronRight size={16} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </nav>}
        <div className="policy-article-content">
          {policy.sections.map((section, index) => (
            <section key={section.heading} aria-labelledby={`policy-section-${index}`}>
              <h2 id={`policy-section-${index}`} tabIndex={-1}>{section.heading}</h2>
              <PolicyContent content={section} />
            </section>
          ))}
        </div>
      </div>
      <Link to="/contact" state={{ helpFrom: pathname }}>Cần giải thích thêm?</Link>
    </article>
  );
}

function PolicyStatus({ state }) {
  return state.status === 'loading' ? <p role="status">Đang tải chính sách…</p> : <div role="alert">
    <p>Chưa tải được chính sách. Hãy kiểm tra kết nối.</p>
    <button type="button" className="pwc-button pwc-button--secondary" onClick={state.retry}>Thử lại</button>
  </div>;
}

function effectiveDate(policy) {
  return Number.isFinite(Date.parse(policy.effectiveAt)) ? policyDate.format(new Date(policy.effectiveAt)) : policy.effectiveDate;
}

function EmbeddedArticle({ policy, embedded }) {
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
  if (current) return embedded ? <EmbeddedArticle policy={current} embedded /> : <PolicyArticle policy={current} versioned={Boolean(version)} />;
  if (archived) {
    if (resource.status === 'success' && resource.data?.versionId === version && resource.data.slug === slug)
      return embedded ? <EmbeddedArticle policy={resource.data} embedded /> : <PolicyArticle policy={resource.data} versioned={Boolean(version)} />;
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
