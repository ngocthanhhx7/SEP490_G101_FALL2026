import { Minus, Plus } from 'lucide-react';
import './product-shop.css';

export function QuantityStepper({ value, max, onChange, disabled = false, label = 'Số lượng' }) {
  const upper = Math.max(1, max);
  return <div className="pwc-shop-stepper" role="group" aria-label={label}>
    <button type="button" aria-label="Giảm số lượng" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}><Minus aria-hidden="true" /></button>
    <output aria-live="polite" aria-label={label}>{value}</output>
    <button type="button" aria-label="Tăng số lượng" disabled={disabled || value >= upper} onClick={() => onChange(value + 1)}><Plus aria-hidden="true" /></button>
  </div>;
}
