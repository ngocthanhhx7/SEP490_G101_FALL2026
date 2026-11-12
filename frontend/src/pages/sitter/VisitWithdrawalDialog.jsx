
import { useCallback, useId, useState } from 'react';
import { CircleAlert, Timer } from 'lucide-react';
import { Button, Dialog } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { formatWithdrawalDate, formatWithdrawalTime, VISIT_WITHDRAWAL_REASON_LABELS } from '../../constants/visit-withdrawal-messages.js';

function startsIn(startAt, serverNow) {
  const remaining = Date.parse(startAt) - Date.parse(serverNow);
  if (remaining <= 0) return 'Buổi đã tới giờ bắt đầu.';
  const minutes = Math.max(1, Math.floor(remaining / 60000));
  const hours = Math.floor(minutes / 60);
  const duration = hours ? `${hours} giờ` : `${minutes} phút`;
  return `Buổi bắt đầu sau ${duration} nữa (${formatWithdrawalDate(startAt).slice(0, 5)} lúc ${formatWithdrawalTime(startAt)}).`;
}

export function VisitWithdrawalDialog({ visitId, api, onClose, onSuccess }) {
  const formId = useId();
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const load = useCallback(({ signal }) => api.withdrawalOptions(visitId, { signal }), [api, visitId]);
  const options = useApiResource(load);
  const command = useSchedulingCommand(result => onSuccess(result.data));
  const data = options.status === 'success' ? options.data : null;
  const late = data?.mode === 'LATE';
  const locked = command.busy || command.pending;
  const title = late ? 'Gửi yêu cầu rút buổi' : 'Rút khỏi buổi';

  function submit(event) {
    event.preventDefault();
    if (!data || !reasonCode || locked) return;
    const trimmed = note.trim();
    command.execute(async key => {
      try {
        return await api.withdraw(visitId, { expectedVersion: data.version, expectedMode: data.mode,
          reasonCode, ...(trimmed ? { note: trimmed } : {}) }, key);
      } catch (error) {
        if (['WITHDRAWAL_MODE_CHANGED', 'VERSION_CONFLICT'].includes(error.code)) options.retry();
        throw error;
      }
    });
  }

  return <Dialog open title={title} onClose={onClose} dismissible={false} className="visit-withdrawal-dialog"
    footer={<>
      <Button variant="secondary" disabled={locked} onClick={onClose}>Quay lại</Button>
      {command.pending ? <Button loading={command.busy} onClick={command.retry}>Kiểm tra lại yêu cầu</Button>
        : <Button type="submit" form={formId} variant={late ? 'primary' : 'danger'}
          loading={command.busy} disabled={!data || !reasonCode}>{late ? 'Gửi cho nhân viên' : 'Rút khỏi buổi'}</Button>}
    </>}>
    {options.status === 'loading' && <p role="status">Đang kiểm tra giờ bắt đầu…</p>}
    {!data && options.status !== 'loading' && <p role="alert">{options.code === 'WITHDRAWAL_ALREADY_REQUESTED'
      ? 'Buổi này đã có yêu cầu rút đang chờ nhân viên.' : 'Chưa tải được thông tin rút buổi. Hãy tải lại ca đã nhận.'}</p>}
    {data && <form id={formId} onSubmit={submit}>
      {late ? <p className="visit-withdrawal-dialog__notice visit-withdrawal-dialog__notice--late">
        <CircleAlert size={17} aria-hidden="true" />
        <span>{startsIn(data.startAt, data.serverNow)} Dưới 12 giờ, bạn không tự rút được.
          Yêu cầu sẽ gửi cho nhân viên tìm người thay. Nếu không tìm được, nhân viên sẽ huỷ buổi.</span>
      </p> : <p className="visit-withdrawal-dialog__time"><Timer size={17} aria-hidden="true" />{startsIn(data.startAt, data.serverNow)}</p>}
      <label>Lý do <span aria-hidden="true">*</span>
        <select required value={reasonCode} onChange={event => setReasonCode(event.target.value)} disabled={locked}>
          <option value="">Chọn lý do</option>
          {data.reasonCodes.map(code => <option key={code} value={code}>{VISIT_WITHDRAWAL_REASON_LABELS[code]}</option>)}
        </select>
      </label>
      <label>Ghi chú thêm
        <textarea value={note} onChange={event => setNote(event.target.value)} disabled={locked} maxLength={1000} rows={3} />
      </label>
      {!late && <p className="visit-withdrawal-dialog__notice"><CircleAlert size={17} aria-hidden="true" />
        <span>Buổi sẽ được mời cho người chăm sóc khác và đánh dấu cần bàn giao. Lần rút này được ghi vào hồ sơ của bạn.</span>
      </p>}
    </form>}
    {command.message && <p role="alert">{command.message}</p>}
  </Dialog>;
}
