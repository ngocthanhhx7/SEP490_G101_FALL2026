import { useCallback, useRef, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Dialog, Notice, Pagination } from '../../components/ui/index.js';
import { ProductPicker } from '../../components/product/ProductPicker.jsx';
import {
  SUPPLIER_FORM_LIMITS, SUPPLIER_MANAGEMENT_TEXT as TEXT, SUPPLIER_PHONE_INPUT_MAX_LENGTH, SUPPLIER_STATUS_LABELS, SUPPLIER_TABS
} from '../../constants/supplier-management.js';
import { PRODUCT_PAGE_SIZE } from '../../constants/product-management.js';
import { formatPhone, isUncertainOutcome, productErrorText, productMessage } from '../../utils/product-format.js';
import { parseSupplierEmailInput, parseSupplierPhoneInput, validateSupplierForm } from '../../utils/supplier-validation.js';
import '../../components/product/product-shop.css';
import './product-management.css';

const LIMIT_OF = { name: SUPPLIER_FORM_LIMITS.nameMax, contactName: SUPPLIER_FORM_LIMITS.contactNameMax };

// The text for a field the API or the form rejected. MSG125 is shown once, under the phone number, for both fields.
function reasonText(field, reason) {
  if (reason === 'CONTACT_REQUIRED') return field === 'phone' ? productMessage('MSG125') : undefined;
  if (field === 'phone') return productMessage('MSG03');
  if (field === 'email') return productMessage('MSG02');
  if (field === 'productIds') return TEXT.tooManyProducts;
  if (field === 'name' && reason === 'DUPLICATE') return productMessage('MSG116');
  if (reason === 'TOO_LONG') return `Tối đa ${LIMIT_OF[field]} ký tự.`;
  return productMessage('MSG01');
}

function failureText(error) {
  if (error?.code === 'FORBIDDEN') return TEXT.noPermission;
  if (error?.code === 'RESOURCE_NOT_FOUND') return TEXT.notFound;
  if (error?.code === 'PRODUCT_NOT_FOUND') return TEXT.productNotFound;
  if (error?.code === 'SUPPLIER_STATE_CONFLICT') return TEXT.stateConflict;
  return productErrorText(error);
}

