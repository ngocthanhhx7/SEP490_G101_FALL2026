import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Ephemeral action feedback toast: auto-hides after durationMs, pauses on hover/focus, and supports manual dismissal.
export function Toast({ message, onClose, durationMs = 5000, closeLabel = 'Đóng thông báo' }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => { setPaused(false); }, [message]);
  useEffect(() => {
    if (!message || paused || !durationMs || durationMs <= 0) return undefined;
    const timer = window.setTimeout(() => { onClose?.(); }, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, paused, durationMs, onClose]);

  if (!message) return null;

  return <div className="pwc-toast-region" aria-live="polite" aria-atomic="true">
    <div
      className="pwc-toast"
      role="status"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
    >
      <span className="pwc-toast__message">{message}</span>
      {onClose && <button type="button" className="pwc-toast__close" title={closeLabel} aria-label={closeLabel} onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>}
    </div>
  </div>;
}
