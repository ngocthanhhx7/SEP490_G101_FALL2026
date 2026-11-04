import { Minus, Plus } from 'lucide-react';
import './product-shop.css';

// By default the + button locks at max. With onLimit it stays pressable at max and calls onLimit instead,
// so the page can tell the customer why the number does not go up (MSG58, D-219).
export function QuantityStepper({ value, max, onChange, onLimit, disabled = false, label = 'Số lượng' }) {
  const upper = Math.max(1, Math.min(99, max));
  const atLimit = value >= upper;
  return <div className="pwc-shop-stepper" role="group" aria-label={label}>
    <button type="button" aria-label="Giảm số lượng" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}><Minus aria-hidden="true" /></button>
    <output aria-live="polite" aria-label={label}>{value}</output>
    <button type="button" aria-label="Tăng số lượng" disabled={disabled || (atLimit && !onLimit)} aria-disabled={atLimit && onLimit ? true : undefined}
      onClick={() => (atLimit ? onLimit?.() : onChange(value + 1))}><Plus aria-hidden="true" /></button>
  </div>;
}