function Field({ id, label, error, children }) {
  return <div className="pwc-pm-field">
    <label className="pwc-shop-label" htmlFor={id}>{label}</label>
    {children}
    {error && <p className="pwc-pm-field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

const initialValues = (supplier) => ({
  name: supplier?.name ?? '', contactName: supplier?.contactName ?? '', phone: supplier?.phone ? formatPhone(supplier.phone) : '',
  email: supplier?.email ?? '', products: supplier?.products ?? []
});
const sameProducts = (a, b) => a.length === b.length && a.every((product, index) => product.id === b[index].id);

// Create and edit share one form. The backend owns the name check, the contact rule and the status.
function SupplierForm({ supplier, api, productApi, onSaved, onChanged, onReload, onRefresh, onClose }) {
  const creating = !supplier;
  const [values, setValues] = useState(() => initialValues(supplier));
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const lock = useRef(false);
  const start = initialValues(supplier);
  const dirty = values.name !== start.name || values.contactName !== start.contactName || values.phone !== start.phone
    || values.email !== start.email || !sameProducts(values.products, start.products);
  const change = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  const errorOf = (field) => (errors[field] ? reasonText(field, errors[field]) : undefined);
  const invalidProps = (field) => (errors[field] ? { 'aria-invalid': true, 'aria-describedby': `supplier-${field}-error` } : {});

  // Runs one call at a time; resolves to nothing, putting the reason on the form when the call fails.
  async function run(operation, done) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailure(null); setConfirmStop(false);
    try {
      done(await operation());
    } catch (error) {
      if (error?.code === 'VALIDATION_FAILED' && error.fields) setErrors(error.fields);
      else if (error?.code === 'SUPPLIER_NAME_TAKEN') setErrors({ name: 'DUPLICATE' });
      else if (error?.code === 'VERSION_CONFLICT') setFailure({ text: TEXT.versionConflict, reload: true });
      else if (error?.code === 'SUPPLIER_STATE_CONFLICT') setFailure({ text: TEXT.stateConflict, reload: true });
      else {
        setFailure({ text: failureText(error) });
        // The answer may have been lost: show what the backend now holds.
        if (isUncertainOutcome(error)) onRefresh();
      }
    } finally { lock.current = false; setBusy(false); }
  }

  function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    const found = validateSupplierForm(values);
    setErrors(found); setFailure(null);
    if (Object.keys(found).length > 0) return;
    const fields = {
      name: values.name, contactName: values.contactName, phone: parseSupplierPhoneInput(values.phone).value,
      email: parseSupplierEmailInput(values.email).value, productIds: values.products.map((product) => product.id)
    };
    run(() => (creating ? api.createSupplier(fields) : api.updateSupplier(supplier.id, { version: supplier.version, ...fields })),
      (saved) => onSaved(saved, { created: creating }));
  }

  return <aside className="pwc-shop-panel pwc-pm-form" aria-label={creating ? 'Thêm nhà cung cấp' : 'Sửa nhà cung cấp'}>
    <div className="pwc-pm-form-header">
      <h2>{creating ? 'Thêm nhà cung cấp' : 'Sửa nhà cung cấp'}</h2>
      <Button variant="ghost" onClick={onClose}>Đóng</Button>
    </div>
    <form onSubmit={submit} noValidate>
      <Field id="supplier-name" label="Tên nhà cung cấp" error={errorOf('name')}>
        <input id="supplier-name" className="pwc-shop-field" value={values.name} maxLength={SUPPLIER_FORM_LIMITS.nameMax} autoComplete="off"
          onChange={change('name')} {...invalidProps('name')} />
      </Field>
      <Field id="supplier-contactName" label="Người liên hệ" error={errorOf('contactName')}>
        <input id="supplier-contactName" className="pwc-shop-field" value={values.contactName} maxLength={SUPPLIER_FORM_LIMITS.contactNameMax}
          autoComplete="off" onChange={change('contactName')} {...invalidProps('contactName')} />
      </Field>
      <Field id="supplier-phone" label="Số điện thoại" error={errorOf('phone')}>
        <input id="supplier-phone" className="pwc-shop-field" inputMode="tel" autoComplete="off" value={values.phone}
          maxLength={SUPPLIER_PHONE_INPUT_MAX_LENGTH} onChange={change('phone')} {...invalidProps('phone')} />
      </Field>
      <Field id="supplier-email" label="Email" error={errorOf('email')}>
        <input id="supplier-email" className="pwc-shop-field" type="email" autoComplete="off" value={values.email}
          maxLength={SUPPLIER_FORM_LIMITS.emailMax} onChange={change('email')} {...invalidProps('email')} />
      </Field>
      <div className="pwc-pm-field">
        <span className="pwc-shop-label">Sản phẩm cung cấp</span>
        <ProductPicker productApi={productApi} selected={values.products} max={SUPPLIER_FORM_LIMITS.productsMax} disabled={busy}
          onChange={(products) => setValues((current) => ({ ...current, products }))} />
        {errors.productIds && <p className="pwc-pm-field-error">{errorOf('productIds')}</p>}
      </div>
      {failure && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{failure.text}
        {failure.reload && <> <button type="button" className="pwc-shop-link-button" onClick={onReload}>Tải lại</button></>}</p>}
      <button type="submit" className="pwc-shop-primary-button" disabled={busy}>{creating ? 'Lưu nhà cung cấp' : 'Lưu thay đổi'}</button>
    </form>
    {!creating && supplier.status === 'ACTIVE' && <>
      <button type="button" className="pwc-shop-outline-button pwc-pm-status" disabled={busy || dirty} onClick={() => setConfirmStop(true)}>Ngừng hợp tác</button>
      {dirty && <p className="pwc-shop-hint">{TEXT.saveFirst}</p>}
    </>}
    {!creating && supplier.status === 'STOPPED' && <>
      <button type="button" className="pwc-shop-outline-button pwc-pm-status" disabled={busy || dirty}
        onClick={() => run(() => api.resumeSupplier(supplier.id, supplier.version), onChanged)}>Hợp tác lại</button>
      {dirty && <p className="pwc-shop-hint">{TEXT.saveFirst}</p>}
    </>}
    {confirmStop && <Dialog open onClose={() => setConfirmStop(false)} title="Ngừng hợp tác" intent="destructive"
      description={productMessage('MSG118', { supplier: supplier.name })}
      footer={<>
        <Button variant="secondary" onClick={() => setConfirmStop(false)}>Không ngừng</Button>
        <Button variant="danger" onClick={() => run(() => api.stopSupplier(supplier.id, supplier.version), onChanged)}>Ngừng hợp tác</Button>
      </>} />}
  </aside>;
}

