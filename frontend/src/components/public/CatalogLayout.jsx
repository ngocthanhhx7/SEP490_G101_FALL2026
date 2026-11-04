import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import '../../styles/catalog-layout.css';

export function CatalogLayout({ filters, children }) {
  const [initiallyOpen] = useState(() => !globalThis.matchMedia?.('(max-width: 48rem)').matches);
  return <div className="pwc-catalog-layout">
    <details className="pwc-catalog-sidebar" open={initiallyOpen}>
      <summary><SlidersHorizontal size={22} aria-hidden="true" /><span>Bộ lọc</span><ChevronDown size={20} aria-hidden="true" /></summary>
      <div className="pwc-catalog-sidebar-body">{filters}</div>
    </details>
    <div className="pwc-catalog-results">{children}</div>
  </div>;
}
