import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Pencil, Plus, Archive, X } from 'lucide-react';
import { Button, Input, Select, Notice, Dialog } from '../../components/ui/index.js';
import { AddressSearch } from '../../components/common/AddressSearch.jsx';
import { VietmapView } from '../../components/common/VietmapView.jsx';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { createCustomerCareApi } from '../../services/customer-care-api.js';
import './customer-care.css';

const careLabels = { feeding: 'Thức ăn, lượng và giờ cho ăn', handling: 'Thói quen, cách tiếp cận và điều cần tránh',
  health: 'Tình trạng sức khỏe', allergies: 'Dị ứng', medication: 'Thuốc và hướng dẫn của bác sĩ thú y',
  vaccination: 'Vaccine và ngày tiêm', emergencyContact: 'Liên hệ khẩn cấp (tên, số điện thoại, quan hệ)',
  veterinaryContact: 'Phòng khám thú y (tên, số điện thoại, địa chỉ)' };
const blankProfile = () => Object.fromEntries(Object.keys(careLabels).map(key => [key, { status: 'NOT_PROVIDED', value: '' }]));
const newPet = () => ({ name: '', species: 'DOG', breedCode: '', weightKg: '', ageMonths: '', sex: 'UNKNOWN', traits: [], careNeedsConfirmed: false, careProfile: blankProfile() });
const newAddress = () => ({ label: '', location: '', areaCode: '', coordinates: ['', ''], pointConfirmed: false, privateAccessNotes: '' });
const errorMessage = error => ({ VERSION_CONFLICT: 'Thông tin đã thay đổi. Tải lại danh sách trước khi sửa tiếp.',
  CSRF_NOT_READY: 'Phiên bảo mật chưa sẵn sàng. Vui lòng đăng nhập lại.', UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn.',
  FORBIDDEN: 'Tài khoản không được phép thực hiện yêu cầu này.', VALIDATION_FAILED: 'Kiểm tra các thông tin và vị trí đã nhập.',
  ADDRESS_CONFIRMATION_REQUIRED: 'Cần xác nhận đúng vị trí ghim.' })[error?.code] ?? 'Chưa nhận được kết quả từ máy chủ. Vui lòng thử lại.';

