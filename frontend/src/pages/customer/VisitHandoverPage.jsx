import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Input, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { careInstructionsApi } from '../../services/care-instructions-api.js';
import './visit-care-instructions.css';

const ID = /^[a-f\d]{24}$/i;

export function VisitHandoverPage({ api = careInstructionsApi, visitId: suppliedVisitId, visitVersion, instructionVersion }) {
  const params = useParams();
  const visitId = suppliedVisitId || params.visitId;
  const load = useCallback(({ signal }) => api.getHandover({ visitId, signal }), [api, visitId]);
  const resource = useApiResource(load);
  const [replacementSitterId, setReplacementSitterId] = useState('');
  const [command, setCommand] = useState({ state: 'idle' });

  async function submit(event) {
    event.preventDefault();
    if (!ID.test(replacementSitterId) || !Number.isSafeInteger(visitVersion) || !Number.isSafeInteger(instructionVersion)) {
      setCommand({ state: 'error', message: 'Cần mã Sitter hợp lệ và phiên bản visit/hướng dẫn mới nhất.' });
      return;
    }
    setCommand({ state: 'saving' });
    try {
      const result = await api.confirmHandover({ visitId, replacementSitterId, expectedVersion: visitVersion, instructionVersion });
      setCommand(result?.pending ? { state: 'pending' } : { state: 'saved' });
      if (!result?.pending) resource.retry();
    } catch (error) {
      const message = error?.code === 'CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED'
        ? 'Sitter thay thế phải xác nhận phiên bản hướng dẫn mới nhất trước.'
        : error?.code === 'VERSION_CONFLICT' ? 'Visit hoặc hướng dẫn đã đổi. Tải lại trước khi xác nhận.'
          : 'Không thể xác nhận bàn giao. Hãy đối chiếu lại trạng thái visit.';
      setCommand({ state: 'error', message });
    }
  }

  if (resource.status === 'loading') return <main className="visit-care" aria-labelledby="handover-title"><h1 id="handover-title">Bàn giao visit</h1><Notice state="loading" title="Đang tải trạng thái bàn giao">Đang kiểm tra người thay thế và phiên bản hướng dẫn.</Notice></main>;
  if (resource.status === 'pending') return <main className="visit-care" aria-labelledby="handover-title"><h1 id="handover-title">Bàn giao visit</h1><Notice state="pending" title="Đang chờ máy chủ xác nhận">Chưa coi bàn giao là hoàn tất.</Notice></main>;
  if (resource.status === 'forbidden') return <main className="visit-care" aria-labelledby="handover-title"><h1 id="handover-title">Bàn giao visit</h1><Notice state="forbidden" title="Không có quyền xác nhận">Chỉ Customer của booking hoặc actor được server ủy quyền mới được xác nhận.</Notice></main>;
  if (resource.status === 'error') return <main className="visit-care" aria-labelledby="handover-title"><h1 id="handover-title">Bàn giao visit</h1><Notice state="error" title="Không tải được trạng thái bàn giao" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>Kiểm tra lại visit và phiên đăng nhập.</Notice></main>;

  const handover = resource.data;
  return <main className="visit-care" aria-labelledby="handover-title">
    <header className="visit-care__header"><p className="visit-care__eyebrow">VISIT {visitId}</p><h1 id="handover-title">Xác nhận bàn giao</h1><p>Chỉ cấp quyền cho Sitter thay thế sau khi người đó đã đọc và xác nhận đúng phiên bản hướng dẫn.</p></header>
    {command.state === 'saved' && <Notice state="success" title="Đã xác nhận bàn giao">Quyền truy cập của người thay thế chỉ có hiệu lực theo assignment và cửa sổ server.</Notice>}
    {command.state === 'pending' && <Notice state="pending" title="Chưa có xác nhận bàn giao"><Button variant="secondary" onClick={resource.retry}>Đối chiếu trạng thái</Button></Notice>}
    {command.state === 'error' && <Notice state="error" title="Chưa xác nhận được bàn giao">{command.message}</Notice>}
    <section className="visit-care__card" aria-labelledby="handover-state-title"><h2 id="handover-state-title">Trạng thái hiện tại</h2><p>Trạng thái: <strong>{handover.state}</strong></p>{handover.replacementSitterId && <p>Sitter thay thế: <code>{handover.replacementSitterId}</code></p>}{handover.state === 'CONFIRMED' && <p>Phiên bản hướng dẫn đã xác nhận: {handover.instructionVersion}</p>}</section>
    {handover.state !== 'CONFIRMED' && <form className="visit-care__card visit-care__form" onSubmit={submit}><h2>Chọn người thay thế</h2><Input label="Mã Sitter thay thế" value={replacementSitterId} onChange={event => setReplacementSitterId(event.target.value)} placeholder="24 ký tự hex" autoComplete="off" required /><Button type="submit" loading={command.state === 'saving'} loadingLabel="Đang xác nhận…" disabled={command.state === 'saving'}>Xác nhận bàn giao</Button></form>}
  </main>;
}
