export function FieldFrame({ id, label, hint, error, required, children }) {
  return <div className="pwc-field">
    <label className="pwc-label" htmlFor={id}>{label}
      {required && <span aria-hidden="true"> *</span>}
    </label>
    {hint && <p className="pwc-hint" id={`${id}-hint`}>{hint}</p>}
    {children}
    {error && <p className="pwc-field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}
