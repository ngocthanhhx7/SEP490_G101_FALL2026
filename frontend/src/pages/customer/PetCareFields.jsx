import { Select } from '../../components/ui/index.js';
import { PET_CARE_LABELS } from '../../utils/customer-pet-profile.js';
import { PetVaccinations } from './PetVaccinations.jsx';

export function PetCareFields({ fields, draft, change, disabled }) {
  return <div className="pet-editor-grid">{fields.map(key => {
    const value = draft.careProfile[key], label = PET_CARE_LABELS[key];
    const update = next => change({ ...draft, careNeedsConfirmed: false, careProfile: { ...draft.careProfile, [key]: next } });
    return <div className={`pet-care-field ${key === 'vaccination' ? 'pet-care-field--vaccines' : ''}`} key={key}>
      <Select label={label} aria-label={`Tình trạng thông tin: ${label}`} value={value.status} disabled={disabled} onChange={e => update({ status: e.target.value, value: '' })}>
        <option value="NOT_PROVIDED">Để bổ sung sau</option><option value="UNKNOWN">Tôi chưa biết</option><option value="KNOWN">Tôi có thông tin</option>
      </Select>
      {value.status === 'KNOWN' && (key === 'vaccination'
        ? <PetVaccinations value={value.value ?? ''} disabled={disabled} onChange={text => update({ ...value, value: text })} />
        : <label className="pet-care-note">Chi tiết {label.toLowerCase()}<textarea rows={3} required maxLength={2000} value={value.value ?? ''} disabled={disabled} onChange={e => update({ ...value, value: e.target.value })} /></label>)}
    </div>;
  })}</div>;
}
