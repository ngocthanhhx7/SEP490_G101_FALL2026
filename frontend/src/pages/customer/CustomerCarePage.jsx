import { CustomerPetsPage } from './CustomerPetsPage.jsx';
import { useCallback, useMemo, useRef, useState } from 'react';
import { MapPin, Pencil, Plus, Archive, X } from 'lucide-react';
import { Button, Input, Select, Notice, Dialog } from '../../components/ui/index.js';
import { AddressSearch } from '../../components/common/AddressSearch.jsx';
import { VietmapView } from '../../components/common/VietmapView.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { createCustomerCareApi } from '../../services/customer-care-api.js';
import './customer-care.css';

const newAddress = () => ({ label: '', location: '', areaCode: '', coordinates: ['', ''], pointConfirmed: false, privateAccessNotes: '' });
const errorMessage = error => ({ VERSION_CONFLICT: 'Thông tin đã thay đổi. Tải lại danh sách trước khi sửa tiếp.',
  ACTIVE_BOOKING_CONFLICT: 'Không thể xóa hồ sơ đang được dùng trong buổi chăm chưa kết thúc. Vui lòng hoàn tất hoặc hủy lịch trước.',
  CSRF_NOT_READY: 'Phiên bảo mật chưa sẵn sàng. Vui lòng đăng nhập lại.', UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn.',
  FORBIDDEN: 'Tài khoản không được phép thực hiện yêu cầu này.', VALIDATION_FAILED: 'Kiểm tra các thông tin và vị trí đã nhập.',
  ADDRESS_CONFIRMATION_REQUIRED: 'Cần xác nhận đúng vị trí ghim.' })[error?.code] ?? 'Chưa nhận được kết quả từ máy chủ. Vui lòng thử lại.';

function AddressForm({ draft, change, catalog, api, disabled }) {
  const selectPoint = coordinates => change({ ...draft, coordinates, pointConfirmed: false });
  return <>
    <div className="customer-care__wide"><AddressSearch search={api.searchAddress} resolve={api.resolveAddress} disabled={disabled}
      onSelect={item => change({ ...draft, location: item.label, coordinates: item.coordinates, pointConfirmed: false })} />
      <VietmapView coordinates={draft.coordinates.every(value => value !== '' && Number.isFinite(Number(value))) ? draft.coordinates.map(Number) : null}
        onSelect={selectPoint} disabled={disabled} />
    </div>
    <Input label="Tên gợi nhớ" value={draft.label} required maxLength={100} disabled={disabled} onChange={e => change({ ...draft, label: e.target.value })} />
    <Select label="Khu vực phục vụ" required value={draft.areaCode} disabled={disabled} onChange={e => change({ ...draft, areaCode: e.target.value, pointConfirmed: false })}>
      <option value="">Chọn khu vực</option>{catalog.workAreas.map(row => <option key={row.code} value={row.code}>{row.label}</option>)}
    </Select>
    {catalog.workAreas.some(row => row.parentCode === draft.areaCode) && <p className="customer-care__wide">Hãy chọn khu vực cụ thể của địa chỉ nếu đã biết. Chọn toàn thành phố chỉ tìm được nhân viên đăng ký nhận việc trên toàn thành phố.</p>}
    <Input label="Địa chỉ đầy đủ (số nhà, đường, phường/xã, thành phố)" className="customer-care__location" value={draft.location} required maxLength={500} disabled={disabled}
      onChange={e => change({ ...draft, location: e.target.value, pointConfirmed: false })} />
    <Input label="Kinh độ" type="number" min="-180" max="180" step="any" value={draft.coordinates[0]} required disabled={disabled} onChange={e => selectPoint([e.target.value, draft.coordinates[1]])} />
    <Input label="Vĩ độ" type="number" min="-90" max="90" step="any" value={draft.coordinates[1]} required disabled={disabled} onChange={e => selectPoint([draft.coordinates[0], e.target.value])} />
    <Input label="Ghi chú ra vào riêng (tầng, căn hộ, cách liên hệ)" value={draft.privateAccessNotes} maxLength={1000} disabled={disabled} onChange={e => change({ ...draft, privateAccessNotes: e.target.value })} />
    <label className="customer-care__check customer-care__wide"><input type="checkbox" required checked={draft.pointConfirmed} disabled={disabled}
      onChange={e => change({ ...draft, pointConfirmed: e.target.checked })} />Tôi xác nhận địa chỉ, khu vực và vị trí ghim chính xác.</label>
  </>;
}

