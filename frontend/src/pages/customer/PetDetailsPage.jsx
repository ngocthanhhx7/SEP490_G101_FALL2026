import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Dialog, Input, Notice, Select } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { ApiError } from '../../services/api-client.js';
import { PET_FIELD_KEYS, PET_FIELD_STATUSES, PET_ID_PATTERN, petProfileApi } from '../../services/pet-profile-api.js';
import './pet-details.css';

const STATUS_LABELS = {
  KNOWN: 'Đã cung cấp',
  UNKNOWN: 'Chưa biết',
  NOT_PROVIDED: 'Chưa cung cấp',
  NOT_APPLICABLE: 'Không áp dụng',
  NEEDS_CONFIRMATION: 'Cần xác nhận lại',
};

const STATUS_HELP = {
  KNOWN: 'Thông tin đã có giá trị. Nguồn được ghi riêng với trạng thái.',
  UNKNOWN: 'Bạn chưa biết thông tin này; không có nghĩa là không có rủi ro.',
  NOT_PROVIDED: 'Bạn chưa cung cấp thông tin này.',
  NOT_APPLICABLE: 'Trường này không áp dụng cho hồ sơ hiện tại.',
  NEEDS_CONFIRMATION: 'Có thông tin cũ nhưng chưa đủ để sử dụng cho lần chăm sóc tiếp theo.',
};

const CUSTOMER_EDITABLE_STATUSES = PET_FIELD_STATUSES.filter((status) => status !== 'NOT_APPLICABLE');
const CUSTOMER_EDITABLE_STATUS_SET = new Set(CUSTOMER_EDITABLE_STATUSES);

const FIELD_INFO = {
  breed: { label: 'Giống', control: 'text', placeholder: 'Ví dụ: giống lai, chưa rõ giống' },
  approximate_age: { label: 'Tuổi ước tính', control: 'age' },
  identifying_marks: { label: 'Màu sắc hoặc dấu nhận diện', control: 'text', placeholder: 'Ví dụ: lông trắng ở ngực' },
  weight_kg: { label: 'Cân nặng gần nhất', control: 'weight' },
  handling_preferences: { label: 'Cách tiếp cận hoặc điều cần tránh', control: 'notes', placeholder: 'Mô tả điều bạn quan sát thấy, không cần gắn nhãn hành vi.' },
  feeding_instructions: { label: 'Thức ăn và cách cho ăn', control: 'notes', placeholder: 'Loại thức ăn, lượng, thời điểm hoặc hướng dẫn của bạn.' },
  water_instructions: { label: 'Hướng dẫn về nước uống', control: 'notes', placeholder: 'Ghi chú nếu có thao tác chăm sóc liên quan.' },
  dog_walk_instructions: { label: 'Dây dắt, tín hiệu và lưu ý khi đi dạo', control: 'notes', placeholder: 'Ghi chú cách dắt và giới hạn bạn muốn chia sẻ.' },
  dog_toileting_cues: { label: 'Tín hiệu hoặc thói quen vệ sinh', control: 'notes', placeholder: 'Ghi chú thói quen đã quan sát.' },
  cat_litter_instructions: { label: 'Khay cát và cách chăm sóc', control: 'notes', placeholder: 'Vị trí khay và hướng dẫn của bạn.' },
  cat_carrier_and_approach: { label: 'Lồng vận chuyển và cách tiếp cận', control: 'notes', placeholder: 'Chỉ ghi điều cần thiết cho dịch vụ có vận chuyển.' },
  customer_reported_health_notes: { label: 'Lưu ý sức khỏe do bạn cung cấp', control: 'notes', placeholder: 'Ghi điều bạn muốn người chăm sóc biết.' },
  medication_instructions: { label: 'Hướng dẫn thuốc do bạn cung cấp', control: 'notes', placeholder: 'Chỉ ghi theo hướng dẫn bạn có; Paw World Care không đề xuất liều dùng.' },
  vaccination_records: { label: 'Thông tin vaccine do bạn cung cấp', control: 'vaccines', placeholder: 'Mỗi dòng: tên vaccine — ngày tiêm YYYY-MM-DD (nếu biết).' },
  emergency_contact: { label: 'Liên hệ dự phòng', control: 'emergency' },
  veterinary_contact: { label: 'Cơ sở thú y bạn chọn', control: 'veterinary' },
};

const COMMON_GROUPS = [
  { title: 'Thông tin cơ bản', fields: ['breed', 'approximate_age', 'identifying_marks'] },
  { title: 'Chăm sóc hằng ngày', fields: ['feeding_instructions', 'water_instructions', 'handling_preferences'] },
  { title: 'Sức khỏe tùy chọn', fields: ['weight_kg', 'customer_reported_health_notes', 'medication_instructions', 'vaccination_records'] },
  { title: 'Liên hệ riêng tư', fields: ['emergency_contact', 'veterinary_contact'] },
];

