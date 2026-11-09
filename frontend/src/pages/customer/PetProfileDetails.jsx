import { useState } from 'react';
import { Archive, Camera, CheckCircle2, ClipboardPlus, HeartPulse, Pencil, Phone, ShieldCheck, Utensils } from 'lucide-react';
import { AvatarEditor, ProfileAvatar } from '../../components/common/ProfileAvatar.jsx';
import { Button, Dialog } from '../../components/ui/index.js';
import { PET_CARE_LABELS, petCareStatus } from '../../utils/customer-pet-profile.js';
import './pet-profile-details.css';

function CareNotes({ pet, fields }) {
  return <dl className="pet-profile-notes">{fields.map(key => <div key={key} className={pet.careProfile?.[key]?.status === 'KNOWN' ? 'has-note' : 'needs-note'}>
    <dt>{PET_CARE_LABELS[key]}</dt><dd>{petCareStatus(pet.careProfile?.[key])}</dd>
  </div>)}</dl>;
}

export function PetProfileDetails({ pet, breed, traits, disabled, onEdit, onArchive, onPhotoSaved, onPhotoBusyChange }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const species = pet.species === 'DOG' ? 'Chó' : 'Mèo';
  return <div className="pet-profile-details">
    <section className="pet-profile-hero" aria-label={`Tổng quan của ${pet.name}`}>
      <div className="pet-profile-photo"><ProfileAvatar petId={pet.id} label={`Ảnh của ${pet.name}`} fallback={species} className="pet-profile-portrait" />
        <Button variant="secondary" aria-label={`Đổi ảnh của ${pet.name}`} disabled={disabled} onClick={() => setPhotoOpen(true)}><Camera size={19} /></Button>
      </div>
      <div className="pet-profile-identity"><h1 id="customer-pets-title">{pet.name}</h1>
        <p className="pet-profile-species">{species} · {breed}</p>
        <dl className="pet-profile-facts"><div><dt>Giới tính</dt><dd>{{ MALE: 'Đực', FEMALE: 'Cái' }[pet.sex] ?? 'Chưa biết'}</dd></div><div><dt>Cân nặng</dt><dd>{pet.weightKg} kg</dd></div><div><dt>Tuổi ước tính</dt><dd>{pet.ageMonths !== undefined ? `${pet.ageMonths} tháng tuổi` : 'Chưa cung cấp'}</dd></div></dl>
        <p className={`pet-profile-confirmation ${pet.careNeedsConfirmed ? 'is-confirmed' : ''}`}>{pet.careNeedsConfirmed ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}{pet.careNeedsConfirmed ? 'Đã xác nhận nhu cầu chăm sóc' : 'Cần xác nhận nhu cầu chăm sóc'}</p>
      </div>
      <div className="pet-profile-traits" aria-label="Đặc điểm cần lưu ý">{pet.traits?.length ? pet.traits.map(code => <span key={code}>{traits.find(trait => trait.code === code)?.label ?? code}</span>) : <p>Chưa ghi nhận đặc điểm cần lưu ý.</p>}</div>
      <Button className="pet-profile-edit" disabled={disabled} onClick={() => onEdit('basic')}><Pencil size={18} />Chỉnh sửa hồ sơ</Button>
    </section>

    <div className="pet-profile-sections">
      <section className="pet-profile-panel pet-profile-daily" aria-labelledby="pet-daily-title"><header><h2 id="pet-daily-title"><Utensils size={21} />Chăm sóc hằng ngày</h2><Button variant="ghost" aria-label="Sửa chăm sóc hằng ngày" disabled={disabled} onClick={() => onEdit('daily')}><Pencil size={17} /></Button></header>
        <p className="pet-profile-hint">Bữa ăn và cách làm quen để người chăm sóc chuẩn bị tốt hơn.</p><CareNotes pet={pet} fields={['feeding', 'handling']} />
      </section>

      <section className="pet-profile-panel pet-profile-health" aria-labelledby="pet-health-title"><header><h2 id="pet-health-title"><HeartPulse size={21} />Sức khỏe và an toàn</h2><Button variant="ghost" aria-label="Sửa sức khỏe và an toàn" disabled={disabled} onClick={() => onEdit('health')}><Pencil size={17} /></Button></header>
        <p className="pet-profile-hint">Thông tin do bạn cung cấp, giúp chuẩn bị buổi chăm sóc.</p><CareNotes pet={pet} fields={['health', 'allergies', 'medication', 'vaccination']} />
        <div className="pet-profile-import"><ClipboardPlus size={24} /><div><h3>Đọc sổ từ ảnh hoặc PDF</h3><p>Đưa thông tin vào bản nháp để bạn kiểm tra trước khi lưu.</p></div><Button variant="secondary" disabled={disabled} onClick={() => onEdit('health', true)}>Đọc sổ bằng AI</Button></div>
      </section>

      <section className="pet-profile-panel pet-profile-contacts" aria-labelledby="pet-contact-title"><header><h2 id="pet-contact-title"><Phone size={21} />Liên hệ hỗ trợ</h2><Button variant="ghost" aria-label="Sửa liên hệ hỗ trợ" disabled={disabled} onClick={() => onEdit('contacts')}><Pencil size={17} /></Button></header>
        <p className="pet-profile-hint">Người liên hệ và phòng khám khi cần hỗ trợ.</p><CareNotes pet={pet} fields={['emergencyContact', 'veterinaryContact']} />
      </section>
    </div>
    <p className="pet-profile-disclaimer"><ShieldCheck size={18} />Thông tin chưa biết không được hiểu là không có dị ứng, thuốc hoặc rủi ro. Hãy cập nhật hồ sơ khi có thay đổi.</p>
    <div className="pet-profile-bottom"><Button variant="ghost" className="pet-profile-archive" disabled={disabled} onClick={onArchive}><Archive size={17} />Xóa hồ sơ thú cưng</Button></div>

    <Dialog open={photoOpen} title={`Ảnh của ${pet.name}`} className="pet-profile-photo-dialog" dismissible={!disabled} onClose={() => { if (!disabled) setPhotoOpen(false); }}>
      <div onCancel={event => event.stopPropagation()}>{photoOpen && <AvatarEditor petId={pet.id} label={`Ảnh của ${pet.name}`} fallback={species} onSaved={onPhotoSaved} onBusyChange={onPhotoBusyChange} />}</div>
    </Dialog>
  </div>;
}
