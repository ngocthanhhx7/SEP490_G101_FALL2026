import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Dialog, Notice } from '../ui/index.js';
import { productMessage } from '../../utils/product-format.js';
import { PRIVATE_IMAGE_MAX_BYTES } from '../../services/private-image-api.js';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
const MAX_PHOTOS = 10;

function PhotoPreviewTile({ photo, onRemove, disabled }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return undefined;
    const objectUrl = URL.createObjectURL(photo.file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.file]);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.35rem 0.5rem' }}>
      {url ? <img src={url} alt={photo.file.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} /> : <span>{photo.file.name}</span>}
      <button type="button" aria-label={`Bỏ ảnh ${photo.file.name}`} disabled={disabled} onClick={onRemove} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
        <X size={16} />
      </button>
    </div>
  );
}

export function ReportFaultyProductDialog({ open, order, claimApi, imageApi, onClose, onSubmitted }) {
  const [eligibility, setEligibility] = useState(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [eligibilityError, setEligibilityError] = useState('');

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [problemType, setProblemType] = useState('FAULTY_PRODUCT');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const keyRef = useRef(null);

  const selectedLine = useMemo(
    () => (order?.lines ?? []).find(line => line.productId === productId) ?? order?.lines?.[0] ?? null,
    [order, productId]
  );

  useEffect(() => {
    if (!open || !order) return undefined;
    const controller = new AbortController();
    setLoadingEligibility(true);
    setEligibilityError('');
    setEligibility(null);
    setProductId(order.lines?.[0]?.productId ?? '');
    setQuantity(1);
    setProblemType('FAULTY_PRODUCT');
    setDescription('');
    setPhotos([]);
    setFieldErrors({});
    setSubmitError('');
    keyRef.current = null;

    claimApi.getEligibility(order.id, { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) setEligibility(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEligibilityError('Chưa kiểm tra được thời hạn báo lỗi. Vui lòng thử lại.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingEligibility(false);
      });
    return () => controller.abort();
  }, [open, order, claimApi]);

  function handleChoosePhotos(event) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      setFieldErrors(prev => ({ ...prev, photoIds: `Tối đa ${MAX_PHOTOS} ảnh.` }));
      return;
    }
    if (files.some(file => !ACCEPTED_TYPES.includes(file.type) || file.size < 1 || file.size > PRIVATE_IMAGE_MAX_BYTES)) {
      setFieldErrors(prev => ({ ...prev, photoIds: 'Chọn ảnh JPG hoặc PNG không quá 5 MB.' }));
      return;
    }
    setFieldErrors(prev => ({ ...prev, photoIds: '' }));
    setPhotos(prev => [...prev, ...files.map(file => ({ file, key: globalThis.crypto.randomUUID(), uploadedId: null }))]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !order || !eligibility?.eligible) return;

    const errors = {};
    if (!selectedLine) errors.productId = 'Vui lòng chọn sản phẩm.';
    const parsedQty = Number(quantity);
    if (!Number.isInteger(parsedQty) || parsedQty < 1 || (selectedLine && parsedQty > selectedLine.quantity)) {
      errors.quantity = `Số lượng phải từ 1 đến ${selectedLine?.quantity ?? 1}.`;
    }
    if (!['FAULTY_PRODUCT', 'WRONG_PRODUCT'].includes(problemType)) {
      errors.problemType = 'Vui lòng chọn vấn đề.';
    }
    if (photos.length < 1) {
      errors.photoIds = 'Vui lòng tải lên ít nhất một ảnh.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setFieldErrors({});
    if (!keyRef.current) keyRef.current = `claim-${order.id}-${globalThis.crypto.randomUUID()}`;
    try {
      const photoIds = [];
      for (const item of photos) {
        if (item.uploadedId) {
          photoIds.push(item.uploadedId);
        } else {
          const uploaded = await imageApi.upload(item.file, { idempotencyKey: item.key });
          item.uploadedId = uploaded.id;
          photoIds.push(uploaded.id);
        }
      }
      const created = await claimApi.submitClaim(
        order.id,
        {
          productId: selectedLine.productId,
          quantity: parsedQty,
          problemType,
          description: description.trim(),
          photoIds
        },
        keyRef.current
      );
      keyRef.current = null;
      onSubmitted?.(created);
    } catch (failure) {
      if (failure?.code === 'CLAIM_DEADLINE_PASSED' && failure?.details?.deadlineDate) {
        setEligibility(prev => ({ ...(prev ?? {}), eligible: false, reason: 'CLAIM_DEADLINE_PASSED', deadlineDate: failure.details.deadlineDate }));
        setSubmitError(productMessage('MSG61', { date: failure.details.deadlineDate }));
      } else {
        setSubmitError('Chưa gửi được báo lỗi. Vui lòng kiểm tra ảnh và thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const deadlineExpired = eligibility && !eligibility.eligible && eligibility.reason === 'CLAIM_DEADLINE_PASSED';
  const formId = 'report-faulty-product-form';

  return (
    <Dialog
      open={open}
      onClose={() => { if (!submitting) onClose?.(); }}
      title={`Báo sản phẩm lỗi · Đơn ${order?.code ?? ''}`}
      dismissible={!submitting}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            Đóng
          </Button>
          {eligibility?.eligible && (
            <Button type="submit" form={formId} loading={submitting} loadingLabel="Đang gửi…">
              Gửi báo lỗi
            </Button>
          )}
        </>
      }
    >
      {loadingEligibility && <Notice state="loading" title="Đang kiểm tra điều kiện báo lỗi…" />}
      {eligibilityError && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{eligibilityError}</p>}
      {deadlineExpired && (
        <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">
          {productMessage('MSG61', { date: eligibility.deadlineDate })}
        </p>
      )}
      {eligibility?.eligible && (
        <form id={formId} onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <p className="pwc-shop-hint" style={{ margin: 0 }}>
            Hạn báo lỗi của đơn này đến hết ngày <strong>{eligibility.deadlineDate}</strong>. Cửa hàng chỉ nhận báo sản phẩm lỗi hoặc giao sai sản phẩm.
          </p>
          {submitError && <p className="pwc-shop-alert pwc-shop-alert--error" role="alert">{submitError}</p>}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Sản phẩm *</span>
            <select
              aria-label="Sản phẩm"
              value={selectedLine?.productId ?? ''}
              disabled={submitting}
              onChange={event => {
                setProductId(event.target.value);
                setQuantity(1);
              }}
            >
              {(order?.lines ?? []).map(line => (
                <option key={line.productId} value={line.productId}>
                  {line.productName} (đã mua: {line.quantity})
                </option>
              ))}
            </select>
            {fieldErrors.productId && <span role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{fieldErrors.productId}</span>}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Số lượng *</span>
            <input
              type="number"
              aria-label="Số lượng"
              min={1}
              max={selectedLine?.quantity ?? 1}
              step={1}
              value={quantity}
              disabled={submitting}
              onChange={event => setQuantity(event.target.value)}
            />
            {fieldErrors.quantity && <span role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{fieldErrors.quantity}</span>}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Vấn đề *</span>
            <select
              aria-label="Vấn đề"
              value={problemType}
              disabled={submitting}
              onChange={event => setProblemType(event.target.value)}
            >
              <option value="FAULTY_PRODUCT">Sản phẩm lỗi</option>
              <option value="WRONG_PRODUCT">Giao sai sản phẩm</option>
            </select>
            {fieldErrors.problemType && <span role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{fieldErrors.problemType}</span>}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span>Mô tả</span>
            <textarea
              aria-label="Mô tả"
              rows={3}
              maxLength={2000}
              value={description}
              disabled={submitting}
              placeholder="Mô tả tình trạng sản phẩm lỗi hoặc giao sai…"
              onChange={event => setDescription(event.target.value)}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span>Ảnh sản phẩm * (ít nhất 1 ảnh JPG/PNG, tối đa 5 MB)</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 500 }}>
              <Plus size={16} /> Thêm ảnh
              <input
                type="file"
                aria-label="Ảnh sản phẩm"
                accept="image/jpeg,image/png"
                multiple
                disabled={submitting}
                onChange={handleChoosePhotos}
                style={{ display: 'none' }}
              />
            </label>
            {photos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {photos.map((photo, index) => (
                  <PhotoPreviewTile
                    key={photo.key}
                    photo={photo}
                    disabled={submitting}
                    onRemove={() => setPhotos(prev => prev.filter((_, idx) => idx !== index))}
                  />
                ))}
              </div>
            )}
            {fieldErrors.photoIds && <span role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{fieldErrors.photoIds}</span>}
          </div>
        </form>
      )}
    </Dialog>
  );
}
