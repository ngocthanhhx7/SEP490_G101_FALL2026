import { VisitWorkflowExecution } from './VisitWorkflowExecution.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, LogIn, LogOut } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button, Toast } from '../../components/ui/index.js';

import { CareProgressSteps } from '../../components/common/CareProgressSteps.jsx';
import { VisitEvidencePreview } from '../../components/common/VisitEvidencePreview.jsx';
import { VisitTravel } from '../../components/common/VisitTravel.jsx';

const MSG01 = 'Trường này là bắt buộc.';
const MSG85 = 'Checklist đã được lưu.';
const pendingToastByVisit = new Map();
const date = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const timeVietnam = value => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(timestamp));
};
const labels = { 'service-scope': 'Thực hiện nội dung dịch vụ', 'pet-condition': 'Kiểm tra tình trạng thú cưng' };
const states = { ASSIGNED: 'Đã nhận ca', IN_PROGRESS: 'Đang chăm sóc', COMPLETED: 'Đã hoàn thành', STAFF_CLOSED: 'Buổi đã được điều phối đóng', CANCELLED: 'Buổi đã hủy' };
export function VisitExecution({ api, visitId, onChanged }) {
  const active = useRef(visitId), upload = useRef(null), input = useRef(null), noteInput = useRef(null);
  useEffect(() => {
    active.current = visitId; upload.current = null;
    setFile(null); setItems({}); setCustomerNote(null); setNoteError(''); setToastMessage('');
    return () => { active.current = null; };
  }, [visitId]);
  const load = useCallback(({ signal }) => api.execution(visitId, { signal }), [api, visitId]);
  const resource = useApiResource(load);
  const [file, setFile] = useState(null), [items, setItems] = useState({}), [fileError, setFileError] = useState('');
  const [customerNote, setCustomerNote] = useState(null), [noteError, setNoteError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [clockReading, setClockReading] = useState(null);
  useEffect(() => {
    if (!resource.data) return undefined;
    const receivedAt = globalThis.performance.now(), server = Date.parse(resource.data.serverNow);
    const base = Number.isFinite(server) ? server : Date.now();
    const update = () => setClockReading({ row: resource.data, time: base + globalThis.performance.now() - receivedAt });
    update(); const timer = globalThis.setInterval(update, 1000);
    return () => globalThis.clearInterval(timer);
  }, [resource.data]);
  useEffect(() => {
    const pending = pendingToastByVisit.get(visitId);
    if (!pending) return;
    if (resource.status === 'error' || resource.status === 'forbidden') {
      pendingToastByVisit.delete(visitId);
      return;
    }
    if (resource.status !== 'success' || !resource.data) return;
    if (pending === 'CHECK_IN' && resource.data.checkInAt) {
      const hhmm = timeVietnam(resource.data.checkInAt);
      if (hhmm) setToastMessage(`Bạn đã check-in lúc ${hhmm}.`);
      pendingToastByVisit.delete(visitId);
    } else if (pending === 'CHECK_OUT' && resource.data.checkOutAt) {
      const hhmm = timeVietnam(resource.data.checkOutAt);
      if (hhmm) setToastMessage(`Bạn đã check-out lúc ${hhmm}. Báo cáo chăm sóc đã được gửi cho khách.`);
      pendingToastByVisit.delete(visitId);
    } else if (pending === 'CHECKLIST') {
      if (resource.data.checklistSaved) setToastMessage(MSG85);
      pendingToastByVisit.delete(visitId);
    }
  }, [visitId, resource.status, resource.data]);
  function clearFile() { setFile(null); setFileError(''); upload.current = null; if (input.current) input.current.value = ''; }
  const command = useSchedulingCommand(result => {
    if (result?.action === 'check-ins') pendingToastByVisit.set(visitId, 'CHECK_IN');
    if (result?.action === 'check-outs') pendingToastByVisit.set(visitId, 'CHECK_OUT');
    if (result?.action === 'checklists') {
      if (result.noteOnly) setCustomerNote(null);
      else {
        pendingToastByVisit.set(visitId, 'CHECKLIST');
        setItems({});
      }
    } else {
      clearFile();
      setCustomerNote(null);
      onChanged?.();
    }
    resource.retry();
  });
  const row = resource.data, locked = command.busy || command.pending;
  const serverTime = Date.parse(row?.serverNow);
  const time = clockReading && clockReading.row === row ? clockReading.time
    : Number.isFinite(serverTime) ? serverTime : Date.now();
  const opensAt = row?.checkInOpensAt ?? (Number.isFinite(Date.parse(row?.startAt)) ? new Date(Date.parse(row.startAt) - 1800000).toISOString() : null);
  const early = row?.state === 'ASSIGNED' && opensAt && time < Date.parse(opensAt);
  const expiresAt = row?.state === 'ASSIGNED' ? row?.checkInClosesAt ?? row?.endAt : row?.checkOutClosesAt;
  const expired = expiresAt && time > Date.parse(expiresAt);
  function evidence(action) {
    if (!file || fileError || locked || early || expired) return;
    if (action === 'check-outs') {
      const currentNote = customerNote ?? row.customerNote ?? '';
      if (!currentNote.trim()) {
        setNoteError(MSG01);
        noteInput.current?.focus();
        return;
      }
    }
    setNoteError('');
    setToastMessage('');
    // Upload and visit mutation keep their own stable keys across a lost acknowledgement.
    const selectedFile = file, expectedVersion = row.version, uploadKey = globalThis.crypto.randomUUID();
    const noteToSend = action === 'check-outs' && customerNote !== null ? customerNote : undefined;
    let mediaId = upload.current?.file === file ? upload.current.mediaId : null;
    command.execute(async key => {
      if (!mediaId) {
        const uploaded = await api.uploadEvidence(selectedFile, uploadKey, visitId);
        if (!/^[a-f0-9]{64}$/i.test(uploaded?.id ?? '') || uploaded.state !== 'READY') throw new Error('Upload acknowledgement missing');
        mediaId = uploaded.id; upload.current = { file: selectedFile, mediaId };
      }
      if (active.current !== visitId) throw new Error('Visit workspace closed');
      const payload = { expectedVersion, mediaId, ...(noteToSend !== undefined ? { customerNote: noteToSend } : {}) };
      try {
        const result = await api.executeVisit(visitId, action, payload, key);
        return { ...result, action };
      } catch (failure) {
        if (failure?.fieldErrors?.customerNote) {
          setNoteError(failure.fieldErrors.customerNote);
          noteInput.current?.focus();
        }
        throw failure;
      }
    });
  }
  if (resource.status === 'loading') return <p role="status">Đang tải tiến độ ca…</p>;
  if (resource.status !== 'success') return <p role="alert">Chưa tải được tiến độ ca. <button onClick={resource.retry}>Tải lại tiến độ</button></p>;
  const required = row.checklistItemIds;
  const allChecklistItems = row.checklistItems?.length
    ? row.checklistItems
    : (Array.isArray(required) ? required.map(id => ({ itemId: id, label: labels[id] || id, required: true })) : []);
  const label = id => allChecklistItems.find(item => item.itemId === id)?.label || labels[id] || id;
  const checklistSaved = row.checklistSaved ?? (Boolean(row.checklist?.length) && Array.isArray(required)
    && required.every(id => row.checklist.some(item => item.itemId === id
      && (item.status === 'DONE' || item.status === 'SKIPPED' && item.reason?.trim()))));
  const current = id => (checklistSaved ? undefined : items[id])
    ?? row.checklist?.find(item => item.itemId === id) ?? { itemId: id, status: '', reason: '' };
  const complete = Array.isArray(required) && required.every(id => {
    const item = current(id); return item.status === 'DONE' || item.status === 'SKIPPED' && item.reason?.trim();
  });
  const chosenChecklist = allChecklistItems.map(entry => current(entry.itemId))
    .filter(item => item.status === 'DONE' || (item.status === 'SKIPPED' && item.reason?.trim()));
  const checkInBlockedByInstructions = row.state === 'ASSIGNED' && row.careInstructionsPendingAck === true;
  const versioned = row.workflow?.mode === 'VERSIONED';
  const phaseComplete = phase => row.workflow?.tasks.filter(task => task.step.phase === phase).every(task => !['BLOCKED','NEEDS_REVIEW'].includes(task.status) && (!task.step.required || task.status === 'COMPLETED' || task.status === 'SKIPPED' && task.step.canSkip) && task.step.photoSlots.every(slot => task.evidence.filter(photo => photo.photoSlotId === slot.photoSlotId).length >= slot.minPhotos));
  const workflowReady = !versioned || (row.state === 'ASSIGNED' ? phaseComplete('CHECK_IN') : ['CHECK_IN','EXECUTION','CHECK_OUT'].every(phaseComplete));
  const checkoutChecklistReady = checklistSaved || versioned && Array.isArray(required) && !required.length;
  const noteField = <label>Ghi chú cho khách
    <textarea ref={noteInput} rows={3} maxLength={2000} value={customerNote ?? row.customerNote ?? ''}
      aria-invalid={Boolean(noteError)} aria-describedby={noteError ? 'visit-customer-note-error' : undefined}
      onChange={event => { setCustomerNote(event.target.value); if (noteError) setNoteError(''); }} />
    {noteError && <small id="visit-customer-note-error" className="visit-execution__field-error" role="alert">{noteError}</small>}
  </label>;
  return <section className="visit-execution" aria-label="Thực hiện ca chăm sóc">
    <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    <CareProgressSteps steps={['Đã nhận ca', 'Check-in', 'Chăm sóc', 'Check-out']} current={row.state === 'ASSIGNED' ? 1 : row.state === 'IN_PROGRESS' ? 2 : 3} complete={row.state === 'COMPLETED'} />
    {row.workflow?.mode === 'LEGACY' && <p>Buổi này dùng danh sách việc đã lưu.</p>}
    <h4>{states[row.state] ?? 'Cần kiểm tra trạng thái ca'}</h4>
    {row.walkLocationAvailable === true && row.state === 'IN_PROGRESS' && !expired &&
      <VisitTravel api={api.dogWalk} visitId={visitId} employee available dogWalk />}
    {row.completionAttention === 'COMPLETION_REVIEW_REQUIRED' && <p role="alert">Cần xác minh kết thúc. Buổi đã quá hạn check-out; điều phối và quản trị đã được thông báo để hỗ trợ.</p>}
    {row.completionAttention === 'COMPLETION_VERIFICATION_PENDING' && <p role="status">Đang chờ quản trị đối chiếu bằng chứng và giờ kết thúc thực tế.</p>}
    {row.closureOutcome && <p role="status">Kết quả đối chiếu: {row.closureOutcome === 'SERVICE_PERFORMED' ? 'Đã xác minh dịch vụ thực hiện' : 'Không thực hiện dịch vụ, cần đối soát tài chính'}.</p>}
    <Button variant="ghost" disabled={locked} onClick={resource.retry}>Tải lại tiến độ</Button>
    {row.checkInAt && <p>Check-in: {new Date(row.checkInAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    {row.checkOutAt && <p>Check-out: {new Date(row.checkOutAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
    {row.state === 'ASSIGNED' && opensAt && <p role="status">{early ? 'Chưa đến giờ check-in. ' : ''}Có thể check-in từ <strong>{date(opensAt)}</strong> đến {date(row.checkInClosesAt ?? row.endAt)} (giờ Việt Nam).</p>}
    {expired && <p role="alert">Đã hết thời gian {row.state === 'ASSIGNED' ? 'check-in' : 'check-out'} cho ca này. Liên hệ điều phối để đối chiếu.</p>}
    {row.state === 'ASSIGNED' && <p>Check-in đúng giờ kèm ảnh để mở nội dung chăm sóc. Sau khi lưu đủ nhiệm vụ, bạn có thể check-out với ảnh mới.</p>}
    {row.checklistItems?.length > 0 && row.state === 'ASSIGNED' && <details><summary>Nội dung cần thực hiện trong ca</summary><ul>{row.checklistItems.map(item => <li key={item.itemId}>{item.label}</li>)}</ul></details>}
    {row.evidence?.length > 0 && <div className="visit-evidence-gallery" aria-label="Ảnh bằng chứng đã lưu">{row.evidence.map(item => <VisitEvidencePreview key={item.kind + item.mediaId} mediaId={item.mediaId} read={api.readEvidence} label={item.kind === 'CHECK_IN' ? 'Ảnh check-in đã lưu' : 'Ảnh check-out đã lưu'} />)}</div>}
    {!toastMessage && command.message && <p role="status">{command.message}</p>}
    {command.pending && <Button disabled={command.busy} onClick={command.retry}>Kiểm tra lại thao tác ca</Button>}
    {versioned && <VisitWorkflowExecution row={row} api={api} visitId={visitId} onSaved={() => { resource.retry(); onChanged?.(); }} locked={locked || early || expired} />}
    {row.state === 'IN_PROGRESS' && (!versioned || allChecklistItems.length > 0) && <fieldset disabled={locked || checklistSaved}><legend>{versioned ? 'Việc bổ sung' : 'Nội dung chăm sóc'}</legend>
      {checklistSaved && <p role="status">Đã lưu checklist</p>}
      {!Array.isArray(required) ? <p role="alert">Thiếu nội dung bàn giao. Cần điều phối kiểm tra trước khi hoàn tất ca.</p> : allChecklistItems.map(entry => {
        const id = entry.itemId;
        const item = current(id);
        return <div key={id}><label>{label(id)}{entry.required === false ? ' (Tuỳ chọn)' : ''}<select aria-label={label(id)} value={item.status}
          onChange={event => setItems(value => ({ ...value, [id]: { ...item, status: event.target.value } }))}>
          <option value="">Chưa ghi nhận</option><option value="DONE">Đã thực hiện</option><option value="SKIPPED">Không thực hiện</option>
        </select></label>{item.status === 'SKIPPED' && <label>Lý do không thực hiện: {label(id)}
          <textarea maxLength={1000} value={item.reason ?? ''} onChange={event => setItems(value => ({ ...value, [id]: { ...item, reason: event.target.value } }))} />
        </label>}</div>;
      })}
      {!checklistSaved && <Button disabled={!complete || !chosenChecklist.length || locked} onClick={() => {
        setToastMessage('');
        const payload = { expectedVersion: row.version, items: chosenChecklist.map(item => ({
          itemId: item.itemId, status: item.status, ...(item.status === 'SKIPPED' ? { reason: item.reason } : {})
        })) };
        command.execute(async key => ({ ...await api.executeVisit(visitId, 'checklists', payload, key), action: 'checklists' }));
      }}><Check size={18} />Lưu nội dung chăm sóc</Button>}
    </fieldset>}
    {row.state === 'IN_PROGRESS' && <fieldset disabled={locked || expired}>
      <legend>Ghi chú check-out</legend>
      {noteField}
      <Button disabled={customerNote === null || customerNote === (row.customerNote ?? '')} onClick={() => {
        setToastMessage('');
        command.execute(async key => ({
          ...await api.executeVisit(visitId, 'checklists', { expectedVersion: row.version, customerNote }, key),
          action: 'checklists', noteOnly: true
        }));
      }}>Lưu ghi chú</Button>
    </fieldset>}
    {['ASSIGNED', 'IN_PROGRESS'].includes(row.state) && <fieldset disabled={locked}><legend>Ảnh bằng chứng {row.state === 'ASSIGNED' ? 'check-in' : 'check-out'}</legend>
      {checkInBlockedByInstructions && (
        <p role="alert">Khách đã đổi hướng dẫn chăm sóc. Vui lòng đọc và xác nhận trước khi check-in.</p>
      )}
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
      <Button disabled={locked || checkInBlockedByInstructions || !workflowReady || !file || !!fileError || early || expired || !api.uploadEvidence || row.state === 'IN_PROGRESS' && !checkoutChecklistReady}
        onClick={() => evidence(row.state === 'ASSIGNED' ? 'check-ins' : 'check-outs')}>
        {row.state === 'ASSIGNED' ? <LogIn size={18} /> : <LogOut size={18} />}{row.state === 'ASSIGNED' ? 'Check-in bắt đầu ca' : 'Check-out hoàn tất ca'}
      </Button>
    </fieldset>}
  </section>;
}
