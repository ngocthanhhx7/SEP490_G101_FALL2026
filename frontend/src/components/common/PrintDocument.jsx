import { createPortal } from 'react-dom';
import './print-document.css';
export function PrintDocument({ children }) {
  return createPortal(<div className="pwc-print-document">{children}</div>, window.document.body);
}
