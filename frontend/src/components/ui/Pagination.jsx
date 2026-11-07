import { paginationPages } from '../../utils/pagination.js';

function Arrow({ backwards = false, double = false }) {
  return <span className={`pwc-page-arrow${backwards ? ' is-backwards' : ''}`} aria-hidden="true">
    {double ? <><img src="/assets/figma-shop/pagination-arrow.svg" alt="" /><img src="/assets/figma-shop/pagination-arrow.svg" alt="" /></>
      : <img src="/assets/figma-shop/pagination-next.svg" alt="" />}
  </span>;
}
export function PageControls({ page, pages, onPageChange, disabled = false, onPrevious, onNext, onFirst,
  hasNext, previousDisabled = false, nextDisabled = false, previousLabel = 'Trước', nextLabel = 'Sau' }) {
  const numbered = Number.isSafeInteger(pages) && pages > 0;
  return <div className="pwc-pagination-actions">
    <button type="button" aria-label="Trang đầu" title="Trang đầu" disabled={disabled || previousDisabled || page <= 1 || (!numbered && !onFirst)}
      onClick={() => numbered ? onPageChange(1) : onFirst()}><Arrow backwards double /></button>
    <button type="button" aria-label={previousLabel} title="Trang trước" disabled={disabled || previousDisabled || page <= 1 || (!numbered && !onPrevious)}
      onClick={() => numbered ? onPageChange(Math.min(page - 1, pages)) : onPrevious()}><Arrow backwards /></button>
    {(numbered ? paginationPages(page, pages) : [page]).map((value, index) => typeof value === 'number'
      ? <button key={value} type="button" data-page={value} aria-label={`Trang ${value}`}
          aria-current={page === value ? 'page' : undefined} disabled={disabled || !numbered}
          onClick={() => onPageChange(value)}>{value}</button>
      : <span className="pwc-pagination-gap" aria-hidden="true" key={`gap-${index}`}>…</span>)}
    <button type="button" aria-label={nextLabel} title="Trang sau" disabled={disabled || nextDisabled || (numbered ? page >= pages : !hasNext)}
      onClick={() => numbered ? onPageChange(page + 1) : onNext()}><Arrow /></button>
    {numbered && <button type="button" aria-label="Trang cuối" title="Trang cuối" disabled={disabled || page === pages}
      onClick={() => onPageChange(pages)}><Arrow double /></button>}
    <span className="pwc-visually-hidden">{numbered ? page > pages ? 'Trang hiện tại không còn dữ liệu' : `Trang ${page}/${pages}` : `Trang ${page}`}</span>
  </div>;
}
export function Pagination({ page, limit, total, itemLabel = 'mục', onPageChange, disabled = false, className = '' }) {
  if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) return null;
  const pages = Math.ceil(total / limit), outside = page > pages;
  return <nav className={`pwc-pagination ${className}`} aria-label="Phân trang">
    <p className="pwc-pagination-summary" role="status">Hiển thị {outside ? 0 : (page - 1) * limit + 1}–{outside ? 0 : Math.min(page * limit, total)} trên {total} {itemLabel}</p>
    <PageControls page={page} pages={pages} onPageChange={onPageChange} disabled={disabled} />
  </nav>;
}
// Cursor APIs do not promise a total or allow jumping to an unseen last page.
export function CursorPagination({ page = 1, label = 'danh sách', summary, ...controls }) {
  return <nav className="pwc-pagination" aria-label={`Phân trang ${label}`}>
    {summary && <p className="pwc-pagination-summary" role="status">{summary}</p>}
    <PageControls page={page} {...controls} />
  </nav>;
}
