import { useEffect, useId, useRef } from 'react';
import { Button } from './Button.jsx';

// Browser-native modal owns focus containment, background inertness and restoration.
export function Dialog({ open, onClose, title, description, children, footer,
  intent = 'default', dismissible = true, closeLabel = 'Đóng', className = '' }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  return <dialog ref={dialogRef} className={`pwc-dialog ${className}`}
    role={intent === 'destructive' ? 'alertdialog' : undefined}
    aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); if (dismissible) onClose('escape'); }}
    onClose={() => { if (open && !dialogRef.current.open) onClose('native'); }}>
    <div className="pwc-dialog-header"><h2 id={titleId}>{title}</h2>
      {dismissible && <Button variant="ghost" onClick={() => onClose('button')}>{closeLabel}</Button>}
    </div>
    {description && <p id={descriptionId}>{description}</p>}
    <div className="pwc-dialog-content">{children}</div>
    {footer && <div className="pwc-dialog-footer">{footer}</div>}
  </dialog>;
}
