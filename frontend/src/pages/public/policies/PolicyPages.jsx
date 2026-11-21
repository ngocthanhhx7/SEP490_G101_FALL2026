import { ArrowLeft, ArrowRight, ChevronRight, Link2, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  findPolicy,
  isUnpublishedPolicyPath,
  policyHref,
  publicPolicies
} from './policy-catalog.js';
import { usePublicPolicyCatalog } from '../../../contexts/PublicPolicyContext.jsx';
import './public-policies.css';

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
        aria-label={`Đọc ${policy.title}`}
      >
        Đọc chính sách <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function PolicyIndexPage({ policies = publicPolicies }) {
  const loadedPolicies = usePublicPolicyCatalog();
  const resolvedPolicies =
    policies === publicPolicies && loadedPolicies.length
      ? loadedPolicies
      : policies;
  const [query, setQuery] = useState('');
  const searchInput = useRef(null);
  const filteredPolicies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    if (!normalizedQuery) return resolvedPolicies;
    return resolvedPolicies.filter((policy) => {
      const bodyText = policy.sections.flatMap((section) => [
        section.heading,
        ...(section.paragraphs || []),
        ...(section.items || [])
      ]);
      return [
        policy.title,
        policy.summary,
        policy.purpose,
        policy.keywords,
        ...bodyText
      ]
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(normalizedQuery);
    });
  }, [resolvedPolicies, query]);

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
  const { hash } = useLocation();

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
        {policy.purpose !== policy.summary && <p>{policy.purpose}</p>}
      </header>
      <div className="policy-publication">
        <dl className="policy-metadata">
          <div>
            <dt>Ngày hiệu lực</dt>
            <dd><EffectiveDate policy={policy} /></dd>
          </div>
          <div>
            <dt>Phiên bản</dt>
            <dd>{policy.version}</dd>
          </div>
        </dl>
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
    </article>
  );
}

export function PolicyArticlePage({ policies = publicPolicies }) {
  const loadedPolicies = usePublicPolicyCatalog();
  const resolvedPolicies =
    policies === publicPolicies && loadedPolicies.length
      ? loadedPolicies
      : policies;
  const { slug, version } = useParams();
  const policy = findPolicy(slug, version, resolvedPolicies);
  if (policy)
    return <PolicyArticle policy={policy} versioned={Boolean(version)} />;
  return isUnpublishedPolicyPath(slug, version) ? (
    <PolicyUnpublished />
  ) : (
    <PolicyNotFound />
  );
}