function CareForm({ draft, change, catalog, disabled }) {
  const field = (name, value) => change({ ...draft, [name]: value, careNeedsConfirmed: false });
  return <>
    <Input label="Tên thú cưng" value={draft.name} required maxLength={100} disabled={disabled} onChange={e => field('name', e.target.value)} />
    <Select label="Loài" value={draft.species} disabled={disabled} onChange={e => change({ ...draft, species: e.target.value, breedCode: '', traits: [], careNeedsConfirmed: false })}>
      <option value="DOG">Chó</option><option value="CAT">Mèo</option>
    </Select>
    <Select label="Giống" value={draft.breedCode} required disabled={disabled} onChange={e => field('breedCode', e.target.value)}>
      <option value="">Chọn giống</option>{catalog.breeds.filter(row => row.species === draft.species).map(row => <option key={row.code} value={row.code}>{row.name}</option>)}
    </Select>
    <Input label="Cân nặng gần nhất (kg)" type="number" min="0.1" max="150" step="0.1" required value={draft.weightKg} disabled={disabled} onChange={e => field('weightKg', e.target.value)} />
    <Input label="Tuổi ước tính (tháng)" type="number" min="0" max="600" step="1" value={draft.ageMonths} disabled={disabled} onChange={e => field('ageMonths', e.target.value)} />
    <Select label="Giới tính" value={draft.sex} disabled={disabled} onChange={e => field('sex', e.target.value)}>
      <option value="UNKNOWN">Chưa biết</option><option value="MALE">Đực</option><option value="FEMALE">Cái</option>
    </Select>
    {catalog.traits?.filter(row => row.species.includes(draft.species)).length > 0 && <fieldset className="customer-care__wide"><legend>Đặc điểm cần lưu ý</legend>
      {catalog.traits.filter(row => row.species.includes(draft.species)).map(row => <label className="customer-care__check" key={row.code} title={row.explanation}>
        <input type="checkbox" disabled={disabled} checked={draft.traits.includes(row.code)} onChange={e => field('traits', e.target.checked ? [...draft.traits, row.code] : draft.traits.filter(code => code !== row.code))} />{row.label}
      </label>)}
    </fieldset>}
    {Object.entries(careLabels).map(([key, label]) => {
      const value = draft.careProfile[key] ?? { status: 'NOT_PROVIDED', value: '' };
      const update = next => field('careProfile', { ...draft.careProfile, [key]: next });
      return <fieldset key={key}><legend>{label}</legend>
        <Select label={`Tình trạng thông tin: ${label}`} value={value.status} disabled={disabled} onChange={e => update({ status: e.target.value, value: '' })}>
          <option value="NOT_PROVIDED">Chưa cung cấp</option><option value="UNKNOWN">Chưa biết</option><option value="KNOWN">Đã biết</option>
        </Select>
        {value.status === 'KNOWN' && <Input label={label} value={value.value ?? ''} required maxLength={2000} disabled={disabled} onChange={e => update({ ...value, value: e.target.value })} />}
      </fieldset>;
    })}
    <label className="customer-care__check customer-care__wide"><input type="checkbox" checked={draft.careNeedsConfirmed} disabled={disabled} onChange={e => change({ ...draft, careNeedsConfirmed: e.target.checked })} />Tôi đã kiểm tra đặc điểm và nhu cầu chăm sóc; thông tin chưa biết vẫn cần được xác nhận trước buổi chăm sóc.</label>
  </>;
}

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
    <Input label="Địa chỉ đầy đủ (số nhà, đường, phường/xã, thành phố)" className="customer-care__location" value={draft.location} required maxLength={500} disabled={disabled}
      onChange={e => change({ ...draft, location: e.target.value, pointConfirmed: false })} />
    <Input label="Kinh độ" type="number" min="-180" max="180" step="any" value={draft.coordinates[0]} required disabled={disabled} onChange={e => selectPoint([e.target.value, draft.coordinates[1]])} />
    <Input label="Vĩ độ" type="number" min="-90" max="90" step="any" value={draft.coordinates[1]} required disabled={disabled} onChange={e => selectPoint([draft.coordinates[0], e.target.value])} />
    <Input label="Ghi chú ra vào riêng (tầng, căn hộ, cách liên hệ)" value={draft.privateAccessNotes} maxLength={1000} disabled={disabled} onChange={e => change({ ...draft, privateAccessNotes: e.target.value })} />
    <label className="customer-care__check customer-care__wide"><input type="checkbox" required checked={draft.pointConfirmed} disabled={disabled}
      onChange={e => change({ ...draft, pointConfirmed: e.target.checked })} />Tôi xác nhận địa chỉ, khu vực và vị trí ghim chính xác.</label>
  </>;
}

