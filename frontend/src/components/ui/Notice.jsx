import { useId } from 'react';

const STATES = ['info', 'success', 'warning', 'error', 'loading', 'empty', 'forbidden', 'pending'];
export function Notice({ state = 'info', title, children, action, className = '' }) {
  const titleId = useId();
  const safeState = STATES.includes(state) ? state : 'info';
  return <section className={`pwc-notice pwc-notice--${safeState} ${className}`}
    role={['error', 'forbidden'].includes(safeState) ? 'alert' : 'status'}
    aria-labelledby={titleId} aria-atomic="true">
    <h3 id={titleId}>{title}</h3>
    {children && <div>{children}</div>}
    {action && <div className="pwc-notice-action">{action}</div>}
  </section>;
}
