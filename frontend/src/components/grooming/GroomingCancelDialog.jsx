import { Button, Dialog } from '../ui/index.js';
import { msg157 } from '../../constants/grooming-messages.js';

export function GroomingCancelDialog({ appointment, busy, onConfirm, onClose }) {
  if (!appointment) return null;
  const { localDate, startLocalTime } = appointment.slot;
  return <Dialog
    open
    intent="destructive"
    dismissible={!busy}
    title="Huỷ lịch spa"
    description={msg157(localDate, startLocalTime)}
    onClose={onClose}
    footer={<>
      <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>Giữ lịch</Button>
      <Button variant="primary" type="button" disabled={busy} onClick={onConfirm}>
        {busy ? 'Đang huỷ…' : 'Xác nhận huỷ'}
      </Button>
    </>}
  />;
}
