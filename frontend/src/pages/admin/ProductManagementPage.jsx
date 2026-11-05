import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Dialog, Notice, Pagination } from '../../components/ui/index.js';
import { ProductPhoto } from '../../components/product/ProductPhoto.jsx';
import { ProductImageManager } from '../../components/product/ProductImageManager.jsx';
import { adminProductPhotoUrl } from '../../utils/product-photo.js';
import { PRODUCT_CATEGORY_LABELS, PRODUCT_PET_LABELS } from '../../constants/product-labels.js';
import {
  PRICE_INPUT_MAX_LENGTH, PRODUCT_FORM_LIMITS, PRODUCT_MANAGEMENT_TEXT as TEXT, PRODUCT_PAGE_SIZE
} from '../../constants/product-management.js';
import { formatPriceInput, formatVnd, isUncertainOutcome, parsePriceInput, productErrorText, productMessage } from '../../utils/product-format.js';
import '../../components/product/product-shop.css';
import './product-management.css';

const SEARCH_DELAY_MS = 300;
const LIMIT_OF = { name: PRODUCT_FORM_LIMITS.nameMax, description: PRODUCT_FORM_LIMITS.descriptionMax };

// The text for a field the API or the form rejected: MSG01 for a missing value, MSG113 for a bad price,
// and its own sentence for a price over the limit (MSG113 would be wrong there).
function reasonText(field, reason) {
  if (field === 'sellingPrice') return reason === 'TOO_LARGE' ? TEXT.priceTooLarge : productMessage('MSG113');
  if (reason === 'TOO_LONG') return `Tối đa ${LIMIT_OF[field]} ký tự.`;
  return productMessage('MSG01');
}

function validate(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'REQUIRED';
  if (!values.category) errors.category = 'REQUIRED';
  if (!values.petType) errors.petType = 'REQUIRED';
  const price = parsePriceInput(values.price);
  if (price.error) errors.sellingPrice = price.error;
  return errors;
}

function failureText(error) {
  if (error?.code === 'FORBIDDEN') return TEXT.noPermission;
  if (error?.code === 'PRODUCT_CODES_EXHAUSTED') return TEXT.codesExhausted;
  if (error?.code === 'RESOURCE_NOT_FOUND') return 'Không tìm thấy sản phẩm này.';
  return productErrorText(error);
}

