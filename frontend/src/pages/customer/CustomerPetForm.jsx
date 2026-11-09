import { useState } from 'react';
import { Input, Select } from '../../components/ui/index.js';
import { PET_CARE_GROUPS, PET_CARE_LABELS } from '../../utils/customer-pet-profile.js';

export function CustomerPetForm({ draft, change, catalog, disabled }) {
  const [traitsOpen, setTraitsOpen] = useState(draft.traits.length > 0);
  const field = (name, value) => change({ ...draft, [name]: value, careNeedsConfirmed: false });
  const traits = catalog.traits?.filter(row => row.species.includes(draft.species)) ?? [];
  return <>
    <section className="pet-editor-section"><h3>Thông tin cơ bản</h3><p>Những thông tin cần để nhận diện thú cưng và chọn dịch vụ phù hợp.</p>
      <div className="pet-editor-grid"><Input label="Tên thú cưng" value={draft.name} required maxLength={100} disabled={disabled} onChange={e => field('name', e.target.value)} />
      <Select label="Loài" value={draft.species} disabled={disabled} onChange={e => change({ ...draft, species: e.target.value, breedCode: '', traits: [], careNeedsConfirmed: false })}>
        <option value="DOG">Chó</option><option value="CAT">Mèo</option></Select>
      <Select label="Giống" value={draft.breedCode} required disabled={disabled} onChange={e => field('breedCode', e.target.value)}>
        <option value="">Chọn giống</option>{catalog.breeds.filter(row => row.species === draft.species).map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</Select>
      <Input label="Cân nặng gần nhất (kg)" type="number" min="0.1" max="150" step="0.1" required value={draft.weightKg} disabled={disabled} onChange={e => field('weightKg', e.target.value)} />
      <Input label="Tuổi ước tính (tháng)" type="number" min="0" max="600" step="1" value={draft.ageMonths} disabled={disabled} onChange={e => field('ageMonths', e.target.value)} />
      <Select label="Giới tính" value={draft.sex} disabled={disabled} onChange={e => field('sex', e.target.value)}><option value="UNKNOWN">Chưa biết</option><option value="MALE">Đực</option><option value="FEMALE">Cái</option></Select></div>
    </section>
    {traits.length > 0 && <details className="pet-editor-section" open={traitsOpen} onToggle={event => setTraitsOpen(event.currentTarget.open)}><summary>Đặc điểm cần lưu ý <span>{draft.traits.length ? `Đã chọn ${draft.traits.length}` : 'Chọn nếu phù hợp'}</span></summary>
      <p>Chọn đặc điểm thực tế của thú cưng. Bạn có thể xem giải thích bên dưới mỗi lựa chọn.</p><div className="pet-trait-grid">
        {traits.map(row => <label className="pet-trait-option" key={row.code}><input type="checkbox" disabled={disabled} checked={draft.traits.includes(row.code)} onChange={e => field('traits', e.target.checked ? [...draft.traits, row.code] : draft.traits.filter(code => code !== row.code))} />
          <span>{row.label}{row.explanation && <small>{row.explanation}</small>}</span></label>)}
      </div></details>}
    {PET_CARE_GROUPS.map(group => <details className="pet-editor-section" key={group.title}>
      <summary>{group.title}<span>{group.fields.filter(key => draft.careProfile[key]?.status === 'KNOWN').length}/{group.fields.length} mục đã cung cấp</span></summary><p>{group.hint}</p>
      <div className="pet-editor-grid">{group.fields.map(key => {
        const value = draft.careProfile[key], label = PET_CARE_LABELS[key];
        const update = next => field('careProfile', { ...draft.careProfile, [key]: next });
        return <div className="pet-care-field" key={key}><Select label={label} aria-label={`Tình trạng thông tin: ${label}`} value={value.status} disabled={disabled} onChange={e => update({ status: e.target.value, value: '' })}>
          <option value="NOT_PROVIDED">Để bổ sung sau</option><option value="UNKNOWN">Tôi chưa biết</option><option value="KNOWN">Tôi có thông tin</option></Select>
          {value.status === 'KNOWN' && <label className="pet-care-note">Chi tiết {label.toLowerCase()}<textarea rows={3} required maxLength={2000} value={value.value ?? ''} disabled={disabled} onChange={e => update({ ...value, value: e.target.value })} /></label>}
        </div>;
      })}</div>
    </details>)}
    <label className="pet-profile-confirm"><input type="checkbox" checked={draft.careNeedsConfirmed} disabled={disabled} onChange={e => change({ ...draft, careNeedsConfirmed: e.target.checked })} /><span>Tôi đã kiểm tra thông tin và nhu cầu chăm sóc.<small>Thông tin chưa biết vẫn cần được xác nhận trước buổi chăm sóc. Bạn có thể lưu hồ sơ rồi bổ sung sau.</small></span></label>
  </>;
}
