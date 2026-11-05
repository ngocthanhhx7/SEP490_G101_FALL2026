import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, LogIn, LogOut } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button } from '../../components/ui/index.js';

const labels = { 'service-scope': 'Thực hiện nội dung dịch vụ', 'pet-condition': 'Kiểm tra tình trạng thú cưng' };
const states = { ASSIGNED: 'Đã nhận ca', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Đã hoàn thành' };
export function VisitExecution({ api, visitId, onChanged }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const load = useCallback(({ signal }) => api.execution(visitId, { signal }), [api, visitId]);
  const resource = useApiResource(load);
  const [file, setFile] = useState(null), [items, setItems] = useState({});
  const command = useSchedulingCommand(() => { setFile(null); resource.retry(); onChanged?.(); });
  const row = resource.data, locked = command.busy || command.pending;
  function evidence(action) {
    if (!file || locked) return;
    // Upload and visit mutation keep their own stable keys across a lost acknowledgement.
    const selectedFile = file, expectedVersion = row.version, uploadKey = globalThis.crypto.randomUUID();
    let mediaId;
    command.execute(async key => {
      if (!mediaId) {
        const uploaded = await api.uploadEvidence(selectedFile, uploadKey);
        if (!/^[a-f0-9]{64}$/i.test(uploaded?.id ?? '') || uploaded.state !== 'READY') throw new Error('Upload acknowledgement missing');
        mediaId = uploaded.id;
      }
      if (!active.current) throw new Error('Visit workspace closed');
      return api.executeVisit(visitId, action, { expectedVersion, mediaId }, key);
    });
  }
  if (resource.status === 'loading') return <p role="status">Đang tải tiến độ ca…</p>;
  if (resource.status !== 'success') return <p role="alert">Chưa tải được tiến độ ca. <button onClick={resource.retry}>Tải lại tiến độ</button></p>;
  const required = row.checklistItemIds;
  const current = id => items[id] ?? row.checklist?.find(item => item.itemId === id) ?? { itemId: id, status: '', reason: '' };
  const complete = Array.isArray(required) && required.every(id => {
    const item = current(id); return item.status === 'DONE' || item.status === 'SKIPPED' && item.reason?.trim();
  });
  const savedChecklist = Array.isArray(required) && required.every(id => row.checklist?.some(item =>
    item.itemId === id && (item.status === 'DONE' || item.status === 'SKIPPED' && item.reason?.trim())));
  return <section className="visit-execution" aria-label="Thực hiện ca chăm sóc">
    <h4>{states[row.state] ?? 'Cần kiểm tra trạng thái ca'}</h4>
    {row.checkInAt && <p>Check-in: {new Date(row.checkInAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    {row.checkOutAt && <p>Check-out: {new Date(row.checkOutAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    {command.message && <p role="status">{command.message}</p>}
    {command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại thao tác ca</Button>}
    {row.state === 'IN_PROGRESS' && <fieldset disabled={locked}><legend>Nội dung chăm sóc</legend>
      {!Array.isArray(required) ? <p role="alert">Thiếu nội dung bàn giao. Cần điều phối kiểm tra trước khi hoàn tất ca.</p> : required.map(id => {
        const item = current(id);
        return <div key={id}><label>{labels[id] ?? id}<select aria-label={labels[id] ?? id} value={item.status}
          onChange={event => setItems(value => ({ ...value, [id]: { ...item, status: event.target.value } }))}>
          <option value="">Chưa ghi nhận</option><option value="DONE">Đã thực hiện</option><option value="SKIPPED">Không thực hiện</option>
        </select></label>{item.status === 'SKIPPED' && <label>Lý do không thực hiện: {labels[id] ?? id}
          <textarea maxLength={1000} value={item.reason ?? ''} onChange={event => setItems(value => ({ ...value, [id]: { ...item, reason: event.target.value } }))} />
        </label>}</div>;
      })}
      <Button disabled={!complete || locked} onClick={() => {
        const payload = { expectedVersion: row.version, items: required.map(id => { const item = current(id); return { itemId: id, status: item.status, ...(item.status === 'SKIPPED' ? { reason: item.reason } : {}) }; }) };
        command.execute(key => api.executeVisit(visitId, 'checklists', payload, key));
      }}><Check size={18} />Lưu nội dung chăm sóc</Button>
    </fieldset>}
    {['ASSIGNED', 'IN_PROGRESS'].includes(row.state) && <fieldset disabled={locked}><legend>Ảnh bằng chứng {row.state === 'ASSIGNED' ? 'check-in' : 'check-out'}</legend>
      <label><Camera size={18} />Ảnh tại ca chăm sóc<input type="file" accept="image/jpeg,image/png" capture="environment" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      {!api.uploadEvidence && <p role="alert">Chưa có kết nối tải ảnh bằng chứng.</p>}
      <Button disabled={locked || !file || !api.uploadEvidence || row.state === 'IN_PROGRESS' && !savedChecklist}
        onClick={() => evidence(row.state === 'ASSIGNED' ? 'check-ins' : 'check-outs')}>
        {row.state === 'ASSIGNED' ? <LogIn size={18} /> : <LogOut size={18} />}{row.state === 'ASSIGNED' ? 'Check-in bắt đầu ca' : 'Check-out hoàn tất ca'}
      </Button>
    </fieldset>}
  </section>;
}
