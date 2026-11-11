import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Cat, Check, CheckCircle2, Clock3, Dog, FileHeart, Heart, ImagePlus, Mars, Minus, PawPrint, Plus, ShieldCheck, Sparkles, Upload, Venus } from 'lucide-react';
import { Button, Dialog, Input, Notice, Select } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { usePetCreation } from '../../hooks/usePetCreation.js';
import { createAvatarApi } from '../../services/avatar-api.js';
import { prepareAvatarImage } from '../../services/avatar-image.js';
import { PET_CARE_LABELS, petCareStatus } from '../../utils/customer-pet-profile.js';
import { PetCareFields } from './PetCareFields.jsx';
import { PetRecordImport } from './PetRecordImport.jsx';
import './pet-onboarding.css';

const STEPS = ['Làm quen', 'Ảnh của bé', 'Giống & tuổi', 'Cân nặng', 'Thói quen', 'Liên hệ', 'Sức khỏe', 'Xác nhận'];
const HEALTH = ['health', 'allergies', 'medication', 'vaccination'];
function Choice({ selected, icon: Icon, children, onClick, disabled }) {
  return <button type="button" className={`pet-wizard-choice ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={onClick} disabled={disabled}>
    <span className="pet-wizard-choice-icon"><Icon size={27} aria-hidden="true" /></span><span>{children}</span><span className="pet-wizard-choice-check">{selected && <Check size={16} aria-hidden="true" />}</span>
  </button>;
}
export function PetOnboardingWizard({ draft, change, catalog, api, onClose, onSaved, photoApi: suppliedPhotoApi, prepareImage = prepareAvatarImage }) {
  const session = useSession(), photoApi = useMemo(() => suppliedPhotoApi ?? createAvatarApi({ getCsrfToken: session.getCsrfToken }), [suppliedPhotoApi, session.getCsrfToken]);
  const [step, setStep] = useState(0), [file, setFile] = useState(null), [preview, setPreview] = useState(''), [photoError, setPhotoError] = useState(''), [preparing, setPreparing] = useState(false);
  const [healthMode, setHealthMode] = useState(''), [importBusy, setImportBusy] = useState(false), [discard, setDiscard] = useState(false), [validation, setValidation] = useState('');
  const initial = useRef(JSON.stringify(draft)), generation = useRef(0), form = useRef(null), heading = useRef(null);
  const submission = usePetCreation({ api, photoApi, onSaved });
  const locked = ['saving', 'pending', 'done'].includes(submission.state) || Boolean(submission.created), disabled = locked || preparing || importBusy;
  const name = draft.name.trim() || 'bé', species = draft.species === 'CAT' ? 'mèo' : 'cún';
  const field = (key, value) => { setValidation(''); change({ ...draft, [key]: value, careNeedsConfirmed: false }); };
  const traits = catalog.traits.filter(row => row.species.includes(draft.species));
  useEffect(() => { heading.current?.focus(); form.current?.closest('dialog')?.scrollTo?.(0, 0); }, [step]);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => () => { generation.current++; }, []);
  async function choosePhoto(source) {
    if (!source || disabled) return;
    const current = ++generation.current; setPreparing(true); setPhotoError('');
    try { const image = await prepareImage(source); if (generation.current === current) setFile(image); }
    catch { if (generation.current === current) setPhotoError('Chọn ảnh JPG/PNG tối đa 10 MB. Ảnh bị lỗi hoặc quá lớn cần xuất lại từ thư viện ảnh.'); }
    finally { if (generation.current === current) setPreparing(false); }
  }
  function requestClose() { if (disabled) return; if (JSON.stringify(draft) !== initial.current || file) setDiscard(true); else onClose(); }
  function next(event) {
    event.preventDefault(); if (disabled) return;
    if (!form.current.reportValidity()) return;
    if (step === 0 && !draft.name.trim()) { setValidation('Bé cần một cái tên để chúng mình làm quen nhé.'); return; }
    if (step === 6 && !healthMode) { setValidation('Chọn cách bổ sung thông tin sức khỏe cho bé nhé.'); return; }
    setValidation(''); setStep(value => Math.min(7, value + 1));
  }
  const titles = [`Chào bạn nhỏ! Bé tên là gì?`, `Cho chúng mình ngắm ${name} nhé!`, `${name} thuộc giống nào, bao nhiêu tuổi?`, `${name} nặng bao nhiêu nhỉ?`, `Điều gì khiến ${name} thật đặc biệt?`, `Khi cần, chúng mình liên hệ với ai?`, `Chăm chút sức khỏe cho ${name}`, `Hồ sơ xinh của ${name} đã sẵn sàng!`];
  const hints = ['Bắt đầu bằng vài điều nhỏ để chúng mình hiểu bé hơn.', 'Một tấm ảnh đáng yêu sẽ giúp người chăm sóc nhận ra bé dễ dàng hơn.', 'Chọn giống và tuổi gần đúng mà bạn biết về bé.', 'Cân nặng gần nhất giúp chuẩn bị dịch vụ phù hợp với bé.', 'Chia sẻ những thói quen và cách bé thích được chăm sóc.', 'Bạn có thể bổ sung người thân hoặc phòng khám quen của bé.', 'Có sổ sức khỏe thì tải lên, hoặc tự điền những điều bạn biết.', 'Cùng xem lại một lượt trước khi đón bé vào gia đình Paw World Care.'];
  return <>
    <Dialog open title="Thêm thú cưng" className="pet-onboarding-dialog" onClose={requestClose} dismissible={!disabled}>
      <div className="pet-wizard-shell"><PawPrint className="pet-wizard-decoration" size={150} aria-hidden="true" />
      <nav className="pet-wizard-progress" aria-label="Tiến trình thêm thú cưng"><span><PawPrint size={16} aria-hidden="true" />Bước {step + 1} trên {STEPS.length}</span><span>{STEPS[step]}</span><div role="progressbar" aria-label="Tiến trình" aria-valuemin={1} aria-valuemax={8} aria-valuenow={step + 1}><i style={{ width: `${(step + 1) / 8 * 100}%` }} /></div></nav>
      <header className="pet-wizard-heading"><span className="pet-wizard-kicker"><Sparkles size={15} aria-hidden="true" />MỘT NGƯỜI BẠN NHỎ, THẬT NHIỀU YÊU THƯƠNG</span><h2 tabIndex={-1} ref={heading}>{titles[step]}</h2><p>{hints[step]}</p></header>
      <form ref={form} className="pet-wizard-form" aria-label="Hồ sơ thú cưng từng bước" onSubmit={event => { if (step < 7) next(event); else { event.preventDefault(); if (!disabled) submission.save(draft, file); } }}>
        <fieldset disabled={disabled} className="pet-wizard-fields">
        {step === 0 && <><div className="pet-wizard-options pet-wizard-options--two" aria-label="Loài thú cưng">{[['DOG','Chó',Dog],['CAT','Mèo',Cat]].map(([value,label,Icon]) => <Choice key={value} icon={Icon} selected={draft.species === value} onClick={() => change({ ...draft, species: value, breedCode: '', traits: [], careNeedsConfirmed: false })}>{label}</Choice>)}</div>
          <Input label="Tên thú cưng" value={draft.name} required maxLength={100} placeholder={`Tên bé ${species} của bạn là…`} onChange={e => field('name', e.target.value)} />
          <fieldset className="pet-wizard-sex"><legend>Giới tính của bé</legend><div className="pet-wizard-options">{[['MALE','Bé trai',Mars],['FEMALE','Bé gái',Venus],['UNKNOWN','Chưa rõ',PawPrint]].map(([value,label,Icon]) => <Choice key={value} icon={Icon} selected={draft.sex === value} onClick={() => field('sex', value)}>{label}</Choice>)}</div></fieldset></>}
        {step === 1 && <><label className={`pet-wizard-photo ${preview ? 'has-photo' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choosePhoto(event.dataTransfer.files?.[0]); }}>
          {preview ? <img src={preview} alt={`Xem trước ảnh ${name}`} /> : <span className="pet-wizard-photo-symbol"><Camera size={42} aria-hidden="true" /></span>}
          <strong><ImagePlus size={19} aria-hidden="true" />{preview ? 'Chọn ảnh khác cho bé' : 'Chọn ảnh hoặc kéo thả vào đây'}</strong><span>JPG hoặc PNG · tối đa 10 MB</span><input type="file" aria-label="Ảnh thú cưng" accept="image/jpeg,image/png" onChange={e => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>{preparing && <p role="status">Đang chuẩn bị ảnh của bé…</p>}{photoError && <p role="alert">{photoError}</p>}{file && <Button variant="ghost" onClick={() => { setFile(null); setPhotoError(''); }}>Bỏ ảnh đã chọn</Button>}<p className="pet-wizard-soft-note">Chưa có ảnh ưng ý? Cứ tiếp tục, bạn có thể thêm ảnh sau nhé.</p></>}
        {step === 2 && <><Select label="Giống" value={draft.breedCode} required onChange={e => field('breedCode', e.target.value)}><option value="">Chọn giống của bé</option>{catalog.breeds.filter(row => row.species === draft.species).map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</Select>
          <div className="pet-wizard-age"><Select label="Số năm tuổi" value={draft.ageMonths === '' ? '' : Math.floor(Number(draft.ageMonths) / 12)} onChange={e => field('ageMonths', e.target.value === '' ? '' : Math.min(600, Number(e.target.value) * 12 + (Number(draft.ageMonths || 0) % 12)))}><option value="">Chưa rõ tuổi</option>{Array.from({length:51},(_,i) => <option key={i} value={i}>{i} tuổi</option>)}</Select>
          <Select label="Số tháng lẻ" disabled={draft.ageMonths === '' || Number(draft.ageMonths) >= 600} value={draft.ageMonths === '' ? '0' : Number(draft.ageMonths) % 12} onChange={e => field('ageMonths', Math.floor(Number(draft.ageMonths) / 12) * 12 + Number(e.target.value))}>{Array.from({length:12},(_,i) => <option key={i} value={i}>{i} tháng</option>)}</Select></div></>}
        {step === 3 && <div className="pet-wizard-weight"><Button variant="secondary" aria-label="Giảm cân nặng" disabled={Number(draft.weightKg) <= 0.1} onClick={() => field('weightKg', Math.max(0.1, Math.round((Number(draft.weightKg || 0.2) - 0.1) * 10) / 10))}><Minus size={23} /></Button><Input label="Cân nặng gần nhất (kg)" type="number" min="0.1" max="150" step="0.1" required value={draft.weightKg} placeholder="0.0" onChange={e => field('weightKg', e.target.value)} /><Button variant="secondary" aria-label="Tăng cân nặng" disabled={Number(draft.weightKg) >= 150} onClick={() => field('weightKg', Math.min(150, Math.round((Number(draft.weightKg || 0) + 0.1) * 10) / 10))}><Plus size={23} /></Button></div>}
        {step === 4 && <><div className="pet-wizard-traits">{traits.map((row,index) => <Choice key={row.code} icon={[Heart,ShieldCheck,PawPrint,Sparkles][index % 4]} selected={draft.traits.includes(row.code)} onClick={() => field('traits', draft.traits.includes(row.code) ? draft.traits.filter(code => code !== row.code) : [...draft.traits, row.code])}><strong>{row.label}</strong>{row.explanation && <small>{row.explanation}</small>}</Choice>)}</div><PetCareFields fields={['feeding','handling']} draft={draft} change={change} /></>}
        {step === 5 && <PetCareFields fields={['emergencyContact','veterinaryContact']} draft={draft} change={change} />}
        {step === 6 && <><div className="pet-wizard-health-options"><Choice icon={Upload} selected={healthMode === 'upload'} onClick={() => setHealthMode('upload')}><strong>Tải sổ sức khỏe</strong><small>Ảnh hoặc PDF, xem lại thông tin trước khi dùng</small></Choice><Choice icon={FileHeart} selected={healthMode === 'manual'} onClick={() => setHealthMode('manual')}><strong>Mình sẽ tự điền</strong><small>Ghi điều bạn biết, thêm từng mũi vaccine</small></Choice><Choice icon={Clock3} selected={healthMode === 'later'} onClick={() => setHealthMode('later')}><strong>Bổ sung sau nhé</strong><small>Vẫn tạo được hồ sơ cho bé hôm nay</small></Choice></div>
          {healthMode === 'upload' && <PetRecordImport initiallyOpen disabled={locked || preparing} onBusyChange={setImportBusy} onApply={entries => change({ ...draft, careNeedsConfirmed: false, careProfile: { ...draft.careProfile, ...entries } })} />}
          {['manual','upload'].includes(healthMode) && <PetCareFields fields={HEALTH} draft={draft} change={change} disabled={importBusy} />}
          {healthMode === 'later' && <p className="pet-wizard-soft-note">Bạn có thể cập nhật sức khỏe trong hồ sơ bất cứ lúc nào. Các thông tin đã nhập vẫn được giữ; chưa cung cấp không có nghĩa là bé không có rủi ro.</p>}</>}
        {step === 7 && <><div className="pet-wizard-review"><div className="pet-wizard-review-avatar">{preview ? <img src={preview} alt={`Ảnh ${name}`} /> : <PawPrint size={43} />}</div><h3>{name}</h3><p>{catalog.breeds.find(row => row.code === draft.breedCode)?.name} · {draft.weightKg} kg · {draft.ageMonths === '' ? 'Chưa rõ tuổi' : `${Math.floor(draft.ageMonths / 12)} tuổi ${draft.ageMonths % 12} tháng`}</p><p>{({MALE:'Bé trai',FEMALE:'Bé gái',UNKNOWN:'Chưa rõ giới tính'})[draft.sex]}</p></div>
          <dl className="pet-wizard-review-notes">{Object.keys(PET_CARE_LABELS).map(key => <div key={key}><dt>{PET_CARE_LABELS[key]}</dt><dd>{petCareStatus(draft.careProfile[key])}</dd></div>)}</dl>
          {Object.values(draft.careProfile).some(v => v.status === 'KNOWN' && (!v.value?.trim() || v.value.length > 2000)) && <p role="alert">Có mục sức khỏe hoặc chăm sóc chưa đủ thông tin. Quay lại để kiểm tra các mục đã chọn “Tôi có thông tin”.</p>}
          <label className="pet-profile-confirm"><input type="checkbox" checked={draft.careNeedsConfirmed} onChange={e => change({ ...draft, careNeedsConfirmed: e.target.checked })} /><span>Mình đã xem lại thông tin của bé.<small>Bạn vẫn có thể lưu và bổ sung sau. Thông tin chưa biết cần xác nhận trước buổi chăm sóc.</small></span></label></>}
        </fieldset>
        {validation && <p className="pet-form-error" role="alert">{validation}</p>}
        {submission.message && <Notice state={submission.state === 'pending' ? 'pending' : 'error'} title={submission.message} />}
        <footer className="pet-wizard-footer">{step > 0 && <Button variant="ghost" disabled={disabled} onClick={() => { setValidation(''); setStep(value => value - 1); }}><ArrowLeft size={17} />Quay lại</Button>}
          {!locked && <Button type="submit" disabled={disabled || (step === 7 && Object.values(draft.careProfile).some(v => v.status === 'KNOWN' && (!v.value?.trim() || v.value.length > 2000)))}>{step === 7 ? <><CheckCircle2 size={19} />Lưu hồ sơ của bé</> : <>{step === 1 && !file ? 'Để ảnh sau, tiếp tục' : 'Tiếp theo'}<ArrowRight size={18} /></>}</Button>}
          {(submission.state === 'pending' || submission.created) && <Button disabled={submission.state === 'saving'} onClick={() => submission.save(draft, file)}>Thử lại cùng yêu cầu</Button>}
          {submission.created && submission.state === 'error' && <Button variant="secondary" onClick={submission.finishWithoutPhoto}>Cập nhật ảnh sau</Button>}
          {submission.state === 'saving' && <p role="status">Đang lưu hồ sơ và ảnh của bé…</p>}
        </footer>
      </form></div>
    </Dialog>
    <Dialog open={discard} title="Để bé chờ một chút nhé?" onClose={() => setDiscard(false)}><p>Thông tin và ảnh đang chọn sẽ chưa được lưu nếu bạn rời lúc này.</p><Button onClick={() => setDiscard(false)}>Tiếp tục cùng bé</Button><Button variant="ghost" onClick={onClose}>Bỏ thay đổi</Button></Dialog>
  </>;
}
