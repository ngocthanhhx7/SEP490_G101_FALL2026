import { useMemo, useState } from 'react';
import { Link, Route, useParams } from 'react-router-dom';
import { findPolicy, policyHref, publicPolicies } from './policy-catalog.js';
import './public-policies.css';

function DraftNotice() {
  return <aside className="policy-draft-notice" aria-label="Trạng thái rà soát chính sách">
    <strong>Bản dự thảo — chưa có hiệu lực</strong>
    <span>Nội dung cần người có thẩm quyền rà soát và phê duyệt. Chưa có xác nhận pháp lý.</span>
  </aside>;
}

function PolicyCard({ policy }) {
  return <li className="policy-card">
    <div>
      <p className="policy-card__version">Phiên bản {policy.version}</p>
      <h2><Link to={policyHref(policy)}>{policy.title}</Link></h2>
      <p>{policy.summary}</p>
      <p className="policy-card__purpose"><strong>Mục đích:</strong> {policy.purpose}</p>
    </div>
    <Link className="policy-card__action" to={policyHref(policy)} aria-label={`Đọc ${policy.title}`}>
      Đọc chính sách <span aria-hidden="true">→</span>
    </Link>
  </li>;
}

export function PolicyIndexPage() {
  const [query, setQuery] = useState('');
  const filteredPolicies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    if (!normalizedQuery) return publicPolicies;
    return publicPolicies.filter(policy => {
      const bodyText = policy.sections.flatMap(section => [section.heading, ...(section.paragraphs || []), ...(section.items || [])]);
      return [policy.title, policy.summary, policy.purpose, policy.keywords, ...bodyText]
        .join(' ').toLocaleLowerCase('vi').includes(normalizedQuery);
    });
  }, [query]);

  return <section className="public-policies" aria-labelledby="policy-index-title">
    <nav className="policy-breadcrumbs" aria-label="Đường dẫn">
      <Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span>Chính sách</span>
    </nav>
    <header className="policy-page-header">
      <p className="policy-eyebrow">Paw World Care · Thông tin công khai</p>
      <h1 id="policy-index-title">Chính sách &amp; hướng dẫn</h1>
      <p>Tìm hiểu cách Paw World Care dự kiến vận hành dịch vụ, bảo vệ thông tin và hỗ trợ các bên.</p>
    </header>
    <DraftNotice />
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
    <p className="policy-source-note">Các phiên bản trên là fixture nội dung tĩnh của P45. Chưa đồng bộ với hệ thống quản trị chính sách hoặc API sản phẩm.</p>
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
        <DraftNotice />
        <dl className="policy-metadata">
          <div><dt>Mục đích</dt><dd>{policy.purpose}</dd></div>
          <div><dt>Phiên bản</dt><dd>{policy.version}</dd></div>
          <div><dt>Ngày dự thảo</dt><dd>{policy.proposedAt}</dd></div>
          <div><dt>Ngày hiệu lực</dt><dd>{policy.effectiveDate}</dd></div>
        </dl>
        <div className="policy-version-row">
          <span>{versioned ? 'Đường dẫn phiên bản cố định:' : 'Phiên bản hiện hành trong bản dự thảo:'}</span>
          <Link to={policyHref(policy, true)} aria-current={versioned ? 'page' : undefined}>
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
          <p>Ngày hiệu lực sẽ được cập nhật sau khi nội dung và phiên bản được phê duyệt.</p>
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

export function PolicyArticlePage() {
  const { slug, version } = useParams();
  const policy = findPolicy(slug, version);
  return policy ? <PolicyArticle policy={policy} versioned={Boolean(version)} /> : <PolicyNotFound />;
}

// P34 owns AppRoutes registration. Insert this route fragment inside its public Routes tree.
export const publicPolicyRouteElements = <>
    <Route path="/policies" element={<PolicyIndexPage />} />
    <Route path="/policies/:slug" element={<PolicyArticlePage />} />
    <Route path="/policies/:slug/:version" element={<PolicyArticlePage />} />
</>;
