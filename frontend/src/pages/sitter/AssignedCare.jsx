import { useCallback, useEffect, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button } from '../../components/ui/index.js';
import './assigned-care.css';

const labels = { feeding: 'Cho ăn', handling: 'Tiếp cận và thói quen', health: 'Sức khỏe', allergies: 'Dị ứng',
  medication: 'Thuốc theo hướng dẫn thú y', vaccination: 'Vaccine', emergencyContact: 'Liên hệ khẩn cấp', veterinaryContact: 'Phòng khám thú y' };
function CareDetails({ api, visitId }) {
  const load = useCallback(({ signal }) => api.care(visitId, { signal }), [api, visitId]);
  const care = useApiResource(load), [notes, setNotes] = useState(null), [error, setError] = useState('');
  const command = useSchedulingCommand(care.retry);
  useEffect(() => {
    const timer = globalThis.setInterval(() => { setNotes(null); care.retry(); }, 30000);
    return () => globalThis.clearInterval(timer);
  }, [care.retry]);
  async function access() {
    setNotes(null); setError('');
    try { const result = await api.accessNotes(visitId); setNotes(result.data); }
    catch { setError('Chưa được mở ghi chú ra vào. Kiểm tra ca đã nhận, xác nhận hồ sơ và thời gian truy cập.'); }
  }
  useEffect(() => {
    if (!notes) return undefined;
    const timer = setTimeout(() => setNotes(null), Math.max(0, Date.parse(notes.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [notes]);
  if (care.status === 'loading') return <p role="status">Đang tải hồ sơ chăm sóc…</p>;
  if (care.status !== 'success') return <p role="alert">Hồ sơ chưa khả dụng cho ca này.</p>;
  return <section className="assigned-care" aria-label="Hồ sơ chăm sóc đã bàn giao">
    <p>Thông tin chủ nuôi cung cấp lúc đặt lịch: {new Date(care.data.capturedAt).toLocaleString('vi-VN')}</p>
    {care.data.pets.map(pet => <div key={pet.id}><h4>{pet.name}</h4><p>{pet.weightKg} kg · {pet.ageMonths === null ? 'Chưa biết tuổi' : `${pet.ageMonths} tháng`}</p>
      <p>Giới tính: {({ MALE: 'Đực', FEMALE: 'Cái' })[pet.sex] ?? 'Chưa biết'}{pet.traits?.length ? ` · ${pet.traits.join(', ')}` : ''}</p>
      <dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{pet.careProfile[key]?.status === 'KNOWN' ? pet.careProfile[key].value : pet.careProfile[key]?.status === 'UNKNOWN' ? 'Chưa biết' : 'Chưa cung cấp'}</dd></div>)}</dl>
    </div>)}
    {!care.data.acknowledged && <Button disabled={command.busy || command.pending} onClick={() => command.execute(key => api.acknowledgeCare(visitId, care.data.version, key))}>Xác nhận đã đọc hồ sơ</Button>}
    {command.message && <p role="status">{command.message}</p>}
    {command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại xác nhận</Button>}
    <Button variant="secondary" disabled={!care.data.acknowledged} onClick={access}>Mở ghi chú ra vào</Button>
    {notes && <p>{notes.privateAccessNotes || 'Không có ghi chú ra vào.'}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
export function AssignedCare({ api, visitId }) {
  const [open, setOpen] = useState(false);
  return <div><Button variant="secondary" onClick={() => setOpen(value => !value)}>{open ? 'Đóng hồ sơ' : 'Hồ sơ chăm sóc'}</Button>
    {open && <CareDetails api={api} visitId={visitId} />}</div>;
}
