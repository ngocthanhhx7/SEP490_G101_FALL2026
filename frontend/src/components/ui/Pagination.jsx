import { Button } from './Button.jsx';

// "Hiển thị 21–40 trên 57 sản phẩm" with Trước / Sau. The page and the total come from the backend (meta.page, meta.total),
// so the same control serves every paged Admin list. Renders nothing while the list has no rows.
export function Pagination({ page, limit, total, itemLabel = 'mục', onPageChange, disabled = false, className = '' }) {
  if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) return null;
  const pages = Math.ceil(total / limit);
  const from = Math.min((page - 1) * limit + 1, total);
  const to = Math.min(page * limit, total);
  return <nav className={`pwc-pagination ${className}`} aria-label="Phân trang">
    <p className="pwc-pagination-summary" role="status">Hiển thị {from}–{to} trên {total} {itemLabel}</p>
    <div className="pwc-pagination-actions">
      <Button variant="secondary" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>Trước</Button>
      <span className="pwc-pagination-position" aria-current="page">Trang {Math.min(page, pages)}/{pages}</span>
      <Button variant="secondary" disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)}>Sau</Button>
    </div>
  </nav>;
}
