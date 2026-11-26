import { Check } from 'lucide-react';

// A choice drawn as a pill: a real checkbox or radio, so keyboard and screen reader behave as for any form control.
export function GroomingChip({ type = 'checkbox', name, checked, disabled = false, describedBy, onChange, children }) {
  return <label className={`grooming-chip${checked ? ' is-on' : ''}${disabled ? ' is-off' : ''}`}>
    <input type={type} name={name} checked={checked} disabled={disabled} aria-describedby={describedBy} onChange={onChange} />
    {checked && <Check size={14} aria-hidden="true" />}<span>{children}</span>
  </label>;
}
