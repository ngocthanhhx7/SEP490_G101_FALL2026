import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/index.js';
import { VisitEvidencePreview } from '../../components/common/VisitEvidencePreview.jsx';
import { workflowStatusLabels } from '../../components/common/CareWorkflowReport.jsx';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import '../../styles/care-workflow.css';

const phases = { CHECK_IN: 'Tiếp nhận', EXECUTION: 'Thực hiện', CHECK_OUT: 'Bàn giao' };
function TaskForm({ row, task, api, visitId, onSaved, locked }) {
  const uploaded = useRef(null);
  const [note, setNote] = useState(task.note ?? ''),
    [skipReason, setSkipReason] = useState(''),
    [values, setValues] = useState(task.values ?? {});
  const [file, setFile] = useState(null),
    [slot, setSlot] = useState(task.step.photoSlots[0]?.photoSlotId ?? ''),
    [error, setError] = useState('');
  const command = useSchedulingCommand(onSaved),
    busy = locked || command.busy || command.pending;
  const terminal = ['COMPLETED', 'SKIPPED', 'BLOCKED', 'NEEDS_REVIEW'].includes(task.status);
  function save(status) {
    const payload = {
      expectedVersion: row.version,
      taskKey: task.taskKey,
      status,
      note,
      skipReason,
      values: { ...values }
    };
    const selected = file,
      photoSlotId = slot,
      uploadKey = globalThis.crypto.randomUUID();
    let mediaId = uploaded.current?.file === selected ? uploaded.current.mediaId : null;
    command.execute(async (key) => {
      if (selected && !mediaId) {
        const result = await api.uploadEvidence(selected, uploadKey);
        if (result?.state !== 'READY' || !/^[a-f0-9]{64}$/.test(result.id ?? ''))
          throw new Error('Upload acknowledgement missing');
        mediaId = result.id;
        uploaded.current = { file: selected, mediaId };
      }
      try {
        return await api.saveWorkflowTask(visitId, { ...payload, ...(mediaId ? { mediaId, photoSlotId } : {}) }, key);
      } catch (failure) {
        setError(failure.missingTasks?.length ? 'Còn thiếu ảnh hoặc nhiệm vụ bắt buộc ở bước này.' : '');
        throw failure;
      }
    });
  }
  return (
    <div className="care-workflow-card">
      <h4>
        {task.step.title}
        {task.petName ? ` · ${task.petName}` : ''}
      </h4>
      <p>
        {task.step.required ? 'Bắt buộc' : 'Tùy chọn'} · {workflowStatusLabels[task.status]}
      </p>
      <p>{task.step.instructions}</p>
      <div className="visit-evidence-gallery">
        {task.evidence.map((photo) => (
          <VisitEvidencePreview
            key={photo.mediaId}
            mediaId={photo.mediaId}
            read={api.readEvidence}
            label={task.step.photoSlots.find((item) => item.photoSlotId === photo.photoSlotId)?.title ?? 'Ảnh đã lưu'}
          />
        ))}
      </div>
      {terminal ? (
        <>
          <p>{task.note}</p>
          {task.skipReason && <p>Lý do: {task.skipReason}</p>}
          {['BLOCKED', 'NEEDS_REVIEW'].includes(task.status) && (
            <p role="alert">
              Đã chuyển điều phối xử lý. Chỉ tiếp tục sau khi được cho phép; không tự đánh dấu an toàn.
            </p>
          )}
        </>
      ) : (
        <fieldset disabled={busy}>
          <legend>Ghi nhận nhiệm vụ</legend>
          <label>
            {task.step.customerVisible ? 'Ghi chú (khách có thể xem)' : 'Ghi chú nội bộ'}
            <textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {task.step.fields.map((field) => (
            <label key={field.fieldId}>
              {field.label}
              {field.required ? ' *' : ''}
              <input
                type={field.type === 'NUMBER' ? 'number' : 'text'}
                min={field.min}
                max={field.max}
                maxLength={500}
                value={values[field.fieldId] ?? ''}
                onChange={(event) =>
                  setValues((previous) => ({
                    ...previous,
                    [field.fieldId]:
                      field.type === 'NUMBER' && event.target.value !== ''
                        ? Number(event.target.value)
                        : event.target.value
                  }))
                }
              />
            </label>
          ))}
          {task.step.photoSlots.length > 0 && (
            <>
              <h5>Ảnh cần chụp ở bước này</h5>
              <ul>
                {task.step.photoSlots.map((photo) => (
                  <li key={photo.photoSlotId}>
                    <strong>{photo.title}</strong>:{' '}
                    {task.evidence.filter((item) => item.photoSlotId === photo.photoSlotId).length}/{photo.minPhotos}{' '}
                    ảnh bắt buộc (tối đa {photo.maxPhotos}). {photo.instructions}
                  </li>
                ))}
              </ul>
              <label>
                Vị trí ảnh đang gửi
                <select
                  value={slot}
                  onChange={(event) => {
                    setSlot(event.target.value);
                    setFile(null);
                    setError('');
                  }}
                >
                  {task.step.photoSlots.map((photo) => (
                    <option value={photo.photoSlotId} key={photo.photoSlotId}>
                      {photo.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Chụp hoặc chọn ảnh
                <input
                  key={slot}
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (
                      selected &&
                      (!['image/jpeg', 'image/png'].includes(selected.type) ||
                        selected.size < 1 ||
                        selected.size > 5242880)
                    ) {
                      setError('Chọn JPG/PNG tối đa 5 MB.');
                      setFile(null);
                    } else {
                      setError('');
                      setFile(selected ?? null);
                    }
                  }}
                />
              </label>
              <p>
                Camera là tùy chọn trên thiết bị hỗ trợ; có thể chọn tệp trên desktop. Không xác minh thời gian chụp hay
                GPS. JPG/PNG, tối đa 5 MB / 4 megapixel.
              </p>
              {file && (
                <VisitEvidencePreview
                  file={file}
                  label="Ảnh nhiệm vụ đã chọn"
                  onRemove={() => {
                    setFile(null);
                    setError('');
                  }}
                  disabled={busy}
                  onInvalid={setError}
                />
              )}
            </>
          )}
          <div className="care-workflow-actions">
            <Button
              variant="secondary"
              disabled={(!!file && !api.uploadEvidence) || !!error}
              onClick={() => save('IN_PROGRESS')}
            >
              Lưu tiến độ và ảnh
            </Button>
            <Button disabled={(!!file && !api.uploadEvidence) || !!error} onClick={() => save('COMPLETED')}>
              Xác nhận đã thực hiện bước này
            </Button>
          </div>
          {task.step.canSkip && (
            <>
              <label>
                Lý do bỏ qua
                <textarea maxLength={1000} value={skipReason} onChange={(event) => setSkipReason(event.target.value)} />
              </label>
              <Button variant="ghost" disabled={!skipReason.trim()} onClick={() => save('SKIPPED')}>
                Bỏ qua có lý do
              </Button>
            </>
          )}
          <Button variant="secondary" disabled={!note.trim()} onClick={() => save('BLOCKED')}>
            Không thể thực hiện an toàn — báo điều phối
          </Button>
          <Link to={`/visits/${encodeURIComponent(visitId)}/incidents/new`}>Báo cáo sự cố theo quy trình</Link>
          <p>
            Bước bị chặn được chuyển vào bảng điều phối và gửi thông báo cho Staff/Admin. Liên hệ điều phối ngay khi có
            nguy cơ an toàn.
          </p>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      {command.message && <p role="status">{command.message}</p>}
      {command.pending && (
        <Button disabled={command.busy} onClick={command.retry}>
          Kiểm tra lại cùng thao tác
        </Button>
      )}
    </div>
  );
}
export function VisitWorkflowExecution({ row, api, visitId, onSaved, locked }) {
  const [selected, setSelected] = useState(null),
    workflow = row.workflow;
  const phase = row.state === 'ASSIGNED' ? 'CHECK_IN' : 'EXECUTION';
  const task =
    workflow.tasks.find((item) => item.taskKey === selected) ??
    workflow.tasks.find((item) => item.step.phase === phase && !['COMPLETED', 'SKIPPED'].includes(item.status)) ??
    workflow.tasks.find((item) => !['COMPLETED', 'SKIPPED'].includes(item.status)) ??
    workflow.tasks[0];
  const index = workflow.tasks.findIndex((item) => item.taskKey === task?.taskKey);
  const done = (item) =>
    !['BLOCKED', 'NEEDS_REVIEW'].includes(item.status) &&
    (!item.step.required || item.status === 'COMPLETED' || (item.status === 'SKIPPED' && item.step.canSkip)) &&
    item.step.photoSlots.every(
      (slot) => item.evidence.filter((photo) => photo.photoSlotId === slot.photoSlotId).length >= slot.minPhotos
    );
  const phaseAllowed =
    row.state === 'ASSIGNED'
      ? task?.step.phase === 'CHECK_IN'
      : row.state === 'IN_PROGRESS' && task?.step.phase !== 'CHECK_IN';
  const earlierReady = workflow.tasks
    .slice(0, index)
    .filter((item) => item.step.phase === task?.step.phase && item.step.required)
    .every(done);
  const checkoutReady =
    task?.step.phase !== 'CHECK_OUT' || workflow.tasks.filter((item) => item.step.phase !== 'CHECK_OUT').every(done);
  const writable = phaseAllowed && earlierReady && checkoutReady && !locked;
  return (
    <section className="care-workflow" aria-label="Thực hiện quy trình dịch vụ">
      <h3>
        {workflow.title} · v{workflow.revision}
      </h3>
      <p>
        {workflow.completed}/{workflow.total} nhiệm vụ đã ghi nhận
      </p>
      <progress value={workflow.completed} max={workflow.total || 1} aria-label="Tiến độ nhiệm vụ" />
      <label>
        Đi tới nhiệm vụ
        <select value={task?.taskKey ?? ''} onChange={(event) => setSelected(event.target.value)}>
          {workflow.tasks.map((item) => (
            <option key={item.taskKey} value={item.taskKey}>
              {phases[item.step.phase]} · {item.step.title}
              {item.petName ? ` · ${item.petName}` : ''} — {workflowStatusLabels[item.status]}
            </option>
          ))}
        </select>
      </label>
      {!writable && (
        <p role="status">
          Bước này chỉ mở đúng giai đoạn, sau các nhiệm vụ bắt buộc trước đó và trong thời gian ca cho phép.
        </p>
      )}
      {task && (
        <TaskForm
          key={`${task.taskKey}:${row.version}`}
          task={task}
          row={row}
          api={api}
          visitId={visitId}
          onSaved={onSaved}
          locked={!writable}
        />
      )}
    </section>
  );
}
