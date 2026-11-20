import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button, Dialog } from '../ui/index.js';
import { usePhoneApp } from '../../hooks/usePhoneApp.js';
import '../../styles/catalog-layout.css';

export function CatalogLayout({ filters, children }) {
  const [initiallyOpen] = useState(() => !globalThis.matchMedia?.('(max-width: 48rem)').matches);
  const compact = usePhoneApp();
  const [open, setOpen] = useState(false);
  return <div className="pwc-catalog-layout">
    {compact ? <div className="pwc-mobile-filters">
      <Button variant="secondary" onClick={() => setOpen(true)}><SlidersHorizontal size={18} aria-hidden="true" /> Bộ lọc</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Tìm kiếm và bộ lọc" className="mobile-flow-dialog">
        {filters}
        <Button onClick={() => setOpen(false)}>Xem kết quả</Button>
      </Dialog>
    </div> : <details className="pwc-catalog-sidebar" open={initiallyOpen}>
      <summary><SlidersHorizontal size={22} aria-hidden="true" /><span>Bộ lọc</span><ChevronDown size={20} aria-hidden="true" /></summary>
      <div className="pwc-catalog-sidebar-body">{filters}</div>
    </details>}
    <div className="pwc-catalog-results">{children}</div>
  </div>;
}