// Supplier Management for Admin. The backend owns the rules; this page only asks for them and shows its answer.
export function SupplierManagementPage({ api, productApi }) {
  const [tab, setTab] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(({ signal }) => api.listSuppliers({ status: tab, page, limit: PRODUCT_PAGE_SIZE }, { signal }), [api, tab, page]);
  const resource = useApiResource(load);
  const suppliers = resource.data ?? [];
  const pageMeta = resource.meta?.page;
  const counts = resource.meta?.counts;

  async function open(id) {
    setOpening(true); setNotice(null);
    try {
      setEditing({ supplier: await api.readSupplier(id) });
    } catch (error) {
      setNotice({ kind: 'error', text: failureText(error) });
      if (error?.code === 'RESOURCE_NOT_FOUND') resource.retry();
    } finally { setOpening(false); }
  }
  function saved(supplier) {
    setEditing({ supplier });
    setNotice({ kind: 'ok', text: productMessage('MSG117', { name: supplier.name }) });
    resource.retry();
  }
  async function reload() {
    try {
      setEditing({ supplier: await api.readSupplier(editing.supplier.id) });
      setNotice(null);
      resource.retry();
    } catch (error) {
      setNotice({ kind: 'error', text: failureText(error) });
    }
  }

  return <section className="pwc-shop" aria-labelledby="supplier-management-title">
    <div className="pwc-pm-header">
      <div>
        <h1 id="supplier-management-title">Nhà cung cấp</h1>
        <p className="pwc-shop-lead">Thêm, sửa và ngừng hợp tác với các nhà cung cấp hàng cho cửa hàng.</p>
      </div>
      <button type="button" className="pwc-shop-primary-button pwc-pm-add" onClick={() => { setEditing({ supplier: null }); setNotice(null); }}>+ Thêm nhà cung cấp</button>
    </div>
    <div className="pwc-shop-chip-row" role="group" aria-label="Lọc nhà cung cấp theo trạng thái hợp tác">
      {SUPPLIER_TABS.map(([key, label]) => <button key={key} type="button" className="pwc-shop-chip" aria-pressed={tab === key}
        onClick={() => { setTab(key); setPage(1); setNotice(null); }}>{label}{counts ? ` (${counts[key]})` : ''}</button>)}
    </div>
    {notice && <p className={`pwc-shop-alert pwc-shop-alert--${notice.kind}`} style={{ marginTop: '1rem' }}
      role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
    <div className="pwc-shop-split" style={{ marginTop: '1rem' }}>
      <div>
        {resource.status === 'loading' && <Notice state="loading" title="Đang tải nhà cung cấp…" />}
        {resource.status === 'forbidden' && <Notice state="forbidden" title={TEXT.noPermission} />}
        {resource.status === 'error' && <Notice state="error" title={TEXT.loadFailed}
          action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
        {resource.status === 'empty' && <Notice state="empty" title={TEXT.empty} />}
        {resource.status === 'success' && <div className="pwc-shop-panel pwc-shop-table-wrap">
          <table className="pwc-shop-table pwc-shop-table--wide">
            <thead><tr><th>Nhà cung cấp</th><th>Số điện thoại</th><th>Sản phẩm</th><th>Trạng thái</th><th><span className="pwc-visually-hidden">Sửa</span></th></tr></thead>
            <tbody>{suppliers.map((supplier) => <tr key={supplier.id} className={supplier.id === editing?.supplier?.id ? 'is-selected' : undefined}>
              <td><strong>{supplier.name}</strong>{supplier.contactName && <><br /><small>Người liên hệ: {supplier.contactName}</small></>}</td>
              <td>{supplier.phone ? formatPhone(supplier.phone) : '—'}</td>
              <td>{supplier.productCount} sản phẩm</td>
              <td><span className={`pwc-shop-status ${supplier.status === 'ACTIVE' ? 'pwc-shop-status--done' : 'pwc-shop-status--muted'}`}>{SUPPLIER_STATUS_LABELS[supplier.status]}</span></td>
              <td><button type="button" className="pwc-shop-link-button" disabled={opening} aria-label={`Sửa nhà cung cấp ${supplier.name}`}
                onClick={() => open(supplier.id)}>Sửa</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {(resource.status === 'success' || resource.status === 'empty') && pageMeta && <Pagination {...pageMeta} itemLabel="nhà cung cấp"
          onPageChange={(next) => { setPage(next); setNotice(null); }} />}
      </div>
      {editing && <SupplierForm key={editing.supplier ? `${editing.supplier.id}:${editing.supplier.version}` : 'new'} supplier={editing.supplier}
        api={api} productApi={productApi} onSaved={saved} onChanged={saved} onReload={reload} onRefresh={resource.retry} onClose={() => setEditing(null)} />}
    </div>
  </section>;
}
