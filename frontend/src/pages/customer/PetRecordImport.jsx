import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { createPetRecordImportApi } from '../../services/pet-record-import-api.js';
import { PET_CARE_LABELS } from '../../utils/customer-pet-profile.js';
import { Button } from '../../components/ui/index.js';
export function PetRecordImport({ onApply, onBusyChange, disabled, api: suppliedApi, initiallyOpen = false }) {
  const session = useSession(), api = useMemo(() => suppliedApi ?? createPetRecordImportApi({ getCsrfToken: session.getCsrfToken }), [suppliedApi, session.getCsrfToken]);
  const [expanded, setExpanded] = useState(initiallyOpen);
  const [enabled, setEnabled] = useState(false), [file, setFile] = useState(null), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null), [selected, setSelected] = useState([]), [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState('');
  const abort = useRef(null), active = useRef(true), lock = useRef(false);
  useEffect(() => { active.current = true; const controller = new AbortController(); api.metadata(controller.signal).then(value => { if (active.current) setEnabled(value.data?.enabled === true); }).catch(() => {});
    return () => { active.current = false; controller.abort(); abort.current?.abort(); }; }, [api]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  async function extract() {
    if (!enabled || !file || !consent || lock.current || disabled) return;
    lock.current = true; setBusy(true); setMessage(''); setResult(null); setSelected([]); setConfirmed(false); const controller = new AbortController(); abort.current = controller;
    try { const value = await api.extract(file, controller.signal); if (active.current) setResult(value); }
    catch (error) { if (active.current) setMessage(error.code === 'PET_RECORD_QUOTA_EXCEEDED' ? 'Gemini đã đạt hạn mức hoặc bạn vừa gửi nhiều yêu cầu. Chờ rồi thử lại; bạn vẫn có thể nhập tay.' : error.code === 'PET_RECORD_TOO_COMPLEX' ? 'Sổ quá dài hoặc phức tạp. Chọn vài trang cần đọc rồi thử lại.' : error.code === 'INVALID_PET_RECORD' ? 'Chọn ảnh JPG/PNG hoặc PDF hợp lệ, tối đa 5 MB.' : 'Chưa đọc được sổ. Kiểm tra kết nối và tệp, hoặc nhập thông tin bằng tay.'); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  return <details className="pet-record-import" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>Điền nhanh từ ảnh hoặc PDF sổ thú cưng</summary>
    <p>Gemini đọc nội dung thành bản nháp. Hãy đối chiếu đúng thú cưng, ngày tiêm, dị ứng và hướng dẫn dùng thuốc; kết quả không phải chẩn đoán hay xác minh y tế.</p>
    {!enabled ? <p>Chức năng đọc sổ AI chưa được bật. Bạn có thể nhập đầy đủ thông tin trong các nhóm bên dưới.</p> : <>
      <label className="pet-record-file">Chọn sổ JPG, PNG hoặc PDF (tối đa 5 MB)<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy || disabled} onChange={event => { setFile(event.target.files?.[0] ?? null); setResult(null); setConsent(false); setConfirmed(false); setMessage(''); }} /></label>
      <label className="pet-record-check"><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={event => setConsent(event.target.checked)} />Tôi đồng ý gửi nội dung tệp đã chọn tới Google Gemini để trích xuất. Tệp đã loại bỏ thông tin cá nhân, nhạy cảm và bảo mật; tôi không gửi bản sổ gốc còn những thông tin này.</label>
      <Button variant="secondary" disabled={!file || !consent || busy || disabled} onClick={extract}>{busy ? 'Đang đọc sổ…' : 'Đọc sổ bằng Gemini'}</Button>
    </>}
    {message && <p role="status">{message}</p>}
    {result && <div className="pet-record-results"><h3>Kiểm tra bản trích xuất</h3><p>Chọn từng mục muốn đưa vào bản sửa. Mục được chọn sẽ thay nội dung đang nhập tương ứng; chưa có gì được lưu.</p>
      {result.warnings?.map((text, index) => <p key={index}>{text}</p>)}
      {result.entries.filter(entry => Object.hasOwn(PET_CARE_LABELS, entry.field)).map(entry => <div className="pet-record-entry" key={entry.field}>
        <label className="pet-record-check"><input type="checkbox" checked={selected.includes(entry.field)} onChange={event => { setSelected(values => event.target.checked ? [...values, entry.field] : values.filter(value => value !== entry.field)); setConfirmed(false); }} />{PET_CARE_LABELS[entry.field]}</label>
        <label className="pet-record-status">Trạng thái {PET_CARE_LABELS[entry.field]}<select value={entry.status} onChange={event => { setResult(value => ({ ...value, entries: value.entries.map(row => row.field === entry.field ? { ...row, status: event.target.value, value: '' } : row) })); setConfirmed(false); }}><option value="KNOWN">Có thông tin</option><option value="UNKNOWN">Chưa biết</option></select></label>
        {entry.status === 'KNOWN' && <textarea aria-label={`Bản nháp ${PET_CARE_LABELS[entry.field]}`} value={entry.value} maxLength={2000} onChange={event => { setResult(value => ({ ...value, entries: value.entries.map(row => row.field === entry.field ? { ...row, value: event.target.value } : row) })); setConfirmed(false); }} />}
        <p className="pet-record-source">Trang {entry.page} · Nội dung AI đọc từ sổ: {entry.sourceText}</p>
      </div>)}
      {!result.entries.length && <p>Không đọc được thông tin phù hợp. Bạn có thể nhập tay hoặc dùng bản chụp rõ hơn.</p>}
      <label className="pet-record-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Tôi đã đối chiếu tài liệu và xác nhận các mục được chọn đúng với thú cưng này.</label>
      <Button variant="secondary" disabled={!confirmed || !selected.length || result.entries.some(entry => selected.includes(entry.field) && entry.status === 'KNOWN' && !entry.value.trim())} onClick={() => { onApply(Object.fromEntries(result.entries.filter(entry => selected.includes(entry.field)).map(entry => [entry.field, entry.status === 'KNOWN' ? { status: 'KNOWN', value: entry.value.trim() } : { status: 'UNKNOWN' }]))); setResult(null); setFile(null); setConsent(false); setMessage('Đã đưa mục được chọn vào bản sửa. Kiểm tra các nhóm rồi bấm Lưu thú cưng để lưu hồ sơ.'); }}>Đưa mục đã chọn vào bản sửa</Button>
      <Button variant="ghost" onClick={() => setResult(null)}>Bỏ bản trích xuất</Button>
    </div>}
  </details>;
}
