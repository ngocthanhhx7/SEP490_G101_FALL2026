import { useMemo, useState } from 'react';
import { Link, Route, useParams } from 'react-router-dom';
import { findPolicy, isUnpublishedPolicyPath, policyHref, publicPolicies } from './policy-catalog.js';
import './public-policies.css';

function PolicyCard({ policy }) {
  return <li className="policy-card">
    <div>
      <p className="policy-card__version">Phiên bản {policy.version}</p>
      <h2><Link to={policyHref(policy.slug, policy.versionPath)}>{policy.title}</Link></h2>
      <p>{policy.summary}</p>
      <p className="policy-card__purpose"><strong>Mục đích:</strong> {policy.purpose}</p>
    </div>
    <Link className="policy-card__action" to={policyHref(policy.slug, policy.versionPath)} aria-label={`Đọc ${policy.title}`}>
      Đọc chính sách <span aria-hidden="true">→</span>
    </Link>
  </li>;
}

export function PolicyIndexPage({ policies = publicPolicies }) {
  const [query, setQuery] = useState('');
  const filteredPolicies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    if (!normalizedQuery) return policies;
    return policies.filter(policy => {
      const bodyText = policy.sections.flatMap(section => [section.heading, ...(section.paragraphs || []), ...(section.items || [])]);
      return [policy.title, policy.summary, policy.purpose, policy.keywords, ...bodyText]
        .join(' ').toLocaleLowerCase('vi').includes(normalizedQuery);
    });
  }, [policies, query]);

  return <section className="public-policies" aria-labelledby="policy-index-title">
    <nav className="policy-breadcrumbs" aria-label="Đường dẫn">
      <Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Chính sách</span>
    </nav>
    <header className="policy-page-header">
      <p className="policy-eyebrow">Paw World Care · Thông tin công khai</p>
      <h1 id="policy-index-title">Chính sách &amp; hướng dẫn</h1>
      <p>Tìm các phiên bản chính sách đã được phê duyệt và đang có hiệu lực.</p>
    </header>
    {policies.length === 0
      ? <p className="policy-empty-state" role="status">
        Hiện chưa có chính sách nào được phê duyệt để công khai. Nội dung dự thảo chưa được hiển thị trên trang này.
      </p>
      : <>
        <div className="policy-search">
          <label htmlFor="policy-search-input">Tìm chính sách</label>
          <input id="policy-search-input" type="search" value={query}
            placeholder="Ví dụ: OTP, hủy lịch, thanh toán"
            onChange={event => setQuery(event.target.value)} />
          <p aria-live="polite">{filteredPolicies.length
            ? `Có ${filteredPolicies.length} chính sách${query.trim() ? ' phù hợp' : ''}.`
            : 'Không tìm thấy chính sách phù hợp. Hãy thử từ khóa khác.'}</p>
        </div>
        {filteredPolicies.length > 0 && <ul className="policy-card-list">
          {filteredPolicies.map(policy => <PolicyCard key={policy.slug} policy={policy} />)}
        </ul>}
        <p className="policy-source-note">Chỉ phiên bản đã được phê duyệt mới xuất hiện tại đây.</p>
      </>}
  </section>;
}

function PolicyNotFound() {
  return <section className="public-policies policy-not-found" aria-labelledby="policy-not-found-title">
    <p className="policy-eyebrow">Paw World Care · Chính sách</p>
    <h1 id="policy-not-found-title">Không tìm thấy phiên bản này</h1>
    <p>Đường dẫn chính sách hoặc phiên bản không tồn tại.</p>
    <Link className="policy-back-link" to="/policies">Xem danh sách chính sách</Link>
  </section>;
}

function PolicyUnpublished() {
  return <section className="public-policies policy-unpublished" aria-labelledby="policy-unpublished-title">
    <p className="policy-eyebrow">Paw World Care · Chính sách</p>
    <h1 id="policy-unpublished-title">Chính sách chưa được xuất bản</h1>
    <p>Chưa có phiên bản được phê duyệt để công khai. Nội dung đang chờ duyệt và chưa có hiệu lực.</p>
    <Link className="policy-back-link" to="/policies">Xem danh sách chính sách</Link>
  </section>;
}

function PolicyContent({ content }) {
  if (content.paragraphs) return content.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>);
  return <ul>{content.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

function PolicyArticle({ policy, versioned }) {
  return <section className="public-policies" aria-labelledby="policy-article-title">
    <nav className="policy-breadcrumbs" aria-label="Đường dẫn">
      <Link to="/">Trang chủ</Link><span aria-hidden="true">/</span>
      <Link to="/policies">Chính sách</Link><span aria-hidden="true">/</span>
      <span aria-current="page">{policy.title}</span>
    </nav>
    <div className="policy-article-layout">
      <article className="policy-article">
        <header className="policy-page-header policy-page-header--article">
          <p className="policy-eyebrow">Paw World Care · Chính sách công khai</p>
          <h1 id="policy-article-title">{policy.title}</h1>
          <p>{policy.summary}</p>
        </header>
        <dl className="policy-metadata">
          <div><dt>Mục đích</dt><dd>{policy.purpose}</dd></div>
          <div><dt>Phiên bản</dt><dd>{policy.version}</dd></div>
          <div><dt>Ngày hiệu lực</dt><dd>{policy.effectiveDate}</dd></div>
        </dl>
        <div className="policy-version-row">
          <span>{versioned ? 'Đường dẫn phiên bản cố định:' : 'Phiên bản hiện hành:'}</span>
          <Link to={policyHref(policy.slug, policy.versionPath)} aria-current={versioned ? 'page' : undefined}>
            {policy.version} · mở liên kết phiên bản
          </Link>
        </div>
        <div className="policy-article-content">
          {policy.sections.map((section, index) => <section key={section.heading} aria-labelledby={`policy-section-${index}`}>
            <h2 id={`policy-section-${index}`}>{section.heading}</h2>
            <PolicyContent content={section} />
          </section>)}
        </div>
        <footer className="policy-article-footer">
          <p>Thông tin trên thuộc phiên bản đã được phê duyệt và đang có hiệu lực.</p>
          <Link className="policy-back-link" to="/policies">← Tất cả chính sách</Link>
        </footer>
      </article>
      <aside className="policy-contents" aria-label="Mục lục bài viết">
        <h2>Trong bài viết</h2>
        <ol>{policy.sections.map((section, index) => <li key={section.heading}>
          <a href={`#policy-section-${index}`}>{section.heading}</a>
        </li>)}</ol>
      </aside>
    </div>
  </section>;
}

export function PolicyArticlePage({ policies = publicPolicies }) {
  const { slug, version } = useParams();
  const policy = findPolicy(slug, version, policies);
  if (policy) return <PolicyArticle policy={policy} versioned={Boolean(version)} />;
  return isUnpublishedPolicyPath(slug, version) ? <PolicyUnpublished /> : <PolicyNotFound />;
}

// P34 owns AppRoutes registration. Insert this route fragment inside its public Routes tree.
export const publicPolicyRouteElements = <>
    <Route path="/policies" element={<PolicyIndexPage />} />
    <Route path="/policies/:slug" element={<PolicyArticlePage />} />
    <Route path="/policies/:slug/:version" element={<PolicyArticlePage />} />
</>;
