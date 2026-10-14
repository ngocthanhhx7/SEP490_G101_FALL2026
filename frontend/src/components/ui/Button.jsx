export function Button({ children, variant = 'primary', loading = false,
  loadingLabel = 'Đang xử lý…', disabled = false, type = 'button', className = '', ...props }) {
  const safeVariant = ['primary', 'secondary', 'ghost', 'danger'].includes(variant) ? variant : 'primary';
  return <button {...props} type={type} className={`pwc-button pwc-button--${safeVariant} ${className}`}
    disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading ? loadingLabel : children}
  </button>;
}
