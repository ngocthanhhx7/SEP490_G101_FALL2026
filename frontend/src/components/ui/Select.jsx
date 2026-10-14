import { useId } from 'react';
import { FieldFrame } from './FieldFrame.jsx';

export function Select({ id: suppliedId, label, hint, error, required = false,
  className = '', children, 'aria-describedby': describedBy, ...props }) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  const descriptions = [describedBy, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return <FieldFrame {...{ id, label, hint, error, required }}>
    <select {...props} id={id} required={required} className={`pwc-control ${className}`}
      aria-invalid={error ? true : props['aria-invalid']}
      aria-describedby={descriptions || undefined}>{children}</select>
  </FieldFrame>;
}
