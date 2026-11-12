import './visit-evidence-preview.css';
import { useEffect, useState } from 'react';
import { Button, Dialog } from '../ui/index.js';

export function VisitEvidencePreview({ file, mediaId, read, label, onRemove, disabled, onInvalid }) {
  const [url, setUrl] = useState(''), [failed, setFailed] = useState(false), [open, setOpen] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true, objectUrl;
    const controller = new AbortController();
    setUrl(''); setFailed(false); setOpen(false);
    async function load() {
      try {
        const blob = file ?? (await read(mediaId, { signal: controller.signal })).blob;
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      } catch { if (alive) setFailed(true); }
    }
    load();
    return () => { alive = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file, mediaId, read, retry]);
  return <div className="visit-evidence-preview">
    {url && !failed && <button type="button" className="visit-evidence-preview__thumbnail" aria-label={'Xem trước ' + label} onClick={() => setOpen(true)}>
      <img src={url} alt={label} onLoad={event => { if (file && event.currentTarget.naturalWidth * event.currentTarget.naturalHeight > 4_000_000) { setFailed(true); onInvalid?.('Ảnh vượt 4 megapixel. Giảm kích thước ảnh trước khi gửi.'); } }} onError={() => { setFailed(true); onInvalid?.('Không đọc được ảnh. Chọn ảnh JPG hoặc PNG khác.'); }} /><span>Xem ảnh</span>
    </button>}
    {!url && !failed && <p role="status">Đang chuẩn bị ảnh…</p>}
    {failed && <p role="alert">Không xem được ảnh. {file ? 'Hãy chọn ảnh JPG hoặc PNG khác.' : <Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Tải lại ảnh</Button>}</p>}
    {onRemove && <Button variant="ghost" disabled={disabled} onClick={onRemove}>Bỏ ảnh đã chọn</Button>}
    <Dialog open={open} title={label} onClose={() => setOpen(false)} className="visit-evidence-dialog">
      {url && <img src={url} alt={label} />}
    </Dialog>
  </div>;
}
