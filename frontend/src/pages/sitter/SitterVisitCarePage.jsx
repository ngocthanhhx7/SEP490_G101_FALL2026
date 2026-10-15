import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { careInstructionsApi } from '../../services/care-instructions-api.js';
import '../customer/visit-care-instructions.css';

function message(error) {
  if (error?.code === 'HANDOVER_REQUIRED') return 'Cần xác nhận bàn giao trước khi xem ghi chú riêng của visit.';
  if (error?.code === 'ACCESS_WINDOW_CLOSED') return 'Ghi chú ra vào chỉ mở từ một giờ trước khi visit bắt đầu.';
  if (error?.code === 'VERSION_CONFLICT') return 'Hướng dẫn đã đổi phiên bản. Hãy tải lại và xác nhận lại phiên bản mới.';
  if (error?.status === 403) return 'Phiên hiện tại chưa được cấp quyền cho visit này.';
  return 'Chưa nhận được xác nhận từ máy chủ. Hãy thử đối chiếu lại.';
}
export function SitterVisitCarePage({ api = careInstructionsApi, visitId: suppliedVisitId }) {
  const params = useParams();
  const visitId = suppliedVisitId || params.visitId;
  const load = useCallback(({ signal }) => api.getInstructions({ visitId, signal }), [api, visitId]);
  const resource = useApiResource(load);
  const [command, setCommand] = useState({ state: 'idle' });
  const [access, setAccess] = useState(null);
  const busy = command.state === 'saving' || command.state === 'pending';

  async function acknowledge() {
    if (resource.status !== 'success' || busy) return;
    setCommand({ state: 'saving' });
    try {
      const result = await api.acknowledgeInstructions({ visitId, instructionVersion: resource.data.version });
      setCommand(result?.pending ? { state: 'pending' } : { state: 'acknowledged' });
      if (!result?.pending) resource.retry();
    } catch (error) { setCommand({ state: 'error', message: message(error) }); }
  }

  async function readAccessNotes() {
    setCommand({ state: 'saving' });
    try {
      const result = await api.getAccessNotes({ visitId });
      setAccess(result?.data || null);
      setCommand({ state: 'access' });
    } catch (error) { setCommand({ state: 'error', message: message(error) }); }
  }

  if (resource.status === 'loading') return <main className="visit-care" aria-labelledby="sitter-care-title"><h1 id="sitter-care-title">Hướng dẫn của visit</h1><Notice state="loading" title="Đang tải hướng dẫn">Đang kiểm tra quyền truy cập và phiên bản hiện tại.</Notice></main>;
  if (resource.status === 'pending') return <main className="visit-care" aria-labelledby="sitter-care-title"><h1 id="sitter-care-title">Hướng dẫn của visit</h1><Notice state="pending" title="Đang chờ máy chủ xác nhận">Dữ liệu chờ không được coi là hướng dẫn đã nhận.</Notice></main>;
  if (resource.status === 'forbidden') return <main className="visit-care" aria-labelledby="sitter-care-title"><h1 id="sitter-care-title">Hướng dẫn của visit</h1><Notice state="forbidden" title="Không có quyền truy cập">Visit này không thuộc assignment hoặc phiên đăng nhập hiện tại.</Notice></main>;
  if (resource.status === 'error') return <main className="visit-care" aria-labelledby="sitter-care-title"><h1 id="sitter-care-title">Hướng dẫn của visit</h1><Notice state="error" title="Không tải được hướng dẫn" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>{message({ code: resource.code })}</Notice></main>;
  if (resource.status === 'empty' || !resource.data) return <main className="visit-care" aria-labelledby="sitter-care-title"><h1 id="sitter-care-title">Hướng dẫn của visit</h1><Notice state="empty" title="Chưa có hướng dẫn">Customer chưa lưu hướng dẫn cho visit này.</Notice></main>;

  const data = resource.data;
  return <main className="visit-care" aria-labelledby="sitter-care-title">
    <header className="visit-care__header"><p className="visit-care__eyebrow">VISIT {visitId}</p><h1 id="sitter-care-title">Đọc và xác nhận hướng dẫn</h1><p>Phải xác nhận đúng phiên bản trước khi nhận việc. Phiên bản mới, đặc biệt thay đổi dị ứng hoặc yêu cầu quan trọng, cần xác nhận lại.</p></header>
    {command.state === 'error' && <Notice state="error" title="Chưa hoàn tất thao tác">{command.message}</Notice>}
    {command.state === 'pending' && <Notice state="pending" title="Đang chờ xác nhận máy chủ">Chưa thể coi hướng dẫn là đã đọc. Tải lại để đối chiếu.</Notice>}
    {command.state === 'acknowledged' && <Notice state="success" title="Đã xác nhận phiên bản">Xác nhận đã được ghi cho phiên bản {data.version}.</Notice>}
    <section className="visit-care__card" aria-labelledby="sitter-care-current-title"><div className="visit-care__card-heading"><div><p className="visit-care__eyebrow">PHIÊN BẢN {data.version}</p><h2 id="sitter-care-current-title">Nội dung được cấp quyền</h2></div><span className="visit-care__updated">Cửa sổ ghi chú: {data.accessWindow?.open ? 'đang mở' : 'chưa mở'}</span></div><pre className="visit-care__readout">{JSON.stringify(data.instructions, null, 2)}</pre><Button onClick={acknowledge} loading={command.state === 'saving'} loadingLabel="Đang xác nhận…" disabled={busy || data.acknowledged}> {data.acknowledged ? 'Đã xác nhận phiên bản này' : 'Xác nhận đã đọc'} </Button></section>
    <section className="visit-care__card" aria-labelledby="sitter-access-title"><h2 id="sitter-access-title">Ghi chú ra vào nhà</h2><p className="visit-care__hint">Chỉ hiển thị trong cửa sổ từ một giờ trước đến checkout và sau khi handover (nếu có) được xác nhận.</p>{access ? <pre className="visit-care__readout">{access.privateAccessNotes || 'Không có ghi chú riêng.'}</pre> : <Button variant="secondary" onClick={readAccessNotes} disabled={busy || !data.accessWindow?.open}>Xem ghi chú khi được phép</Button>}</section>
  </main>;
}
