import { PetRecordImport } from './PetRecordImport.jsx';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Pencil, Plus, Archive, PawPrint, ShieldCheck } from 'lucide-react';
import { ProfileAvatar } from '../../components/common/ProfileAvatar.jsx';
import { Button, Dialog, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { createCustomerCareApi } from '../../services/customer-care-api.js';
import { customerPetBody, newCustomerPet, petCareStatus } from '../../utils/customer-pet-profile.js';
import { CustomerPetForm } from './CustomerPetForm.jsx';
import { PetProfileDetails } from './PetProfileDetails.jsx';
import './customer-pets.css';
const problem = error => ({ VERSION_CONFLICT: 'Hồ sơ đã thay đổi. Tải lại hồ sơ rồi kiểm tra trước khi lưu tiếp.',
  ACTIVE_BOOKING_CONFLICT: 'Thú cưng đang có buổi chăm sóc chưa kết thúc. Hãy hoàn tất hoặc hủy lịch trước khi xóa hồ sơ.',
  CSRF_NOT_READY: 'Phiên bảo mật chưa sẵn sàng. Đăng nhập lại để tiếp tục.', UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn.',
  FORBIDDEN: 'Bạn không có quyền chỉnh sửa hồ sơ này.', VALIDATION_FAILED: 'Kiểm tra tên, giống, cân nặng và các mục đã chọn có thông tin.' })[error?.code] ?? 'Chưa nhận được kết quả từ máy chủ. Vui lòng thử lại.';
const speciesName = value => value === 'DOG' ? 'Chó' : 'Mèo';
export function CustomerPetsPage({ api: suppliedApi }) {
  const { getCsrfToken } = useSession(), { petId } = useParams();
  const api = useMemo(() => suppliedApi ?? createCustomerCareApi(createApiClient({ getCsrfToken })), [getCsrfToken, suppliedApi]);
  const load = useCallback(({ signal }) => api.load('pets', { signal }), [api]), resource = useApiResource(load);
  const [editor, setEditor] = useState(null), [draft, setDraft] = useState(null), [archive, setArchive] = useState(null), [discard, setDiscard] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false), [stale, setStale] = useState(false), [reloadAfterDiscard, setReloadAfterDiscard] = useState(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(''), [created, setCreated] = useState(null);
  const attempt = useRef(null), locked = useRef(false), initial = useRef('');
  const catalog = resource.data, items = catalog?.items ?? [], pet = petId ? items.find(row => row.id === petId) : null;
  const breed = row => catalog?.breeds.find(b => b.code === row.breedCode)?.name ?? row.breedCode;
  const close = () => { setEditor(null); setDraft(null); setDiscard(false); setReloadAfterDiscard(false); setStale(false); setError(''); };
  function edit(row, group = 'basic', openImport = false) {
    if (photoBusy || busy || uncertain) return;
    const next = newCustomerPet(row); initial.current = JSON.stringify(next); setDraft(next); setEditor({ id: row?.id, version: row?.version, group, openImport }); setError(''); setSaved('');
  }
  function requestClose() { if (busy || uncertain || importBusy) return; if (JSON.stringify(draft) !== initial.current) setDiscard(true); else close(); }
  async function execute(operation) {
    if (locked.current || !operation) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = operation.type === 'archive' ? await api.archive('pets', operation.id, operation.version, operation.key) : await api.save('pets', operation.id, operation.body, operation.key);
      if (result.pending) { setUncertain(true); return; }
      if (!/^[a-f0-9]{24}$/i.test(result.data?.id ?? '') || !Number.isSafeInteger(result.data?.version) || result.data.version < 0 || (operation.id && (result.data.id !== operation.id || result.data.version !== (operation.type === 'archive' ? operation.version : operation.body.expectedVersion) + 1))) throw Object.assign(new Error('Uncertain acknowledgement'), { code: 'INVALID_RESPONSE', status: result.status ?? 200 });
      attempt.current = null; setUncertain(false); close(); setArchive(null);
      setSaved(operation.type === 'archive' ? 'Đã xóa thú cưng khỏi danh sách. Lịch sử đặt dịch vụ được giữ nguyên.' : 'Đã lưu thú cưng.');
      setCreated(operation.type === 'save' && !operation.id && result.data?.id ? result.data.id : null); resource.retry();
    } catch (failure) {
      if (['TIMEOUT', 'NETWORK_ERROR', 'ABORTED'].includes(failure.code) || (failure.status >= 200 && failure.status < 300) || [408, 425, 429].includes(failure.status) || failure.status >= 500) setUncertain(true);
      else { setUncertain(false); attempt.current = null; setError(problem(failure)); setStale(failure.status === 409); }
    } finally { locked.current = false; setBusy(false); }
  }
  function start(operation) {
    if (locked.current || busy || uncertain) return;
    if (!globalThis.crypto?.randomUUID) { setError('Trình duyệt chưa tạo được mã yêu cầu an toàn.'); return; }
    attempt.current = { ...operation, key: globalThis.crypto.randomUUID() }; execute(attempt.current);
  }
  function save(event) { event.preventDefault(); if (busy || uncertain || importBusy || photoBusy) return; start({ type: 'save', id: editor.id, body: customerPetBody(draft, editor.id ? editor.version : undefined) }); }
  return <section className="customer-pets" aria-labelledby="customer-pets-title">
    {petId && <Link className="pet-back" to="/account/pets"><ArrowLeft size={17} />Thú cưng của tôi</Link>}
    {!pet && <header className="pet-page-heading"><div><span className="pet-eyebrow">Đồng hành cùng bạn</span><h1 id="customer-pets-title">{petId ? pet?.name ?? 'Hồ sơ thú cưng' : 'Thú cưng của tôi'}</h1><p>{petId ? 'Ảnh, thói quen và lưu ý để mỗi buổi chăm sóc phù hợp hơn.' : 'Lưu những điều riêng của từng bé, để người chăm sóc hiểu và chuẩn bị tốt hơn.'}</p></div>
      {!petId && <Button onClick={() => edit()} disabled={!catalog || busy || uncertain}><Plus size={18} />Thêm thú cưng</Button>}
    </header>}
    {saved && <Notice state="success" title={saved}>{created && <Link to={`/account/pets/${created}`}>Thêm ảnh và xem hồ sơ vừa tạo <ArrowRight size={15} /></Link>}</Notice>}
    {resource.status === 'loading' && <div className="pet-loading" role="status">Đang tải hồ sơ thú cưng…</div>}
    {['error', 'forbidden', 'pending'].includes(resource.status) && <Notice state={resource.status} title="Chưa tải được thú cưng" action={<Button onClick={resource.retry}>Tải lại</Button>}>{problem({ code: resource.code })}</Notice>}
    {catalog && !items.length && !petId && <div className="pet-empty"><PawPrint size={40} /><h2>Thêm người bạn nhỏ đầu tiên</h2><p>Bắt đầu bằng tên, giống và cân nặng. Ảnh và những thói quen khác có thể bổ sung sau.</p><Button onClick={() => edit()}><Plus size={18} />Tạo hồ sơ thú cưng</Button></div>}
    {catalog && petId && !pet && <Notice state="empty" title="Không tìm thấy hồ sơ đang hoạt động"><Link to="/account/pets">Về danh sách thú cưng</Link></Notice>}
    {!petId && items.length > 0 && <><p className="pet-list-count">{items.length} người bạn nhỏ trong gia đình</p><ul className="pet-card-grid">{items.map(row => <li key={row.id} className="pet-summary-card">
      <Link to={`/account/pets/${row.id}`} className="pet-cover-link" aria-label={`Ảnh và hồ sơ ${row.name}`}><ProfileAvatar petId={row.id} label={`Ảnh của ${row.name}`} fallback={speciesName(row.species)} className="pet-card-cover" /><span className="pet-species-badge">{speciesName(row.species)}</span></Link>
      <div className="pet-card-body"><div className="pet-card-title"><div><h2>{row.name}</h2><p>{breed(row)}{row.sex && row.sex !== 'UNKNOWN' ? ` · ${{MALE:'Đực',FEMALE:'Cái'}[row.sex]}` : ''}</p></div><div className="pet-card-measures"><strong>{row.weightKg} kg</strong><small>{row.ageMonths !== undefined ? `${row.ageMonths} tháng tuổi` : 'Chưa rõ tuổi'}</small></div></div>
      <dl className="pet-card-care">{[['vaccination','Tiêm phòng'],['health','Sức khỏe'],['feeding','Chế độ ăn']].map(([key,title]) => <div key={key}><dt>{title}</dt><dd title={petCareStatus(row.careProfile?.[key])}>{petCareStatus(row.careProfile?.[key])}</dd></div>)}</dl>
      <p className="pet-card-note"><ShieldCheck size={16} /><span>{row.traits?.length ? row.traits.map(code => catalog.traits.find(trait => trait.code === code)?.label ?? code).join(' · ') : 'Xem hồ sơ để bổ sung đặc điểm và lưu ý chăm sóc.'}</span></p>
      <p className={`pet-readiness ${row.careNeedsConfirmed ? 'is-ready' : ''}`}>{row.careNeedsConfirmed ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}{row.careNeedsConfirmed ? 'Đã xác nhận nhu cầu chăm sóc' : 'Cần xác nhận nhu cầu chăm sóc'}</p>
      <div className="pet-card-actions"><Button onClick={() => edit(row)} disabled={busy || uncertain || photoBusy}><Pencil size={15} />Sửa hồ sơ</Button><Button variant="ghost" aria-label={`Xóa thú cưng ${row.name}`} onClick={() => {setArchive(row);setError('');}} disabled={busy || uncertain || photoBusy}><Archive size={17} /></Button></div></div>
    </li>)}<li className="pet-add-card"><span className="pet-add-symbol"><Plus size={28} /></span><h2>Bạn vừa đón bé mới?</h2><p>Tạo hồ sơ để lưu ảnh, thói quen và những lưu ý chăm sóc của bé.</p><Button variant="secondary" onClick={() => edit()} disabled={busy || uncertain}>Thêm thú cưng mới</Button></li></ul><p className="pet-privacy-note"><ShieldCheck size={16} />Thông tin chưa biết không được hiểu là không có dị ứng, thuốc hoặc rủi ro.</p></>}
    {pet && <PetProfileDetails key={pet.id} pet={pet} breed={breed(pet)} traits={catalog.traits} disabled={busy || uncertain || photoBusy}
      onEdit={(group, openImport) => edit(pet, group, openImport)} onArchive={() => { setArchive(pet); setError(''); }} onPhotoSaved={resource.retry} onPhotoBusyChange={setPhotoBusy} />}
    <Dialog open={Boolean(editor)} title={editor?.id ? `Chỉnh sửa hồ sơ ${draft?.name || 'thú cưng'}` : 'Thêm thú cưng'} className="pet-editor-dialog" dismissible={!busy && !uncertain && !importBusy} onClose={requestClose}>
      {editor && draft && catalog && <form className="pet-editor-form" onSubmit={save} onInvalidCapture={event => { const section = event.target.closest('details'); if (section) section.open = true; }} aria-label="Hồ sơ thú cưng">
        <div className="pet-editor-scroll">{!editor.id && <p className="pet-editor-intro">Lưu thông tin cơ bản trước. Bạn có thể thêm ảnh ở trang hồ sơ ngay sau đó.</p>}
        <PetRecordImport initiallyOpen={editor.openImport} disabled={busy || uncertain || photoBusy} onBusyChange={setImportBusy} onApply={entries => setDraft(value => ({ ...value, careNeedsConfirmed: false, careProfile: { ...value.careProfile, ...entries } }))} />
        <CustomerPetForm initialGroup={editor.group} draft={draft} change={setDraft} catalog={catalog} disabled={busy || uncertain || photoBusy || importBusy} />
        {error && <Notice state="error" title={error}>{stale && <Button variant="secondary" onClick={() => { setReloadAfterDiscard(true); setDiscard(true); }}>Tải lại hồ sơ</Button>}</Notice>}
        {uncertain && <Notice state="pending" title="Chưa xác định kết quả lưu"><Button disabled={busy} onClick={() => execute(attempt.current)}>Kiểm tra lại cùng yêu cầu</Button></Notice>}
        </div><div className="pet-editor-footer"><Button type="button" variant="secondary" onClick={requestClose} disabled={busy || uncertain || photoBusy || importBusy}>Hủy</Button><Button type="submit" loading={busy} disabled={uncertain || importBusy}>Lưu thú cưng</Button></div>
      </form>}
    </Dialog>
    <Dialog open={discard} title="Bỏ thay đổi chưa lưu?" dismissible={!busy} onClose={() => { setDiscard(false); setReloadAfterDiscard(false); }}><p>Thông tin bạn vừa sửa sẽ chưa được lưu vào hồ sơ.</p><Button variant="secondary" onClick={() => { setDiscard(false); setReloadAfterDiscard(false); }}>Tiếp tục chỉnh sửa</Button><Button variant="danger" onClick={() => { const reload = reloadAfterDiscard; close(); if (reload) resource.retry(); }}>{reloadAfterDiscard ? 'Tải lại và bỏ bản sửa' : 'Bỏ thay đổi'}</Button></Dialog>
    <Dialog open={Boolean(archive)} title={`Xóa hồ sơ ${archive?.name ?? 'thú cưng'}?`} intent="destructive" dismissible={!busy && !uncertain} onClose={() => setArchive(null)}>
      <p>Không thể xóa khi còn buổi chăm chưa kết thúc. Hồ sơ đã xóa không dùng cho lịch mới; lịch sử đã đặt được giữ nguyên.</p><Button variant="danger" disabled={busy || uncertain || photoBusy} onClick={() => start({ type: 'archive', id: archive.id, version: archive.version })}>Xác nhận xóa</Button>
      {error && <Notice state="error" title={error} />}{uncertain && <Button disabled={busy} onClick={() => execute(attempt.current)}>Kiểm tra lại cùng yêu cầu</Button>}
    </Dialog>
    {error && !editor && !archive && <Notice state="error" title={error} />}
  </section>;
}
