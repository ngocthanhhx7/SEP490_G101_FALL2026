import { useEffect, useRef, useState } from 'react';
import { adminProductPhotoUrl } from '../../utils/product-photo.js';
import { isUncertainOutcome } from '../../utils/product-format.js';

const errorText = error => ({
  INVALID_PRODUCT_PHOTO: 'Chọn ảnh JPG, PNG hoặc WebP, tối đa 5 MB và 4 triệu điểm ảnh.',
  PRODUCT_PHOTO_LIMIT: 'Mỗi sản phẩm có tối đa 5 ảnh.', PRODUCT_PHOTO_DUPLICATE: 'Ảnh này đã có trong sản phẩm.',
  MEDIA_BUSY: 'Máy chủ đang xử lý ảnh khác. Vui lòng thử lại.',
  VERSION_CONFLICT: 'Sản phẩm vừa thay đổi. Tải lại trước khi sửa ảnh tiếp.',
  PAYLOAD_TOO_LARGE: 'Ảnh vượt quá dung lượng 5 MB.'
}[error?.code] || 'Chưa lưu được ảnh. Vui lòng kiểm tra và thử lại.');

export function ProductImageManager({ product, api, disabled, onSaved, onBusy, onReload }) {
  const [selection, setSelection] = useState(null), [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(null), [confirmRemove, setConfirmRemove] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
  const live = useRef(true), lock = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!selection?.file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(selection.file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selection]);
  function pick(event, index) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setFailure(null); setConfirmRemove(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      setFailure(errorText({ code: 'INVALID_PRODUCT_PHOTO' })); return;
    }
    setSelection({ file, index });
  }
  async function mutate(remove) {
    if (lock.current || disabled || needsReload) return;
    lock.current = true; setBusy(true); onBusy(true); setFailure(null);
    try {
      const saved = remove ? await api.removePhoto(product.id, confirmRemove, product.version)
        : await api.uploadPhoto(product.id, selection.file, { version: product.version, index: selection.index });
      if (live.current) onSaved(saved, { created: false });
    } catch (error) {
      if (live.current) {
        const unknown = isUncertainOutcome(error);
        setNeedsReload(unknown || error?.code === 'VERSION_CONFLICT');
        setFailure(unknown ? 'Chưa xác định ảnh đã được lưu hay chưa. Tải lại sản phẩm để kiểm tra trước khi thao tác tiếp.' : errorText(error));
      }
    } finally { lock.current = false; if (live.current) { setBusy(false); onBusy(false); } }
  }
  const blocked = disabled || busy || needsReload;
  return <section className="pwc-product-image-manager" aria-label="Quản lý ảnh sản phẩm">
    <h3>Ảnh sản phẩm</h3>
    <p className="pwc-shop-hint">Tối đa 5 ảnh JPG, PNG hoặc WebP; mỗi ảnh tối đa 5 MB và 4 triệu điểm ảnh. Ảnh đầu tiên là ảnh đại diện.</p>
    {disabled && <p className="pwc-shop-hint">Lưu thay đổi thông tin trước khi sửa ảnh.</p>}
    <ul className="pwc-pm-photos" aria-label="Ảnh hiện có">
      {product.photos.map((photo, index) => <li key={photo}>
        <img src={adminProductPhotoUrl(photo)} alt={`Ảnh sản phẩm ${index + 1}`} />
        <label>Thay ảnh {index + 1}<input type="file" aria-label={`Thay ảnh ${index + 1}`} accept="image/jpeg,image/png,image/webp" disabled={blocked} onChange={event => pick(event, index)} /></label>
        <button type="button" disabled={blocked} onClick={() => { setConfirmRemove(index); setSelection(null); }}>Xóa ảnh {index + 1}</button>
      </li>)}
    </ul>
    {product.photos.length < 5 && <label>Thêm ảnh<input type="file" aria-label="Thêm ảnh sản phẩm" accept="image/jpeg,image/png,image/webp" disabled={blocked} onChange={event => pick(event)} /></label>}
    {selection && <div><p>{selection.index === undefined ? 'Ảnh mới' : `Thay ảnh ${selection.index + 1}`} — {selection.file.name}</p>
      {preview && <img className="pwc-product-image-preview" src={preview} alt="Xem trước ảnh sản phẩm" />}
      <button type="button" disabled={blocked} onClick={() => mutate(false)}>{busy ? 'Đang lưu ảnh…' : 'Lưu ảnh'}</button>
      <button type="button" disabled={busy} onClick={() => setSelection(null)}>Hủy chọn ảnh</button></div>}
    {confirmRemove !== null && <div role="alert"><p>Xóa ảnh {confirmRemove + 1} khỏi sản phẩm?</p>
      <button type="button" disabled={blocked} onClick={() => mutate(true)}>Xác nhận xóa ảnh</button>
      <button type="button" disabled={busy} onClick={() => setConfirmRemove(null)}>Giữ ảnh</button></div>}
    {failure && <p role="alert">{failure}{needsReload && <> <button type="button" disabled={busy} onClick={onReload}>Tải lại sản phẩm</button></>}</p>}
  </section>;
}
