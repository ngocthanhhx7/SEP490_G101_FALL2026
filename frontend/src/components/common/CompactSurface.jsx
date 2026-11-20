import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CompactEmpty({ icon: Icon, title, children, action }) {
  return <div className="pwc-compact-empty">
    <span className="pwc-compact-icon"><Icon size={22} aria-hidden="true" /></span>
    <h2>{title}</h2>
    {children && <p>{children}</p>}
    {action}
  </div>;
}

export function CompactRow({ icon: Icon, to, children }) {
  return <Link className="pwc-compact-row" to={to}>
    <span className="pwc-compact-icon"><Icon size={18} aria-hidden="true" /></span>
    <strong>{children}</strong>
    <ChevronRight size={18} aria-hidden="true" />
  </Link>;
}
