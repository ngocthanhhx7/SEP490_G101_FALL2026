import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button, Notice } from '../../components/ui/index.js';
import './assigned-care.css';

const MSG80 = 'Khách đã đổi hướng dẫn chăm sóc. Vui lòng đọc và xác nhận trước khi check-in.';
const labels = { feeding: 'Cho ăn', handling: 'Tiếp cận và thói quen', health: 'Sức khỏe', allergies: 'Dị ứng',
  medication: 'Thuốc theo hướng dẫn thú y', vaccination: 'Vaccine', emergencyContact: 'Liên hệ khẩn cấp', veterinaryContact: 'Phòng khám thú y' };

function formatDateTime(value) {
  if (!value) return 'Chưa có';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Chưa có';
  return parsed.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function CareDetails({ api, visitId, onAcknowledged }) {
  const load = useCallback(({ signal }) => api.care(visitId, { signal }), [api, visitId]);
  const care = useApiResource(load), [notes, setNotes] = useState(null), [error, setError] = useState('');
  const [showFullProfile, setShowFullProfile] = useState(false);
  const command = useSchedulingCommand(() => {
    care.retry();
    onAcknowledged?.();
  });
  useEffect(() => {
    const timer = globalThis.setInterval(() => { setNotes(null); care.retry(); }, 30000);
    return () => globalThis.clearInterval(timer);
  }, [care.retry]);
  async function access() {
    setNotes(null); setError('');
    try { const result = await api.accessNotes(visitId); setNotes(result.data); }
    catch (failure) { setError(failure.code === 'ACCESS_WINDOW_CLOSED' ? 'Chưa trong thời gian xem ghi chú. Chỉ mở từ 1 giờ trước ca đến lúc kết thúc ca.'
      : failure.code === 'CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED' ? 'Cần xác nhận đã đọc hồ sơ chăm sóc hiện tại trước khi mở ghi chú.'
        : failure.code === 'HANDOVER_REQUIRED' ? 'HANDOVER_REQUIRED'
          : 'Chưa mở được ghi chú ra vào. Hãy tải lại hồ sơ hoặc liên hệ điều phối.'); }
  }
  useEffect(() => {
    if (!notes) return undefined;
    const timer = setTimeout(() => setNotes(null), Math.max(0, Date.parse(notes.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [notes]);
  if (care.status === 'loading') return <p role="status">Đang tải hướng dẫn chăm sóc…</p>;
  const handoverLink = <Link className="sitter-workspace-link" to={'/sitter/visits/' + visitId + '/handover'}>Xác nhận bàn giao</Link>;
  if (care.code === 'HANDOVER_REQUIRED') return <div><p role="alert">Bạn cần xác nhận bàn giao trước khi xem ghi chú.</p>{handoverLink}</div>;
  if (care.status !== 'success') return <p role="alert">Hồ sơ chưa khả dụng cho ca này.</p>;

  const ci = care.data.careInstructions;
  const needsNewVersionAck = ci?.requiresAcknowledgement === true;
  const instructionPets = ci?.pets?.length ? ci.pets : null;
  const instructionTasks = ci?.tasks?.length ? ci.tasks : null;

  return <section className="assigned-care" aria-label="Hướng dẫn chăm sóc">
    <h2>Hướng dẫn chăm sóc</h2>
    <p>
      <strong>Phiên bản {ci?.version ?? 1}</strong>
      {' · '}Khách xác nhận: {formatDateTime(ci?.confirmedAt ?? care.data.capturedAt)}
      {needsNewVersionAck && <> · <strong data-instruction-unread>chưa đọc</strong></>}
      {!needsNewVersionAck && ci?.acknowledgedAt && <> · Đã đọc lúc {formatDateTime(ci.acknowledgedAt)}</>}
    </p>
    {needsNewVersionAck && (
      <Notice state="warning" title="Hướng dẫn chăm sóc đã thay đổi">
        {MSG80}
      </Notice>
    )}
    {instructionPets && (
      <div>
        {instructionPets.map(pet => (
          <div key={pet.petId}>
            <h4>{pet.name}</h4>
            <dl>
              <div><dt>Cho ăn</dt><dd>{pet.feeding || 'Chưa có ghi chú'}</dd></div>
              {pet.medicine && <div><dt>Thuốc (chỉ tham khảo)</dt><dd>{pet.medicine}</dd></div>}
              <div><dt>Hành vi</dt><dd>{pet.behavior || 'Chưa có ghi chú'}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    )}
    {instructionTasks && (
      <div>
        <h4>Việc cần làm trong buổi</h4>
        <ul>
          {instructionTasks.map(task => (
            <li key={task.itemId}>
              {task.label} — <span>{task.required ? 'Bắt buộc' : 'Không bắt buộc'}</span>
            </li>
          ))}
        </ul>
      </div>
    )}
    {needsNewVersionAck ? (
      <Button
        disabled={command.busy || command.pending}
        onClick={() => command.execute(key => api.acknowledgeCare(visitId, care.data.version, key))}
      >
        Tôi đã đọc bản mới
      </Button>
    ) : !care.data.acknowledged && (
      <Button
        disabled={command.busy || command.pending}
        onClick={() => command.execute(key => api.acknowledgeCare(visitId, care.data.version, key))}
      >
        Xác nhận đã đọc hồ sơ
      </Button>
    )}
    {command.message && <p role="status">{command.message}</p>}
    {command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại xác nhận</Button>}

    {instructionPets ? (
      <div style={{ marginTop: '0.75rem' }}>
        <Button variant="ghost" onClick={() => setShowFullProfile(value => !value)}>
          {showFullProfile ? 'Ẩn hồ sơ thú cưng đầy đủ' : 'Xem hồ sơ thú cưng đầy đủ'}
        </Button>
        {showFullProfile && care.data.pets.map(pet => <div key={pet.id}><h4>{pet.name}</h4><p>{pet.weightKg} kg · {pet.ageMonths === null ? 'Chưa biết tuổi' : `${pet.ageMonths} tháng`}</p>
          <p>Giới tính: {({ MALE: 'Đực', FEMALE: 'Cái' })[pet.sex] ?? 'Chưa biết'}{pet.traits?.length ? ` · ${pet.traits.join(', ')}` : ''}</p>
          <dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{pet.careProfile[key]?.status === 'KNOWN' ? pet.careProfile[key].value : pet.careProfile[key]?.status === 'UNKNOWN' ? 'Chưa biết' : 'Chưa cung cấp'}</dd></div>)}</dl>
        </div>)}
      </div>
    ) : care.data.pets.map(pet => <div key={pet.id}><h4>{pet.name}</h4><p>{pet.weightKg} kg · {pet.ageMonths === null ? 'Chưa biết tuổi' : `${pet.ageMonths} tháng`}</p>
      <p>Giới tính: {({ MALE: 'Đực', FEMALE: 'Cái' })[pet.sex] ?? 'Chưa biết'}{pet.traits?.length ? ` · ${pet.traits.join(', ')}` : ''}</p>
      <dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{pet.careProfile[key]?.status === 'KNOWN' ? pet.careProfile[key].value : pet.careProfile[key]?.status === 'UNKNOWN' ? 'Chưa biết' : 'Chưa cung cấp'}</dd></div>)}</dl>
    </div>)}

    <p id="care-access-help">Ghi chú ra vào là hướng dẫn riêng của khách về cách vào nhà hoặc điểm chăm sóc.
      {!care.data.acknowledged && (needsNewVersionAck ? ' Bấm “Tôi đã đọc bản mới” để mở khóa nút.' : ' Bấm “Xác nhận đã đọc hồ sơ” để mở khóa nút.')}
      {care.data.accessOpensAt && care.data.accessExpiresAt && ' Chỉ xem từ ' + formatDateTime(care.data.accessOpensAt) + ' đến ' + formatDateTime(care.data.accessExpiresAt) + ' (giờ Việt Nam).'}
    </p>
    <Button variant="secondary" aria-describedby="care-access-help" disabled={!care.data.acknowledged} onClick={access}>Mở ghi chú ra vào</Button>
    {notes && <p>{notes.privateAccessNotes || 'Không có ghi chú ra vào.'}</p>}
    {error === 'HANDOVER_REQUIRED' ? <div><p role="alert">Bạn cần xác nhận bàn giao trước khi xem ghi chú.</p>{handoverLink}</div>
      : error && <p role="alert">{error}</p>}
  </section>;
}

export function AssignedCare({ api, visitId, onAcknowledged, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div>
    {!defaultOpen && <Button variant="secondary" onClick={() => setOpen(value => !value)}>{open ? 'Đóng hồ sơ' : 'Hồ sơ chăm sóc'}</Button>}
    {open && <CareDetails api={api} visitId={visitId} onAcknowledged={onAcknowledged} />}
  </div>;
}
