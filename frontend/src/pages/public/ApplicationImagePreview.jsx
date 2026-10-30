import { useEffect, useState } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { Dialog } from '../../components/ui/index.js';

export function ApplicationImagePreview({ file, onRemove, disabled, onValidation }) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [dimensions, setDimensions] = useState(null);
  useEffect(() => {
    setInvalid(false);
    if (!file || !['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) return undefined;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => { URL.revokeObjectURL(objectUrl); setUrl(''); };
  }, [file]);
  return <div className="application-image-preview">
    {url && !invalid && <button type="button" className="application-image-preview__thumbnail" title="Xem ảnh" aria-label={`Xem trước ${file.name}`} onClick={() => setOpen(true)}>
      <img src={url} alt={`Ảnh đã chọn: ${file.name}`} onLoad={event => {
        const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
        setDimensions({ width, height });
        onValidation?.(width * height > 4_000_000 ? `Ảnh ${file.name} có kích thước ${width} × ${height}, vượt 4 megapixel. Giảm kích thước ảnh trước khi gửi.` : null);
      }} onError={() => { setInvalid(true); onValidation?.(`Không đọc được ảnh ${file.name}. Chọn ảnh JPG hoặc PNG khác.`); }} />
      <Eye size={18} aria-hidden="true" />
    </button>}
    <div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} MB</small>
      {dimensions && <small>{dimensions.width} × {dimensions.height} pixel</small>}
      {invalid && <small className="sitter-application__error">Không đọc được ảnh. Hãy đổi sang ảnh JPG hoặc PNG khác.</small>}</div>
    <button type="button" className="application-image-preview__remove" onClick={onRemove} disabled={disabled} title="Xóa ảnh đã chọn" aria-label={`Xóa ${file.name}`}><Trash2 size={18} aria-hidden="true" /></button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Xem trước giấy tờ" className="application-image-dialog">
      {url && <img src={url} alt={`Xem trước ${file.name}`} />}
    </Dialog>
  </div>;
}