export function CustomerCarePage({ kind = 'pets', api: suppliedApi }) {
  const { getCsrfToken } = useSession();
  const { petId } = useParams();
  const api = useMemo(() => suppliedApi ?? createCustomerCareApi(createApiClient({ getCsrfToken })), [getCsrfToken, suppliedApi]);
  const load = useCallback(({ signal }) => api.load(kind, { signal }), [api, kind]);
  const resource = useApiResource(load);
  const [editor, setEditor] = useState(null), [draft, setDraft] = useState(null), [archive, setArchive] = useState(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
  const attempt = useRef(null), locked = useRef(false);
  const pets = kind === 'pets', noun = pets ? 'thú cưng' : 'địa chỉ';
  const catalog = resource.data;
  const items = catalog?.items ?? [];
  const visible = petId ? items.filter(row => row.id === petId) : items;
  function edit(row) {
    setEditor({ id: row?.id, version: row?.version }); setError(''); setSaved('');
    setDraft(pets ? { ...newPet(), ...row, careProfile: { ...blankProfile(), ...row?.careProfile }, careNeedsConfirmed: false }
      : { ...newAddress(), ...row, pointConfirmed: false });
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
      setSaved(operation.type === 'archive' ? `Đã ẩn ${noun}. Lịch sử đặt dịch vụ được giữ nguyên.` : `Đã lưu ${noun}.`); resource.retry();
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
    const body = pets ? { name: draft.name, species: draft.species, breedCode: draft.breedCode,
      weightKg: Number(draft.weightKg), ...(draft.ageMonths !== '' ? { ageMonths: Number(draft.ageMonths) } : {}),
      sex: draft.sex, traits: draft.traits, careNeedsConfirmed: draft.careNeedsConfirmed,
      careProfile: Object.fromEntries(Object.entries(draft.careProfile).map(([key, field]) => [key, field.status === 'KNOWN' ? field : { status: field.status }])) }
      : { label: draft.label, location: draft.location, areaCode: draft.areaCode, coordinates: draft.coordinates.map(Number), pointConfirmed: draft.pointConfirmed, privateAccessNotes: draft.privateAccessNotes };
    if (editor.id) body.expectedVersion = editor.version;
    start({ type: 'save', id: editor.id, body });
  }
  return <section className="customer-care">
    <header><h1>{pets ? 'Thú cưng của tôi' : 'Địa chỉ phục vụ'}</h1><Button onClick={() => edit()} disabled={!catalog || busy || uncertain}><Plus size={18} />Thêm {noun}</Button></header>
    {petId && <Link to="/account/pets">Về danh sách thú cưng</Link>}
    {saved && <Notice state="success" title={saved} />}
    {resource.status === 'loading' && <Notice state="loading" title={`Đang tải ${noun}`} />}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <Notice state={resource.status} title={`Chưa tải được ${noun}`} action={<Button onClick={resource.retry}>Tải lại</Button>}>{errorMessage({ code: resource.code })}</Notice>}
    {catalog && visible.length === 0 && <Notice state="empty" title={petId ? 'Không tìm thấy hồ sơ đang hoạt động' : `Chưa có ${noun}`} />}
    {catalog && pets && <p>Thông tin chưa biết không có nghĩa là không có dị ứng, thuốc hoặc rủi ro.</p>}
    {catalog && !pets && !catalog.workAreas.length && <Notice state="warning" title="Chưa có khu vực phục vụ">Chưa thể lưu địa chỉ cho lịch mới. Vui lòng thử lại sau.</Notice>}
    <ul className="customer-care__list">{visible.map(row => <li key={row.id}>
      <h2>{pets ? row.name : <><MapPin size={18} /> {row.label}</>}</h2>
      <p>{pets ? `${row.species === 'DOG' ? 'Chó' : 'Mèo'} · ${catalog.breeds.find(b => b.code === row.breedCode)?.name ?? row.breedCode} · ${row.weightKg} kg` : row.location}</p>
      {pets && <p>{row.careNeedsConfirmed ? 'Đã xác nhận nhu cầu chăm sóc' : 'Cần xác nhận nhu cầu chăm sóc'}</p>}
      {!pets && row.privateAccessNotes && <p>{row.privateAccessNotes}</p>}
      <div className="customer-care__actions"><Button variant="secondary" onClick={() => edit(row)} disabled={busy || uncertain}><Pencil size={16} />Sửa hồ sơ</Button>
        <Button variant="ghost" onClick={() => { setArchive(row); setError(''); }} disabled={busy || uncertain}><Archive size={16} />Ẩn {noun}</Button></div>
    </li>)}</ul>
    {editor && draft && catalog && <form className="customer-care__form" onSubmit={save}>
      <div className="customer-care__wide customer-care__actions"><h2>{editor.id ? 'Cập nhật' : 'Thêm'} {noun}</h2><Button variant="ghost" type="button" onClick={close} disabled={busy || uncertain}><X size={18} />Đóng</Button></div>
      {pets ? <CareForm draft={draft} change={setDraft} catalog={catalog} disabled={busy || uncertain} /> : <AddressForm draft={draft} change={setDraft} catalog={catalog} api={api} disabled={busy || uncertain} />}
      <div className="customer-care__wide customer-care__actions"><Button type="submit" loading={busy} disabled={uncertain || (!pets && !catalog.workAreas.length)}>Lưu {noun}</Button><Button type="button" variant="secondary" onClick={close} disabled={busy || uncertain}>Hủy</Button></div>
    </form>}
    <Dialog open={Boolean(archive)} title={`Ẩn ${noun} này?`} onClose={() => { if (!busy && !uncertain) setArchive(null); }} dismissible={!busy && !uncertain}>
      <p>Không thể chọn hồ sơ này cho lịch mới. Các lịch đã đặt giữ nguyên thông tin tại thời điểm đặt.</p>
      <Button variant="danger" disabled={busy || uncertain} onClick={() => start({ type: 'archive', id: archive.id, version: archive.version })}>Xác nhận ẩn</Button>
      {error && <Notice state="error" title={error} />}
      {uncertain && <Notice state="pending" title="Chưa xác định kết quả"><Button disabled={busy} onClick={() => execute(attempt.current)}>Kiểm tra lại cùng yêu cầu</Button></Notice>}
    </Dialog>
    {error && !archive && <Notice state="error" title={error} />}
    {uncertain && !archive && <Notice state="pending" title="Chưa xác định kết quả lưu"><Button disabled={busy} onClick={() => execute(attempt.current)}>Kiểm tra lại cùng yêu cầu</Button></Notice>}
  </section>;
}
