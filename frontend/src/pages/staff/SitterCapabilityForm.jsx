import { useRef, useState } from 'react';
import { Button, Input, Notice } from '../../components/ui/index.js';
import { sitterLabel } from '../../utils/sitter-management-format.js';

export function SitterCapabilityForm({ data, api, onSaved }) {
  const capability = data.capabilities;
  const [traits, setTraits] = useState(capability?.allowedTraits ?? []);
  const [services, setServices] = useState(capability?.services.map(s => s.id) ?? []);
  const [species, setSpecies] = useState(capability?.species ?? []);
  const [maxPets, setMaxPets] = useState(capability?.maxPets ?? 1), [maxWeightKg, setWeight] = useState(capability?.maxWeightKg ?? 5);
  const [active, setActive] = useState(capability?.active ?? true), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), operation = useRef(null);
  const toggle = (values, value) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    operation.current ??= { key: globalThis.crypto.randomUUID(), body: { expectedVersion: capability?.version ?? 0,
      serviceIds: services, species, maxPets: Number(maxPets), maxWeightKg: Number(maxWeightKg), active,
      allowedTraits: traits, reason } };
    try { await api.saveCapability(data.id, operation.current.body, operation.current.key); onSaved(); }
    catch (error) {
      setMessage(error.code === 'VERSION_CONFLICT' ? 'Hồ sơ đã đổi. Tải lại trước khi xác minh.' : error.code === 'CONTRACT_REQUIRED' ? 'Cần Admin xác minh hợp đồng đã ký trước.' : 'Chưa xác nhận được kết quả. Thử lại cùng thao tác hoặc tải lại hồ sơ.');
      if (error.status && error.status < 500 && !['INVALID_RESPONSE', 'REQUEST_PENDING'].includes(error.code)) operation.current = null;
    } finally { setBusy(false); }
  }
  return <details className="sitter-capability-editor"><summary>Xác minh năng lực nhận việc</summary>
    <p>Chọn đúng kỹ năng đã kiểm tra thực tế. Nguyện vọng ứng tuyển và số đánh giá không thay thế xác minh. Sitter mới không cần có đơn hay đánh giá trước.</p>
    <form onSubmit={save} className="workspace-form"><fieldset disabled={busy || Boolean(operation.current)}><legend>Dịch vụ đã xác minh</legend>
      {(data.serviceCatalog ?? []).map(service => <label key={service.id}><input type="checkbox" checked={services.includes(service.id)} onChange={() => setServices(toggle(services, service.id))} />{service.name ?? sitterLabel(service.code)}</label>)}
    </fieldset><fieldset disabled={busy || Boolean(operation.current)}><legend>Thú cưng có thể chăm sóc</legend>
      {['DOG', 'CAT'].map(value => <label key={value}><input type="checkbox" checked={species.includes(value)} onChange={() => setSpecies(toggle(species, value))} />{value === 'DOG' ? 'Chó' : 'Mèo'}</label>)}
      {(data.traitCatalog ?? []).map(trait => <label key={trait.code}><input type="checkbox" checked={traits.includes(trait.code)} onChange={() => setTraits(toggle(traits, trait.code))} />{trait.label}</label>)}
      <Input label="Số thú cưng tối đa mỗi buổi" type="number" min="1" max="10" required value={maxPets} onChange={e => setMaxPets(e.target.value)} />
      <Input label="Cân nặng tối đa mỗi thú cưng (kg)" type="number" min="0.1" max="150" step="0.1" required value={maxWeightKg} onChange={e => setWeight(e.target.value)} />
      <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Cho phép nhận việc trong năng lực này</label>
      <Input label="Căn cứ xác minh / lý do" required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
    </fieldset><p>Chỉ chọn đặc điểm chăm sóc đã xác minh. Lịch làm việc và điểm xuất phát được giữ nguyên. Thao tác này được lưu lịch sử.</p>
    {message && <Notice state="error" title="Chưa hoàn tất">{message}</Notice>}
    <Button type="submit" disabled={busy || !services.length || !species.length}>{operation.current ? 'Kiểm tra lại thao tác' : 'Lưu xác minh năng lực'}</Button></form>
  </details>;
}
