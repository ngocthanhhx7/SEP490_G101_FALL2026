export function BrandLogo({ orientation = 'horizontal', alt = 'Paw World Care', className = '' }) {
  const vertical = orientation === 'vertical';
  return <img className={`pwc-logo ${vertical ? 'pwc-logo--vertical' : ''} ${className}`}
    src={`/assets/logo/${vertical ? 'doc' : 'ngang'}.svg`} alt={alt} />;
}