function Field({ id, label, error, children }) {
  return <div className="pwc-pm-field">
    <label className="pwc-shop-label" htmlFor={id}>{label}</label>
    {children}
    {error && <p className="pwc-pm-field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

// Create and edit share one form. The code is the system's, the stock is not here, and nothing can be deleted.
function ProductForm({ product, api, onSaved, onReload, onRefresh, onClose }) {
  const creating = !product;
  const [values, setValues] = useState(() => ({
    name: product?.name ?? '', category: product?.category ?? '', petType: product?.petType ?? '',
    price: formatPriceInput(product?.sellingPrice), description: product?.description ?? '', visible: product?.visible ?? false
  }));
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const lock = useRef(false);
  const change = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  const errorOf = (field) => (errors[field] ? reasonText(field, errors[field]) : undefined);
  const invalidProps = (field) => (errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${field}-error` } : {});
  const dirty = product && (values.name !== product.name || values.category !== product.category || values.petType !== product.petType
    || values.price !== formatPriceInput(product.sellingPrice) || values.description !== product.description || values.visible !== product.visible);

  async function save() {
    if (lock.current || photoBusy) return;
    lock.current = true; setSaving(true); setConfirmHide(false); setFailure(null);
    try {
      const fields = {
        name: values.name, category: values.category, petType: values.petType,
        sellingPrice: parsePriceInput(values.price).value, description: values.description
      };
      const saved = creating ? await api.createProduct(fields)
        : await api.updateProduct(product.id, { version: product.version, ...fields, visible: values.visible });
      onSaved(saved, { created: creating });
    } catch (error) {
      if (error?.code === 'VALIDATION_FAILED' && error.fields) setErrors(error.fields);
      else if (error?.code === 'VERSION_CONFLICT') setFailure({ text: TEXT.versionConflict, conflict: true });
      else {
        setFailure({ text: failureText(error) });
        // The answer may have been lost: show what the backend now holds.
        if (isUncertainOutcome(error)) onRefresh();
      }
    } finally { lock.current = false; setSaving(false); }
  }

  function submit(event) {
    event.preventDefault();
    if (lock.current || photoBusy) return;
    const found = validate(values);
    setErrors(found); setFailure(null);
    if (Object.keys(found).length > 0) return;
    // Hiding takes the product off the shop, so the Admin confirms first (MSG114).
    if (product?.visible && !values.visible) { setConfirmHide(true); return; }
    save();
  }

  return <aside className="pwc-shop-panel pwc-pm-form" aria-label={creating ? 'Thêm sản phẩm' : `Sửa sản phẩm ${product.code}`}>
    <div className="pwc-pm-form-header">
      <h2>{creating ? 'Thêm sản phẩm' : `Sửa sản phẩm ${product.code}`}</h2>
      <Button variant="ghost" onClick={onClose}>Đóng</Button>
    </div>
    <form onSubmit={submit} noValidate>
      <fieldset className="pwc-pm-edit-fields" disabled={saving || photoBusy}>
      <Field id="pm-code" label="Mã sản phẩm">
        <input id="pm-code" className="pwc-shop-field" readOnly value={product?.code ?? ''} placeholder={creating ? TEXT.codeOnSave : undefined} />
      </Field>
      <Field id="pm-name" label="Tên sản phẩm" error={errorOf('name')}>
        <input id="pm-name" className="pwc-shop-field" value={values.name} maxLength={PRODUCT_FORM_LIMITS.nameMax} autoComplete="off"
          onChange={change('name')} {...invalidProps('name')} />
      </Field>
      <Field id="pm-category" label="Danh mục" error={errorOf('category')}>
        <select id="pm-category" className="pwc-shop-field" value={values.category} onChange={change('category')} {...invalidProps('category')}>
          <option value="">Chọn danh mục</option>
          {Object.entries(PRODUCT_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </Field>
      <Field id="pm-pet" label="Dành cho" error={errorOf('petType')}>
        <select id="pm-pet" className="pwc-shop-field" value={values.petType} onChange={change('petType')} {...invalidProps('petType')}>
          <option value="">Chọn loại thú cưng</option>
          {Object.entries(PRODUCT_PET_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </Field>
      <Field id="pm-price" label="Giá bán (đ)" error={errorOf('sellingPrice')}>
        <input id="pm-price" className="pwc-shop-field" inputMode="numeric" autoComplete="off" value={values.price}
          maxLength={PRICE_INPUT_MAX_LENGTH} onChange={change('price')} {...invalidProps('sellingPrice')} />
      </Field>
      <Field id="pm-description" label="Mô tả" error={errorOf('description')}>
        <textarea id="pm-description" className="pwc-shop-field" rows={4} value={values.description}
          maxLength={PRODUCT_FORM_LIMITS.descriptionMax} onChange={change('description')} {...invalidProps('description')} />
      </Field>
      {product && <ProductImageManager product={product} api={api} disabled={saving || Boolean(dirty)} onSaved={onSaved} onBusy={setPhotoBusy} onReload={onReload} />}
      {creating && <p className="pwc-shop-hint">Lưu sản phẩm trước, sau đó thêm ảnh trong màn sửa.</p>}
      <label className="pwc-pm-switch">
        <input type="checkbox" role="switch" checked={values.visible} disabled={creating || saving}
          onChange={(event) => setValues((current) => ({ ...current, visible: event.target.checked }))} />
        <span>Hiện trên trang Sản phẩm</span>
      </label>
      {creating && <p className="pwc-shop-hint">{TEXT.hiddenOnCreate}</p>}
      {failure && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{failure.text}
        {failure.conflict && <> <button type="button" className="pwc-shop-link-button" onClick={onReload}>Tải lại</button></>}</p>}
      <button type="submit" className="pwc-shop-primary-button" disabled={saving}>{creating ? 'Lưu sản phẩm' : 'Lưu thay đổi'}</button>
      </fieldset>
    </form>
    {confirmHide && <Dialog open onClose={() => setConfirmHide(false)} title="Ẩn sản phẩm" intent="destructive"
      description={productMessage('MSG114', { product: product.name })}
      footer={<>
        <Button variant="secondary" onClick={() => setConfirmHide(false)}>Không ẩn</Button>
        <Button variant="danger" onClick={save}>Ẩn sản phẩm</Button>
      </>} />}
  </aside>;
}

// Product Management for Admin. The backend owns the code, the stock and every rule; this page only asks for them.
export function ProductManagementPage({ api }) {
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [petType, setPetType] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const load = useCallback(({ signal }) =>
    api.listProducts({ search, category, petType, page, limit: PRODUCT_PAGE_SIZE }, { signal }), [api, search, category, petType, page]);
  const resource = useApiResource(load);
  const products = resource.data ?? [];
  const pageMeta = resource.meta?.page;
  const filtered = Boolean(search || category || petType);

  function filterBy(setter) {
    return (event) => { setter(event.target.value); setPage(1); setNotice(null); };
  }
  function saved(product, { created }) {
    setEditing({ product });
    setNotice({ kind: 'ok', text: productMessage('MSG115', { code: product.code }) });
    // A new code is the highest, so it is on the last page of the unfiltered list.
    if (created && !filtered) setPage(Math.max(1, Math.ceil(((pageMeta?.total ?? 0) + 1) / PRODUCT_PAGE_SIZE)));
    resource.retry();
  }
  async function reload() {
    try {
      setEditing({ product: await api.readProduct(editing.product.id) });
      setNotice(null);
      resource.retry();
    } catch (error) {
      setNotice({ kind: 'error', text: failureText(error) });
    }
  }

  return <section className="pwc-shop" aria-labelledby="product-management-title">
    <div className="pwc-pm-header">
      <div>
        <h1 id="product-management-title">Sản phẩm</h1>
        <p className="pwc-shop-lead">Tạo và sửa sản phẩm của cửa hàng, chọn hiện hoặc ẩn sản phẩm trên trang Sản phẩm.</p>
      </div>
      <button type="button" className="pwc-shop-primary-button pwc-pm-add" onClick={() => { setEditing({ product: null }); setNotice(null); }}>+ Thêm sản phẩm</button>
    </div>
    <div className="pwc-pm-filters">
      <input type="search" className="pwc-shop-search" value={searchText} maxLength={100}
        aria-label="Tìm theo tên hoặc mã sản phẩm" placeholder="Tìm theo tên hoặc mã sản phẩm"
        onChange={(event) => setSearchText(event.target.value)} />
      <select className="pwc-shop-field" aria-label="Lọc theo danh mục" value={category} onChange={filterBy(setCategory)}>
        <option value="">Tất cả danh mục</option>
        {Object.entries(PRODUCT_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select className="pwc-shop-field" aria-label="Lọc theo loại thú cưng" value={petType} onChange={filterBy(setPetType)}>
        <option value="">Tất cả thú cưng</option>
        {Object.entries(PRODUCT_PET_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>
    {notice && <p className={`pwc-shop-alert pwc-shop-alert--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
    <div className="pwc-shop-split">
      <div>
        {resource.status === 'loading' && <Notice state="loading" title="Đang tải sản phẩm…" />}
        {resource.status === 'forbidden' && <Notice state="forbidden" title={TEXT.noPermission} />}
        {resource.status === 'error' && <Notice state="error" title={TEXT.loadFailed}
          action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
        {resource.status === 'empty' && <Notice state="empty" title={productMessage('MSG97')} />}
        {resource.status === 'success' && <div className="pwc-shop-panel pwc-shop-table-wrap">
          <table className="pwc-shop-table pwc-shop-table--wide">
            <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Dành cho</th><th>Giá bán</th><th>Hiển thị</th><th><span className="pwc-visually-hidden">Sửa</span></th></tr></thead>
            <tbody>{products.map((product) => <tr key={product.id} className={product.id === editing?.product?.id ? 'is-selected' : undefined}>
              <td><div className="pwc-shop-line">
                <ProductPhoto product={{ ...product, photos: product.photos.map(adminProductPhotoUrl) }} size="thumb" />
                <div><strong>{product.name}</strong><br /><small>{product.code}</small></div>
              </div></td>
              <td>{PRODUCT_CATEGORY_LABELS[product.category]}</td>
              <td>{PRODUCT_PET_LABELS[product.petType]}</td>
              <td><strong>{formatVnd(product.sellingPrice)}</strong></td>
              <td><span className={`pwc-shop-status ${product.visible ? 'pwc-shop-status--done' : 'pwc-shop-status--muted'}`}>{product.visible ? 'Đang hiện' : 'Đang ẩn'}</span></td>
              <td><button type="button" className="pwc-shop-link-button" aria-label={`Sửa sản phẩm ${product.code}`}
                onClick={() => { setEditing({ product }); setNotice(null); }}>Sửa</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {(resource.status === 'success' || resource.status === 'empty') && pageMeta && <Pagination {...pageMeta} itemLabel="sản phẩm"
          onPageChange={(next) => { setPage(next); setNotice(null); }} />}
      </div>
      {editing && <ProductForm key={editing.product ? `${editing.product.id}:${editing.product.version}` : 'new'} product={editing.product}
        api={api} onSaved={saved} onReload={reload} onRefresh={resource.retry} onClose={() => setEditing(null)} />}
    </div>
  </section>;
}
