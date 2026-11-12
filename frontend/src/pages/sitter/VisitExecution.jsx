import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, LogIn, LogOut } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button } from '../../components/ui/index.js';

import { VisitEvidencePreview } from '../../components/common/VisitEvidencePreview.jsx';

const date = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const labels = { 'service-scope': 'Thực hiện nội dung dịch vụ', 'pet-condition': 'Kiểm tra tình trạng thú cưng' };
const states = { ASSIGNED: 'Đã nhận ca', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Đã hoàn thành' };
export function VisitExecution({ api, visitId, onChanged }) {
  const active = useRef(visitId), upload = useRef(null), input = useRef(null);
  useEffect(() => { active.current = visitId; upload.current = null; setFile(null); setItems({}); return () => { active.current = null; }; }, [visitId]);
  const load = useCallback(({ signal }) => api.execution(visitId, { signal }), [api, visitId]);
  const resource = useApiResource(load);
  const [file, setFile] = useState(null), [items, setItems] = useState({}), [fileError, setFileError] = useState('');
  const [time, setTime] = useState(Date.now());
  useEffect(() => {
    if (!resource.data) return undefined;
    const receivedAt = globalThis.performance.now(), server = Date.parse(resource.data.serverNow);
    const base = Number.isFinite(server) ? server : Date.now();
    const update = () => setTime(base + globalThis.performance.now() - receivedAt);
    update(); const timer = globalThis.setInterval(update, 1000);
    return () => globalThis.clearInterval(timer);
  }, [resource.data]);
  function clearFile() { setFile(null); setFileError(''); upload.current = null; if (input.current) input.current.value = ''; }
  const command = useSchedulingCommand(() => { clearFile(); setItems({}); resource.retry(); onChanged?.(); });
  const row = resource.data, locked = command.busy || command.pending;
  const opensAt = row?.checkInOpensAt ?? (Number.isFinite(Date.parse(row?.startAt)) ? new Date(Date.parse(row.startAt) - 1800000).toISOString() : null);
  const early = row?.state === 'ASSIGNED' && opensAt && time < Date.parse(opensAt);
  const expiresAt = row?.state === 'ASSIGNED' ? row?.checkInClosesAt ?? row?.endAt : row?.checkOutClosesAt;
  const expired = expiresAt && time > Date.parse(expiresAt);
  function evidence(action) {
    if (!file || fileError || locked || early || expired) return;
    // Upload and visit mutation keep their own stable keys across a lost acknowledgement.
    const selectedFile = file, expectedVersion = row.version, uploadKey = globalThis.crypto.randomUUID();
    let mediaId = upload.current?.file === file ? upload.current.mediaId : null;
    command.execute(async key => {
      if (!mediaId) {
        const uploaded = await api.uploadEvidence(selectedFile, uploadKey);
        if (!/^[a-f0-9]{64}$/i.test(uploaded?.id ?? '') || uploaded.state !== 'READY') throw new Error('Upload acknowledgement missing');
        mediaId = uploaded.id; upload.current = { file: selectedFile, mediaId };
      }
      if (active.current !== visitId) throw new Error('Visit workspace closed');
      return api.executeVisit(visitId, action, { expectedVersion, mediaId }, key);
    });
  }
  if (resource.status === 'loading') return <p role="status">Đang tải tiến độ ca…</p>;
  if (resource.status !== 'success') return <p role="alert">Chưa tải được tiến độ ca. <button onClick={resource.retry}>Tải lại tiến độ</button></p>;
  const required = row.checklistItemIds;
  const label = id => row.checklistItems?.find(item => item.itemId === id)?.label || labels[id] || id;
  const current = id => items[id] ?? row.checklist?.find(item => item.itemId === id) ?? { itemId: id, status: '', reason: '' };
  const complete = Array.isArray(required) && required.every(id => {
    const item = current(id); return item.status === 'DONE' || item.status === 'SKIPPED' && item.reason?.trim();
  });
  const savedChecklist = Array.isArray(required) && required.every(id => row.checklist?.some(item =>
    item.itemId === id && (item.status === 'DONE' || item.status === 'SKIPPED' && item.reason?.trim())));
  return <section className="visit-execution" aria-label="Thực hiện ca chăm sóc">
    <h4>{states[row.state] ?? 'Cần kiểm tra trạng thái ca'}</h4>
    <Button variant="ghost" disabled={locked} onClick={resource.retry}>Tải lại tiến độ</Button>
    {row.checkInAt && <p>Check-in: {new Date(row.checkInAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    {row.checkOutAt && <p>Check-out: {new Date(row.checkOutAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    {row.state === 'ASSIGNED' && opensAt && <p role="status">{early ? 'Chưa đến giờ check-in. ' : ''}Có thể check-in từ <strong>{date(opensAt)}</strong> đến {date(row.checkInClosesAt ?? row.endAt)} (giờ Việt Nam).</p>}
    {expired && <p role="alert">Đã hết thời gian {row.state === 'ASSIGNED' ? 'check-in' : 'check-out'} cho ca này. Liên hệ điều phối để đối chiếu.</p>}
    {row.state === 'ASSIGNED' && <p>Check-in đúng giờ kèm ảnh để mở nội dung chăm sóc. Sau khi lưu đủ nhiệm vụ, bạn có thể check-out với ảnh mới.</p>}
    {row.checklistItems?.length > 0 && row.state === 'ASSIGNED' && <details><summary>Nội dung cần thực hiện trong ca</summary><ul>{row.checklistItems.map(item => <li key={item.itemId}>{item.label}</li>)}</ul></details>}
    {row.evidence?.length > 0 && <div className="visit-evidence-gallery" aria-label="Ảnh bằng chứng đã lưu">{row.evidence.map(item => <VisitEvidencePreview key={item.kind + item.mediaId} mediaId={item.mediaId} read={api.readEvidence} label={item.kind === 'CHECK_IN' ? 'Ảnh check-in đã lưu' : 'Ảnh check-out đã lưu'} />)}</div>}
    {command.message && <p role="status">{command.message}</p>}
    {command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại thao tác ca</Button>}
    {row.state === 'IN_PROGRESS' && <fieldset disabled={locked}><legend>Nội dung chăm sóc</legend>
      {!Array.isArray(required) ? <p role="alert">Thiếu nội dung bàn giao. Cần điều phối kiểm tra trước khi hoàn tất ca.</p> : required.map(id => {
        const item = current(id);
        return <div key={id}><label>{label(id)}<select aria-label={label(id)} value={item.status}
          onChange={event => setItems(value => ({ ...value, [id]: { ...item, status: event.target.value } }))}>
          <option value="">Chưa ghi nhận</option><option value="DONE">Đã thực hiện</option><option value="SKIPPED">Không thực hiện</option>
        </select></label>{item.status === 'SKIPPED' && <label>Lý do không thực hiện: {label(id)}
          <textarea maxLength={1000} value={item.reason ?? ''} onChange={event => setItems(value => ({ ...value, [id]: { ...item, reason: event.target.value } }))} />
        </label>}</div>;
      })}
      <Button disabled={!complete || locked} onClick={() => {
        const payload = { expectedVersion: row.version, items: required.map(id => { const item = current(id); return { itemId: id, status: item.status, ...(item.status === 'SKIPPED' ? { reason: item.reason } : {}) }; }) };
        command.execute(key => api.executeVisit(visitId, 'checklists', payload, key));
      }}><Check size={18} />Lưu nội dung chăm sóc</Button>
    </fieldset>}
    {['ASSIGNED', 'IN_PROGRESS'].includes(row.state) && <fieldset disabled={locked}><legend>Ảnh bằng chứng {row.state === 'ASSIGNED' ? 'check-in' : 'check-out'}</legend>
      <label><Camera size={18} />Ảnh tại ca chăm sóc<input ref={input} type="file" accept="image/jpeg,image/png" capture="environment" onChange={event => {
        const selected = event.target.files?.[0] ?? null;
        upload.current = null;
        if (selected && (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size < 1 || selected.size > 5 * 1024 * 1024)) { setFile(null); setFileError('Chọn ảnh JPG hoặc PNG, tối đa 5 MB.'); return; }
        setFileError(''); setFile(selected);
      }} /></label>
      <p>JPG/PNG, tối đa 5 MB và 4 megapixel. Ảnh chỉ được gửi khi bạn xác nhận thao tác.</p>
      {fileError && <p role="alert">{fileError}</p>}
      {file && <VisitEvidencePreview file={file} label="Ảnh bằng chứng đã chọn" onRemove={clearFile} disabled={locked} onInvalid={setFileError} />}
      {!api.uploadEvidence && <p role="alert">Chưa có kết nối tải ảnh bằng chứng.</p>}
      <Button disabled={locked || !file || !!fileError || early || expired || !api.uploadEvidence || row.state === 'IN_PROGRESS' && !savedChecklist}
        onClick={() => evidence(row.state === 'ASSIGNED' ? 'check-ins' : 'check-outs')}>
        {row.state === 'ASSIGNED' ? <LogIn size={18} /> : <LogOut size={18} />}{row.state === 'ASSIGNED' ? 'Check-in bắt đầu ca' : 'Check-out hoàn tất ca'}
      </Button>
    </fieldset>}
  </section>;
}
