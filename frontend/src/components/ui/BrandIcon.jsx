const ICON_PATHS = {
  arrowRight: '/assets/icon/arrow/arrow-right.svg',
  refresh: '/assets/icon/arrow/refresh.svg',
};

export function BrandIcon({ name, label, className = '' }) {
  const src = ICON_PATHS[name];
  if (!src) throw new Error('Unknown brand icon');
  return <img src={src} className={`pwc-icon ${className}`} alt={label || ''}
    aria-hidden={label ? undefined : true} />;
}
