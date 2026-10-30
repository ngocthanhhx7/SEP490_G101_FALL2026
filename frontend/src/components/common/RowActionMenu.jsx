import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export function RowActionMenu({ label, actions }) {
  const trigger = useRef(null), menu = useRef(null);
  const [position, setPosition] = useState(null);
  useEffect(() => {
    if (!position) return undefined;
    menu.current?.querySelector('button:not(:disabled)')?.focus();
    const close = event => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null); };
    const keyboard = event => {
      if (event.key === 'Escape') { setPosition(null); trigger.current?.focus(); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); const buttons = [...menu.current.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    };
    const scroll = event => {
      if (menu.current?.contains(event.target)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (event.type === 'resize' || !rect || Math.abs(rect.top - position.anchorTop) > 1 || Math.abs(rect.left - position.anchorLeft) > 1) setPosition(null);
    };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', scroll); window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', keyboard); window.removeEventListener('resize', scroll); window.removeEventListener('scroll', scroll, true); };
  }, [position]);
  return <><button className="workspace-icon-button" ref={trigger} type="button" title="Thao tác" aria-label={label} aria-expanded={Boolean(position)} aria-haspopup="menu" onClick={() => {
    const rect = trigger.current.getBoundingClientRect(), height = actions.length * 40 + 14;
    setPosition(position ? null : { top: rect.bottom + height > window.innerHeight ? Math.max(8, rect.top - height) : rect.bottom + 4,
      left: Math.max(8, Math.min(window.innerWidth - 216, rect.right - 208)), anchorTop: rect.top, anchorLeft: rect.left });
  }}><MoreHorizontal size={19} aria-hidden="true" /></button>
    {position && createPortal(<div className="workspace-floating-actions" role="menu" aria-label={label} ref={menu} style={{ top: position.top, left: position.left }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget) && !trigger.current?.contains(event.relatedTarget)) setPosition(null);
    }}>{actions.map(({ label: actionLabel, icon: Icon, onClick, disabled }) => <button type="button" role="menuitem" key={actionLabel} disabled={disabled} onClick={() => { setPosition(null); trigger.current?.focus(); onClick(); }}>
      {Icon && <Icon size={16} aria-hidden="true" />}{actionLabel}</button>)}</div>, document.body)}
  </>;
}