const SPECIES_GROUPS = {
  DOG: { title: 'Riêng cho chó', fields: ['dog_walk_instructions', 'dog_toileting_cues'] },
  CAT: { title: 'Riêng cho mèo', fields: ['cat_litter_instructions', 'cat_carrier_and_approach'] },
};

const SPECIES_ONLY_FIELDS = {
  DOG: ['dog_walk_instructions', 'dog_toileting_cues'],
  CAT: ['cat_litter_instructions', 'cat_carrier_and_approach'],
};

const FIELD_STATUS_SET = new Set(PET_FIELD_STATUSES);
const FIELD_KEY_SET = new Set(PET_FIELD_KEYS);

function blankCareField() {
  return { status: 'NOT_PROVIDED', dirty: false };
}

function copyFieldValue(value) {
  if (Array.isArray(value)) return value.map(copyFieldValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, copyFieldValue(nested)]));
  }
  return value;
}

function createDraft(pet) {
  const careFields = {};
  for (const key of PET_FIELD_KEYS) {
    const source = pet.careFields?.[key];
    careFields[key] = source && FIELD_STATUS_SET.has(source.status)
      ? { ...source, value: copyFieldValue(source.value), priorValue: copyFieldValue(source.priorValue), dirty: false }
      : blankCareField();
  }
  return { name: pet.name, species: pet.species, careFields };
}