function CustomerAddressPage({ api: suppliedApi }) {
  const { getCsrfToken } = useSession();
  const kind = 'addresses';
  const api = useMemo(() => suppliedApi ?? createCustomerCareApi(createApiClient({ getCsrfToken })), [getCsrfToken, suppliedApi]);
  const load = useCallback(({ signal }) => api.load(kind, { signal }), [api, kind]);
  const resource = useApiResource(load);
  const [editor, setEditor] = useState(null), [draft, setDraft] = useState(null), [archive, setArchive] = useState(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
  const attempt = useRef(null), locked = useRef(false);
  const noun = 'địa chỉ';
  const catalog = resource.data;
  const items = catalog?.items ?? [];
  const visible = items;
  function edit(row) {
    setEditor({ id: row?.id, version: row?.version }); setError(''); setSaved('');
    setDraft({ ...newAddress(), ...row, pointConfirmed: false });
  }
  function close() { if (busy || uncertain) return; setEditor(null); setDraft(null); setError(''); }
  async function execute(operation) {
    if (locked.current || !operation) return;
    locked.current = true;
    setBusy(true); setError('');
    try {
      const result = operation.type === 'archive' ? await api.archive(kind, operation.id, operation.version, operation.key)
        : await api.save(kind, operation.id, operation.body, operation.key);
      if (result.pending) { setUncertain(true); return; }
      attempt.current = null; setUncertain(false); setEditor(null); setDraft(null); setArchive(null);
      setSaved(operation.type === 'archive' ? `Đã xóa ${noun} khỏi danh sách. Lịch sử đặt dịch vụ được giữ nguyên.` : `Đã lưu ${noun}.`); resource.retry();
    } catch (failure) {
      if (['TIMEOUT', 'NETWORK_ERROR', 'ABORTED'].includes(failure.code) || failure.status >= 500) setUncertain(true);
      else { setUncertain(false); attempt.current = null; setError(errorMessage(failure)); }
    } finally { locked.current = false; setBusy(false); }
  }
  function start(operation) {
    if (locked.current || busy || uncertain) return;
    if (!globalThis.crypto?.randomUUID) { setError('Trình duyệt chưa tạo được mã yêu cầu an toàn.'); return; }
    attempt.current = { ...operation, key: globalThis.crypto.randomUUID() }; execute(attempt.current);
  }
  function save(event) {
    event.preventDefault();
    const body = { label: draft.label, location: draft.location, areaCode: draft.areaCode, coordinates: draft.coordinates.map(Number), pointConfirmed: draft.pointConfirmed, privateAccessNotes: draft.privateAccessNotes };
    if (editor.id) body.expectedVersion = editor.version;
    start({ type: 'save', id: editor.id, body });
  }
  return <section className="customer-care">
    <header><h1>Địa chỉ phục vụ</h1><Button onClick={() => edit()} disabled={!catalog || busy || uncertain}><Plus size={18} />Thêm {noun}</Button></header>
    {saved && <Notice state="success" title={saved} />}
    {resource.status === 'loading' && <Notice state="loading" title={`Đang tải ${noun}`} />}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <Notice state={resource.status} title={`Chưa tải được ${noun}`} action={<Button onClick={resource.retry}>Tải lại</Button>}>{errorMessage({ code: resource.code })}</Notice>}
    {catalog && visible.length === 0 && <Notice state="empty" title={`Chưa có ${noun}`} />}
    {catalog && !catalog.workAreas.length && <Notice state="warning" title="Chưa có khu vực phục vụ">Chưa thể lưu địa chỉ cho lịch mới. Vui lòng thử lại sau.</Notice>}
    <ul className="customer-care__list">{visible.map(row => <li key={row.id}>
      <h2><MapPin size={18} />{row.label}</h2><p>{row.location}</p>
      {row.privateAccessNotes && <p>{row.privateAccessNotes}</p>}
      <div className="customer-care__actions"><Button variant="secondary" onClick={() => edit(row)} disabled={busy || uncertain}><Pencil size={16} />Sửa hồ sơ</Button>
        <Button variant="ghost" onClick={() => { setArchive(row); setError(''); }} disabled={busy || uncertain}><Archive size={16} />Xóa {noun}</Button></div>
    </li>)}</ul>
    {editor && draft && catalog && <form className="customer-care__form" onSubmit={save}>
      <div className="customer-care__wide customer-care__actions"><h2>{editor.id ? 'Cập nhật' : 'Thêm'} {noun}</h2><Button variant="ghost" type="button" onClick={close} disabled={busy || uncertain}><X size={18} />Đóng</Button></div>
      <AddressForm draft={draft} change={setDraft} catalog={catalog} api={api} disabled={busy || uncertain} />
      <div className="customer-care__wide customer-care__actions"><Button type="submit" loading={busy} disabled={uncertain || !catalog.workAreas.length}>Lưu {noun}</Button><Button type="button" variant="secondary" onClick={close} disabled={busy || uncertain}>Hủy</Button></div>
    </form>}
    <Dialog open={Boolean(archive)} title={`Xóa ${noun} này?`} onClose={() => { if (!busy && !uncertain) setArchive(null); }} dismissible={!busy && !uncertain}>
      <p>Không thể xóa khi còn buổi chăm chưa kết thúc. Hồ sơ đã xóa không dùng cho lịch mới; lịch sử đã đặt được giữ nguyên.</p>
      <Button variant="danger" disabled={busy || uncertain} onClick={() => start({ type: 'archive', id: archive.id, version: archive.version })}>Xác nhận xóa</Button>
      {error && <Notice state="error" title={error} />}
      {uncertain && <Notice state="pending" title="Chưa xác định kết quả"><Button disabled={busy} onClick={() => execute(attempt.current)}>Kiểm tra lại cùng yêu cầu</Button></Notice>}
    </Dialog>
    {error && !archive && <Notice state="error" title={error} />}
    {uncertain && !archive && <Notice state="pending" title="Chưa xác định kết quả lưu"><Button disabled={busy} onClick={() => execute(attempt.current)}>Kiểm tra lại cùng yêu cầu</Button></Notice>}
  </section>;
}

// Keep existing route/import contracts while each workspace owns its focused flow.
export function CustomerCarePage(props) { return props.kind === 'addresses' ? <CustomerAddressPage {...props} /> : <CustomerPetsPage {...props} />; }