function displayValue(fieldKey, value) {
  if (value === null || value === undefined) return '';
  if (fieldKey === 'approximate_age' && typeof value === 'object') {
    const amount = value.amount;
    const unit = value.unit === 'MONTHS' ? 'tháng' : 'năm';
    return Number.isFinite(amount) ? `${amount} ${unit} (ước tính)` : '';
  }
  if (fieldKey === 'weight_kg' && typeof value === 'object') {
    if (!Number.isFinite(value.amount)) return '';
    return `${value.amount} kg${value.measuredAt ? ` · đo ngày ${value.measuredAt}` : ''}`;
  }
  if (fieldKey === 'vaccination_records' && Array.isArray(value)) {
    return value.map((record) => {
      if (typeof record === 'string') return record;
      if (!record || typeof record !== 'object') return '';
      return [record.name, record.date].filter(Boolean).join(' · ');
    }).filter(Boolean).join('; ');
  }
  if (fieldKey === 'emergency_contact' && typeof value === 'object') {
    return [value.name, value.relationship, value.phone].filter(Boolean).join(' · ');
  }
  if (fieldKey === 'veterinary_contact' && typeof value === 'object') {
    return [value.name, value.phone, value.address].filter(Boolean).join(' · ');
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

function sourceLabel(source) {
  if (source === 'CUSTOMER_REPORTED') return 'Customer cung cấp';
  if (source === 'DOCUMENT_ATTACHED') return 'Tài liệu Customer đính kèm · chưa được xác minh';
  if (source === 'PROFESSIONALLY_VERIFIED') return 'Nhãn nguồn cũ; quy trình xác minh chuyên môn chưa được tích hợp';
  return 'Nguồn chưa được ghi nhận';
}

function formatUpdatedAt(value) {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function parseVaccinationText(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf(' — ');
    if (separator < 0) return { name: line };
    return { name: line.slice(0, separator).trim(), date: line.slice(separator + 3).trim() };
  });
}

function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function messageForResourceError(code) {
  if (code === 'RESOURCE_NOT_FOUND') return 'Không tìm thấy hồ sơ thú cưng này.';
  if (code === 'INVALID_RESOURCE_ID') return 'Mã hồ sơ thú cưng không hợp lệ.';
  if (code === 'UNAUTHENTICATED') return 'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại để xem hồ sơ.';
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') return 'Chưa thể kết nối máy chủ. Hồ sơ riêng tư không được giữ lại sau khi tải lại.';
  return 'Chưa thể tải hồ sơ. Hãy thử lại sau.';
}

function isAmbiguousAcknowledgement(error) {
  return error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT';
}

function validateDraft(draft) {
  const errors = {};
  if (!draft.name.trim()) errors.name = 'Vui lòng nhập tên thú cưng.';
  if (!['DOG', 'CAT'].includes(draft.species)) errors.species = 'Chọn chó hoặc mèo.';

  for (const key of PET_FIELD_KEYS) {
    const field = draft.careFields[key];
    if (!field?.dirty || field.status !== 'KNOWN') continue;
    const value = field.value;
    let valid = value !== null && value !== undefined && value !== '';
    if (key === 'approximate_age') valid = Number.isFinite(value?.amount) && value.amount >= 0;
    if (key === 'weight_kg') valid = Number.isFinite(value?.amount) && value.amount > 0 && Boolean(value.measuredAt);
    if (key === 'vaccination_records') valid = Array.isArray(value)
      && value.some((record) => record?.name?.trim())
      && value.every((record) => !record?.date || isValidDateOnly(record.date));
    if (key === 'emergency_contact') valid = Boolean(value?.name?.trim() && value?.relationship?.trim() && value?.phone?.trim());
    if (key === 'veterinary_contact') valid = Boolean(value?.name?.trim());
    if (!valid) errors[key] = 'Nhập nội dung hoặc chọn một trạng thái khác.';
  }
  return errors;
}

function cleanCareFieldsForRequest(careFields) {
  return Object.fromEntries(PET_FIELD_KEYS.filter((key) => careFields[key]?.dirty).map((key) => {
    const field = careFields[key];
    const value = { status: field.status };
    if (field.status === 'KNOWN') value.value = copyFieldValue(field.value);
    if (field.status === 'NEEDS_CONFIRMATION' && field.priorValue !== undefined) {
      value.priorValue = copyFieldValue(field.priorValue);
    }
    return [key, value];
  }));
}

function CareFieldEditor({ fieldKey, field, error, disabled, onStatusChange, onValueChange }) {
  const info = FIELD_INFO[fieldKey];
  const idPrefix = `pet-${fieldKey.replaceAll('_', '-')}`;
  const known = field.status === 'KNOWN';
  const currentValue = field.value || {};
  const updateValue = (nextValue) => onValueChange(fieldKey, nextValue);
  const statusControl = <Select id={`${idPrefix}-status`} label={`${info.label} · trạng thái`}
    value={field.status} disabled={disabled} onChange={(event) => onStatusChange(fieldKey, event.target.value)}>
    {field.status === 'NOT_APPLICABLE' && <option value="NOT_APPLICABLE" disabled>{STATUS_LABELS.NOT_APPLICABLE} · theo loài/dịch vụ</option>}
    {CUSTOMER_EDITABLE_STATUSES.map((status) => <option value={status} key={status}>{STATUS_LABELS[status]}</option>)}
  </Select>;

  let valueControl = null;
  if (known && info.control === 'age') {
    valueControl = <div className="pet-details__split-fields">
      <Input id={`${idPrefix}-amount`} label="Tuổi ước tính" type="number" min="0" step="any"
        value={currentValue.amount ?? ''} error={error} disabled={disabled} onChange={(event) => updateValue({
          amount: event.target.value === '' ? '' : Number(event.target.value),
          unit: currentValue.unit || 'YEARS', estimated: true,
        })} />
      <Select id={`${idPrefix}-unit`} label="Đơn vị tuổi" value={currentValue.unit || 'YEARS'}
        disabled={disabled} onChange={(event) => updateValue({ ...currentValue, unit: event.target.value, estimated: true })}>
        <option value="YEARS">Năm</option><option value="MONTHS">Tháng</option>
      </Select>
    </div>;
  } else if (known && info.control === 'weight') {
    valueControl = <div className="pet-details__split-fields">
      <Input id={`${idPrefix}-amount`} label="Cân nặng (kg)" type="number" min="0" step="any"
        value={currentValue.amount ?? ''} error={error} disabled={disabled} onChange={(event) => updateValue({
          ...currentValue, amount: event.target.value === '' ? '' : Number(event.target.value), unit: 'KG',
        })} />
      <Input id={`${idPrefix}-date`} label="Ngày cân gần nhất" type="date" required
        value={currentValue.measuredAt || ''} error={error} disabled={disabled} onChange={(event) => updateValue({
          ...currentValue, measuredAt: event.target.value, unit: 'KG',
        })} />
    </div>;
  } else if (known && info.control === 'vaccines') {
    const lines = Array.isArray(currentValue)
      ? currentValue.map((record) => typeof record === 'string' ? record
        : [record?.name, record?.date].filter(Boolean).join(' — ')).join('\n')
      : '';
    valueControl = <label className="pet-details__textarea-field" htmlFor={`${idPrefix}-value`}>
      <span>{info.label}</span>
      <textarea id={`${idPrefix}-value`} className="pet-details__textarea" value={lines}
        placeholder={info.placeholder} disabled={disabled} aria-invalid={Boolean(error)}
        aria-describedby={error ? `${idPrefix}-error` : `${idPrefix}-hint`}
        onChange={(event) => updateValue(parseVaccinationText(event.target.value))} />
      {!error && <span id={`${idPrefix}-hint`} className="pet-details__field-hint">Ghi ngày nếu bạn biết; không cần hồ sơ vaccine để tạo hoặc đặt dịch vụ.</span>}
      {error && <span id={`${idPrefix}-error`} className="pet-details__field-error">{error}</span>}
    </label>;
  } else if (known && info.control === 'emergency') {
    valueControl = <div className="pet-details__split-fields">
      <Input id={`${idPrefix}-name`} label="Tên người liên hệ" value={currentValue.name || ''}
        error={error} disabled={disabled} onChange={(event) => updateValue({ ...currentValue, name: event.target.value })} />
      <Input id={`${idPrefix}-relationship`} label="Mối quan hệ" value={currentValue.relationship || ''}
        disabled={disabled} onChange={(event) => updateValue({ ...currentValue, relationship: event.target.value })} />
      <Input id={`${idPrefix}-phone`} label="Số điện thoại" type="tel" autoComplete="tel" value={currentValue.phone || ''}
        disabled={disabled} onChange={(event) => updateValue({ ...currentValue, phone: event.target.value })} />
    </div>;
  } else if (known && info.control === 'veterinary') {
    valueControl = <div className="pet-details__split-fields">
      <Input id={`${idPrefix}-name`} label="Tên cơ sở thú y" value={currentValue.name || ''}
        error={error} disabled={disabled} onChange={(event) => updateValue({ ...currentValue, name: event.target.value })} />
      <Input id={`${idPrefix}-phone`} label="Số điện thoại (nếu biết)" type="tel" value={currentValue.phone || ''}
        disabled={disabled} onChange={(event) => updateValue({ ...currentValue, phone: event.target.value })} />
      <Input id={`${idPrefix}-address`} label="Địa chỉ (nếu biết)" value={currentValue.address || ''}
        disabled={disabled} onChange={(event) => updateValue({ ...currentValue, address: event.target.value })} />
    </div>;
  } else if (known && info.control === 'text') {
    valueControl = <Input id={`${idPrefix}-value`} label={info.label} value={typeof currentValue === 'string' ? currentValue : ''}
      placeholder={info.placeholder} error={error} disabled={disabled} onChange={(event) => updateValue(event.target.value)} />;
  } else if (known) {
    valueControl = <label className="pet-details__textarea-field" htmlFor={`${idPrefix}-value`}>
      <span>{info.label}</span>
      <textarea id={`${idPrefix}-value`} className="pet-details__textarea" value={typeof currentValue === 'string' ? currentValue : ''}
        placeholder={info.placeholder} disabled={disabled} aria-invalid={Boolean(error)}
        aria-describedby={error ? `${idPrefix}-error` : undefined}
        onChange={(event) => updateValue(event.target.value)} />
      {error && <span id={`${idPrefix}-error`} className="pet-details__field-error">{error}</span>}
    </label>;
  }

  return <div className="pet-details__care-field">
    <div className="pet-details__care-heading"><h3>{info.label}</h3>{statusControl}</div>
    {known ? valueControl : <p className="pet-details__field-hint">{STATUS_HELP[field.status]}</p>}
    {field.status === 'NEEDS_CONFIRMATION' && field.priorValue !== undefined
      && <p className="pet-details__prior-value">Thông tin cũ (chưa dùng): {displayValue(fieldKey, field.priorValue)}</p>}
    {error && info.control !== 'notes' && info.control !== 'vaccines' && <p className="pet-details__field-error" role="alert">{error}</p>}
  </div>;
}

function CareFieldSummary({ fieldKey, field }) {
  const status = FIELD_STATUS_SET.has(field?.status) ? field.status : 'NOT_PROVIDED';
  const value = displayValue(fieldKey, field?.value);
  return <div className="pet-details__summary-field">
    <div className="pet-details__summary-heading">
      <dt>{FIELD_INFO[fieldKey].label}</dt>
      <dd><span className={`pet-details__status pet-details__status--${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span></dd>
    </div>
    {status === 'KNOWN' && <>
      <dd className="pet-details__summary-value">{value || 'Thông tin đã cung cấp chưa có giá trị hiển thị.'}</dd>
      <dd className="pet-details__source">{sourceLabel(field.source)}</dd>
      {field.updatedAt && <dd className="pet-details__updated">Cập nhật {formatUpdatedAt(field.updatedAt)}</dd>}
    </>}
    {status !== 'KNOWN' && <dd className="pet-details__field-hint">{STATUS_HELP[status]}</dd>}
    {status === 'NEEDS_CONFIRMATION' && field.priorValue !== undefined
      && <dd className="pet-details__prior-value">Thông tin cũ (chưa dùng): {displayValue(fieldKey, field.priorValue)}</dd>}
  </div>;
}

function isSpeciesField(fieldKey, species) {
  return SPECIES_ONLY_FIELDS[species]?.includes(fieldKey) || false;
}

export function PetDetailsPage({ petId: suppliedPetId, api = petProfileApi, onBack }) {
  const route = useParams();
  const petId = suppliedPetId || route.petId || '';
  const validId = PET_ID_PATTERN.test(petId);
  const loadPet = useCallback(({ signal }) => {
    if (!PET_ID_PATTERN.test(petId)) throw new ApiError('INVALID_RESOURCE_ID', 400);
    return api.getPet(petId, { signal });
  }, [api, petId]);
  const resource = useApiResource(loadPet);
  const [pet, setPet] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [commandNotice, setCommandNotice] = useState(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const formRef = useRef(null);

  useEffect(() => {
    if (resource.status === 'loading') {
      setPet(null);
      setDraft(null);
      setEditing(false);
      setCommandNotice(null);
      setReconciliationRequired(false);
      return;
    }
    if (resource.status === 'success' && resource.data) {
      setPet(resource.data);
      setDraft(null);
      setEditing(false);
      setCommandNotice(null);
      setReconciliationRequired(false);
    }
  }, [resource.status, resource.data, petId]);

  useEffect(() => {
    if (Object.keys(formErrors).length > 0) {
      formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
    }
  }, [formErrors]);

  const visibleGroups = useMemo(() => pet ? [
    ...COMMON_GROUPS.slice(0, 2),
    SPECIES_GROUPS[editing && draft ? draft.species : pet.species],
    ...COMMON_GROUPS.slice(2),
  ] : [], [pet?.species, editing, draft?.species]);

  function beginEdit() {
    if (!pet || pet.state !== 'ACTIVE') return;
    setDraft(createDraft(pet));
    setFormErrors({});
    setCommandNotice(null);
    setEditing(true);
  }

  function updateFieldValue(fieldKey, value) {
    setDraft((current) => ({ ...current, careFields: {
      ...current.careFields,
      [fieldKey]: { ...current.careFields[fieldKey], value, dirty: true },
    } }));
    setFormErrors((current) => ({ ...current, [fieldKey]: undefined }));
    if (!reconciliationRequired) setCommandNotice(null);
  }

  function updateFieldStatus(fieldKey, status) {
    if (!FIELD_KEY_SET.has(fieldKey) || !CUSTOMER_EDITABLE_STATUS_SET.has(status)) return;
    setDraft((current) => {
      const previous = current.careFields[fieldKey];
      const value = { ...previous, status, dirty: true };
      if (status !== 'KNOWN') delete value.value;
      if (status === 'NEEDS_CONFIRMATION') {
        const priorValue = previous.status === 'KNOWN' ? previous.value : previous.priorValue;
        if (priorValue !== undefined) value.priorValue = copyFieldValue(priorValue);
      } else {
        delete value.priorValue;
      }
      if (status === 'KNOWN' && previous.status !== 'KNOWN') delete value.value;
      return { ...current, careFields: { ...current.careFields, [fieldKey]: value } };
    });
    setFormErrors((current) => ({ ...current, [fieldKey]: undefined }));
  }

  function updateSpecies(species) {
    setDraft((current) => {
      if (current.species === species) return current;
      const careFields = { ...current.careFields };
      for (const fieldKey of SPECIES_ONLY_FIELDS[current.species] || []) {
        careFields[fieldKey] = { status: 'NOT_APPLICABLE', dirty: true };
      }
      for (const fieldKey of SPECIES_ONLY_FIELDS[species] || []) {
        if (careFields[fieldKey]?.status === 'NOT_APPLICABLE') {
          careFields[fieldKey] = { status: 'NOT_PROVIDED', dirty: true };
        }
      }
      return { ...current, species, careFields };
    });
    setFormErrors((current) => ({ ...current, species: undefined }));
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!pet || !draft || saving || reconciliationRequired) return;
    const nextErrors = validateDraft(draft);
    setFormErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    setCommandNotice(null);
    try {
      const result = await api.updatePet(pet.id, {
        name: draft.name.trim(),
        species: draft.species,
        careFields: cleanCareFieldsForRequest(draft.careFields),
      }, { expectedVersion: pet.version });
      if (result?.pending) {
        setReconciliationRequired(true);
        setCommandNotice({ state: 'pending', title: 'Đang chờ máy chủ xác nhận',
          message: 'Yêu cầu đã được tiếp nhận nhưng chưa có xác nhận hồ sơ được lưu. Tải lại hồ sơ để kiểm tra trạng thái.' });
        return;
      }
      setPet(result.data);
      setDraft(null);
      setEditing(false);
      setCommandNotice({ state: 'success', title: 'Hồ sơ đã được cập nhật',
        message: 'Máy chủ đã xác nhận phiên bản hồ sơ mới. Snapshot dịch vụ đã xác nhận vẫn giữ nguyên.' });
    } catch (error) {
      if (isAmbiguousAcknowledgement(error)) {
        setReconciliationRequired(true);
        setCommandNotice({ state: 'pending', title: 'Chưa nhận được xác nhận',
          message: 'Máy chủ chưa xác nhận thay đổi. Không gửi lại yêu cầu; hãy tải lại hồ sơ để kiểm tra dữ liệu hiện tại.' });
      } else if (error?.code === 'VERSION_CONFLICT' || error?.status === 409) {
        setReconciliationRequired(true);
        setCommandNotice({ state: 'warning', title: 'Hồ sơ đã thay đổi',
          message: 'Một phiên bản mới hơn đã được lưu. Chưa thể áp dụng bản sửa này. Tải lại hồ sơ trước khi tiếp tục.' });
      } else if (error?.status === 403 || error?.code === 'FORBIDDEN') {
        setCommandNotice({ state: 'forbidden', title: 'Không thể sửa hồ sơ',
          message: 'Bạn không có quyền chỉnh sửa hồ sơ này.' });
      } else if (error?.status === 404 || error?.code === 'RESOURCE_NOT_FOUND') {
        setCommandNotice({ state: 'error', title: 'Không tìm thấy hồ sơ',
          message: 'Không tìm thấy hồ sơ thú cưng này.' });
      } else if (error?.status === 422) {
        setCommandNotice({ state: 'error', title: 'Cần kiểm tra thông tin',
          message: 'Máy chủ chưa chấp nhận một hoặc nhiều trường. Kiểm tra nội dung rồi thử lại.' });
      } else {
        setCommandNotice({ state: 'error', title: 'Chưa thể cập nhật hồ sơ',
          message: 'Máy chủ chưa xác nhận thay đổi. Kiểm tra kết nối hoặc tải lại hồ sơ.' });
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!pet || pet.state !== 'ACTIVE' || archiving || reconciliationRequired) return;
    setArchiving(true);
    setCommandNotice(null);
    try {
      const result = await api.archivePet(pet.id, { expectedVersion: pet.version });
      if (result?.pending) {
        setReconciliationRequired(true);
        setArchiveDialogOpen(false);
        setCommandNotice({ state: 'pending', title: 'Đang chờ xác nhận lưu trữ',
          message: 'Yêu cầu đã được tiếp nhận, nhưng hồ sơ chưa được xác nhận là đã lưu trữ. Tải lại để kiểm tra trạng thái.' });
        return;
      }
      setPet(result.data);
      setDraft(null);
      setEditing(false);
      setArchiveDialogOpen(false);
      setCommandNotice({ state: 'success', title: 'Đã lưu trữ hồ sơ',
        message: 'Hồ sơ có thể được xem cho lịch sử; các snapshot dịch vụ đã xác nhận không bị thay đổi.' });
    } catch (error) {
      setArchiveDialogOpen(false);
      if (isAmbiguousAcknowledgement(error)) {
        setReconciliationRequired(true);
        setCommandNotice({ state: 'pending', title: 'Chưa nhận được xác nhận',
          message: 'Máy chủ chưa xác nhận trạng thái lưu trữ. Tải lại hồ sơ để kiểm tra; không gửi lại yêu cầu.' });
      } else if (error?.code === 'VERSION_CONFLICT' || error?.status === 409) {
        setReconciliationRequired(true);
        setCommandNotice({ state: 'warning', title: 'Hồ sơ đã thay đổi',
          message: 'Một phiên bản mới hơn đã được lưu. Chưa thể lưu trữ hồ sơ này. Tải lại để kiểm tra.' });
      } else if (error?.status === 403 || error?.code === 'FORBIDDEN') {
        setCommandNotice({ state: 'forbidden', title: 'Không thể lưu trữ hồ sơ',
          message: 'Bạn không có quyền thực hiện thao tác này.' });
      } else {
        setCommandNotice({ state: 'error', title: 'Chưa thể lưu trữ hồ sơ',
          message: 'Máy chủ chưa xác nhận thao tác lưu trữ. Tải lại hồ sơ để kiểm tra trạng thái.' });
      }
    } finally {
      setArchiving(false);
    }
  }

  function reconcile() {
    setCommandNotice(null);
    setReconciliationRequired(false);
    setArchiveDialogOpen(false);
    setPet(null);
    setDraft(null);
    setEditing(false);
    resource.retry();
  }

  const backAction = onBack ? <Button variant="ghost" onClick={onBack}>Quay lại danh sách</Button> : null;
  const resourceAction = <Button variant="secondary" onClick={resource.retry}>Tải lại</Button>;

  if (!validId) {
    return <section className="pet-details" aria-labelledby="pet-details-title">
      <h1 id="pet-details-title">Hồ sơ thú cưng</h1>
      <Notice state="error" title="Mã hồ sơ không hợp lệ">Đường dẫn không chứa mã thú cưng hợp lệ.</Notice>
      {backAction}
    </section>;
  }

  if (resource.status === 'loading') {
    return <section className="pet-details" aria-labelledby="pet-details-title">
      <h1 id="pet-details-title">Hồ sơ thú cưng</h1>
      <Notice state="loading" title="Đang tải hồ sơ">Đang tải dữ liệu riêng tư từ máy chủ.</Notice>
    </section>;
  }

  if (resource.status === 'pending') {
    return <section className="pet-details" aria-labelledby="pet-details-title">
      <h1 id="pet-details-title">Hồ sơ thú cưng</h1>
      <Notice state="pending" title="Đang chờ xác nhận hồ sơ">Máy chủ chưa xác nhận dữ liệu hồ sơ. Trạng thái này không đồng nghĩa với đã lưu.</Notice>
      {resourceAction}
    </section>;
  }

  if (resource.status === 'empty') {
    return <section className="pet-details" aria-labelledby="pet-details-title">
      <h1 id="pet-details-title">Hồ sơ thú cưng</h1>
      <Notice state="empty" title="Chưa có dữ liệu hồ sơ">Máy chủ chưa trả về hồ sơ thú cưng.</Notice>
      {resourceAction}
    </section>;
  }

  if (resource.status === 'forbidden') {
    return <section className="pet-details" aria-labelledby="pet-details-title">
      <h1 id="pet-details-title">Hồ sơ thú cưng</h1>
      <Notice state="forbidden" title="Không thể xem hồ sơ">Bạn không có quyền truy cập hồ sơ này.</Notice>
      {backAction}
    </section>;
  }

  if (resource.status === 'error') {
    const notFound = resource.code === 'RESOURCE_NOT_FOUND';
    return <section className="pet-details" aria-labelledby="pet-details-title">
      <h1 id="pet-details-title">Hồ sơ thú cưng</h1>
      <Notice state="error" title={notFound ? 'Không tìm thấy hồ sơ' : 'Chưa thể tải hồ sơ'}>
        {messageForResourceError(resource.code)}
      </Notice>
      <div className="pet-details__actions">{resourceAction}{backAction}</div>
    </section>;
  }

  if (!pet) {
    return <section className="pet-details" aria-labelledby="pet-details-title">
      <h1 id="pet-details-title">Hồ sơ thú cưng</h1>
      <Notice state="loading" title="Đang đồng bộ hồ sơ">Đang hoàn tất việc hiển thị dữ liệu đã tải.</Notice>
    </section>;
  }

  const archived = pet.state === 'ARCHIVED';
  const submitDisabled = saving || archiving || reconciliationRequired;
  const speciesChange = editing && draft?.species !== pet.species;

  return <section className="pet-details" aria-labelledby="pet-details-title">
    <div className="pet-details__topline">{backAction}<span>Hồ sơ thú cưng</span></div>
    <header className="pet-details__header">
      <div className="pet-details__avatar" aria-hidden="true">{pet.species === 'DOG' ? 'Chó' : 'Mèo'}</div>
      <div className="pet-details__heading">
        <p className="pet-details__eyebrow">{pet.species === 'DOG' ? 'Hồ sơ chó' : 'Hồ sơ mèo'}</p>
        <h1 id="pet-details-title">{pet.name}</h1>
        <span className={`pet-details__state ${archived ? 'pet-details__state--archived' : ''}`}>
          {archived ? 'Đã lưu trữ' : 'Đang hoạt động'}
        </span>
      </div>
      <div className="pet-details__header-actions">
        {!archived && !editing && <Button variant="primary" onClick={beginEdit}>Chỉnh sửa hồ sơ</Button>}
        {!archived && !editing && <Button variant="secondary" onClick={() => setArchiveDialogOpen(true)}
          disabled={reconciliationRequired}>Lưu trữ hồ sơ</Button>}
      </div>
    </header>

    {archived && <Notice state="info" title="Hồ sơ đã lưu trữ">
      Bạn vẫn có thể xem thông tin phục vụ lịch sử. Lưu trữ không xóa hoặc thay đổi snapshot của booking/visit đã xác nhận.
    </Notice>}
    {!archived && <div className="pet-details__photo-card">
      <div><h2>Ảnh nhận diện</h2><p>Ảnh riêng tư chưa khả dụng vì kho media và quyền tải/xem chưa được tích hợp.</p></div>
      <Button variant="secondary" disabled aria-describedby="pet-photo-pending">Thêm ảnh (chưa khả dụng)</Button>
      <span id="pet-photo-pending" className="pet-details__visually-hidden">
        Chưa có nhà cung cấp upload media riêng tư hoặc hợp đồng đọc ảnh đã tích hợp.
      </span>
    </div>}

    <Notice state="pending" title="PROVISIONAL · INTEGRATION_PENDING">
      Màn hình và PetView adapter đang chờ tích hợp. Route đăng ký, phiên/CSRF thật và quyền sở hữu phía server chưa được xác minh. Lịch sử/audit hồ sơ và cơ chế snapshot booking/visit chưa được nối; quy tắc dự kiến theo P01 là sửa hồ sơ không tự đổi hướng dẫn đã xác nhận.
    </Notice>

    <Notice state="info" title="Hồ sơ và hướng dẫn theo từng dịch vụ">
      Theo quy tắc dự kiến của P01, hướng dẫn chăm sóc được xác nhận sẽ có snapshot riêng trên booking/visit. Màn hình này chưa thể đọc hoặc xác minh snapshot đó; hãy dùng quy trình booking được tích hợp trước khi dựa vào thay đổi hướng dẫn.
    </Notice>

    {commandNotice && <Notice state={commandNotice.state} title={commandNotice.title}
      action={reconciliationRequired ? <Button variant="secondary" onClick={reconcile}>Tải lại hồ sơ</Button> : undefined}>
      {commandNotice.message}
    </Notice>}

    {editing && draft ? <form ref={formRef} className="pet-details__form" noValidate onSubmit={submitEdit}>
      <section className="pet-details__section" aria-labelledby="pet-edit-basic-title">
        <h2 id="pet-edit-basic-title">Thông tin cơ bản</h2>
        <div className="pet-details__split-fields">
          <Input label="Tên thú cưng" required value={draft.name} error={formErrors.name}
            disabled={saving || reconciliationRequired}
            onChange={(event) => { setDraft((current) => ({ ...current, name: event.target.value })); setFormErrors((current) => ({ ...current, name: undefined })); }} />
          <Select label="Loài" required value={draft.species} error={formErrors.species}
            disabled={saving || reconciliationRequired} onChange={(event) => updateSpecies(event.target.value)}>
            <option value="DOG">Chó</option><option value="CAT">Mèo</option>
          </Select>
        </div>
        {speciesChange && <Notice state="warning" title="Bạn đang đổi loài">
          Các trường chỉ dành cho loài cũ sẽ chuyển thành “Không áp dụng”; hãy kiểm tra lại các trường riêng của loài mới trước khi lưu.
        </Notice>}
      </section>

      {visibleGroups.map((group) => <section className="pet-details__section" key={group.title} aria-labelledby={`pet-group-${group.title.replaceAll(' ', '-')}`}>
        <h2 id={`pet-group-${group.title.replaceAll(' ', '-')}`}>{group.title}</h2>
        {group.title === 'Sức khỏe tùy chọn' && <p className="pet-details__health-note">
          Nội dung sức khỏe và vaccine do Customer cung cấp hoặc đính kèm; đây không phải chẩn đoán hay xác nhận chuyên môn. Vaccine không bắt buộc để tạo hồ sơ hoặc đặt dịch vụ.
        </p>}
        {group.title === 'Liên hệ riêng tư' && <p className="pet-details__health-note">
          Chỉ cung cấp thông tin liên hệ của người khác khi bạn có quyền chia sẻ; không hứa rằng Paw World Care sẽ liên hệ hoặc đưa thú cưng đi khám.
        </p>}
        <div className="pet-details__field-grid">
          {group.fields.map((fieldKey) => <CareFieldEditor key={fieldKey} fieldKey={fieldKey}
            field={draft.careFields[fieldKey]} error={formErrors[fieldKey]} disabled={saving || reconciliationRequired}
            onStatusChange={updateFieldStatus} onValueChange={updateFieldValue} />)}
        </div>
      </section>)}

      <section className="pet-details__section" aria-labelledby="pet-edit-photo-title">
        <h2 id="pet-edit-photo-title">Ảnh riêng tư</h2>
        <Notice state="pending" title="Chưa thể tải ảnh lên">
          Tính năng ảnh đang chờ tích hợp nhà cung cấp media riêng tư, kiểm tra tệp và hợp đồng quyền truy cập. Chưa có tệp nào được tải lên.
        </Notice>
      </section>

      <div className="pet-details__form-actions">
        <Button type="submit" loading={saving} loadingLabel="Đang chờ máy chủ…" disabled={submitDisabled}>
          Lưu thay đổi
        </Button>
        <Button variant="secondary" disabled={saving || reconciliationRequired} onClick={() => {
          setEditing(false); setDraft(null); setFormErrors({}); setCommandNotice(null);
        }}>Hủy</Button>
      </div>
    </form> : <div className="pet-details__profile">
      {visibleGroups.map((group) => <section className="pet-details__section" key={group.title} aria-labelledby={`pet-view-${group.title.replaceAll(' ', '-')}`}>
        <h2 id={`pet-view-${group.title.replaceAll(' ', '-')}`}>{group.title}</h2>
        {group.title === 'Sức khỏe tùy chọn' && <p className="pet-details__health-note">
          Thông tin sức khỏe/vaccine là nội dung Customer cung cấp, không phải chẩn đoán hoặc xác nhận chuyên môn. Không có giá trị vaccine nào là điều kiện đặt dịch vụ mặc định.
        </p>}
        {group.title === 'Liên hệ riêng tư' && <p className="pet-details__health-note">
          Thông tin liên hệ chỉ dành cho Customer xem và được chia sẻ theo quyền, nhu cầu xử lý visit/case.
        </p>}
        <dl className="pet-details__summary-grid">
          {group.fields.map((fieldKey) => <CareFieldSummary key={fieldKey} fieldKey={fieldKey} field={pet.careFields?.[fieldKey]} />)}
        </dl>
      </section>)}
      {!archived && <div className="pet-details__footer-actions">
        <Button onClick={beginEdit}>Chỉnh sửa hồ sơ</Button>
        <Button variant="secondary" disabled={reconciliationRequired} onClick={() => setArchiveDialogOpen(true)}>Lưu trữ hồ sơ</Button>
      </div>}
    </div>}

    <Dialog open={archiveDialogOpen} intent="destructive" title="Lưu trữ hồ sơ thú cưng?"
      description="Hồ sơ sẽ được lưu trữ thay vì xóa. Lịch sử và snapshot của booking/visit đã xác nhận vẫn được giữ nguyên."
      dismissible={!archiving} onClose={() => { if (!archiving) setArchiveDialogOpen(false); }}
      footer={<>
        <Button variant="secondary" disabled={archiving} onClick={() => setArchiveDialogOpen(false)}>Giữ hồ sơ</Button>
        <Button variant="danger" loading={archiving} loadingLabel="Đang lưu trữ…" disabled={archiving || reconciliationRequired}
          onClick={confirmArchive}>Xác nhận lưu trữ</Button>
      </>}>
      <p>Snapshot dịch vụ là bản hướng dẫn riêng theo lần xác nhận và không bị cập nhật theo hồ sơ này.</p>
    </Dialog>
  </section>;
}
