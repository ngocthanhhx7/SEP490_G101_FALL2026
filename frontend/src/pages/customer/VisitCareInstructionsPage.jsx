import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { careInstructionsApi } from '../../services/care-instructions-api.js';
import './visit-care-instructions.css';

function errorText(error) {
  if (error?.code === 'DEADLINE_PASSED') return 'Đã qua hạn chỉnh sửa 2 giờ trước visit. Hướng dẫn hiện tại vẫn được giữ nguyên.';
  if (error?.code === 'VERSION_CONFLICT') return 'Hướng dẫn đã thay đổi ở nơi khác. Hãy tải lại phiên bản mới nhất trước khi sửa.';
  if (error?.status === 403) return 'Bạn không có quyền xem hoặc sửa hướng dẫn của visit này.';
  if (error?.status === 404) return 'Không tìm thấy visit hoặc hướng dẫn tương ứng.';
  if (!error?.status || error?.status >= 500 || ['TIMEOUT', 'NETWORK_ERROR'].includes(error?.code)) return 'Chưa nhận được xác nhận từ máy chủ. Hãy tải lại để đối chiếu trước khi gửi lại.';
  return 'Không thể lưu hướng dẫn lúc này. Hãy kiểm tra nội dung rồi thử lại.';
}

function formatDate(value) {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, copy(nested)]));
  return value;
}

export function VisitCareInstructionsPage({ api = careInstructionsApi, visitId: suppliedVisitId }) {
  const params = useParams();
  const visitId = suppliedVisitId || params.visitId;
  const load = useCallback(({ signal }) => api.getInstructions({ visitId, signal }), [api, visitId]);
  const resource = useApiResource(load);
  const [draft, setDraft] = useState('{}');
  const [draftVersion, setDraftVersion] = useState(null);
  const [reason, setReason] = useState('');
  const [command, setCommand] = useState({ state: 'idle' });

  useEffect(() => {
    if (resource.status === 'success' && resource.data && resource.data.version !== draftVersion) {
      setDraft(JSON.stringify(copy(resource.data.instructions), null, 2));
      setDraftVersion(resource.data.version);
      setCommand({ state: 'idle' });
    }
  }, [resource.status, resource.data, draftVersion]);

  const busy = command.state === 'saving' || command.state === 'pending';
  const history = useMemo(() => [...(resource.data?.history || [])].sort((left, right) => right.version - left.version), [resource.data]);

  async function submit(event) {
    event.preventDefault();
    if (resource.status !== 'success' || busy) return;
    let instructions;
    try { instructions = JSON.parse(draft); } catch { setCommand({ state: 'error', message: 'Nội dung phải là JSON hợp lệ trước khi lưu.' }); return; }
    if (!instructions || typeof instructions !== 'object' || Array.isArray(instructions)) {
      setCommand({ state: 'error', message: 'Nội dung hướng dẫn phải là một đối tượng JSON.' });
      return;
    }
    setCommand({ state: 'saving' });
    try {
      const result = await api.updateInstructions({ visitId, expectedVersion: resource.data.version, instructions, reason: reason.trim() || undefined });
      if (result?.pending) setCommand({ state: 'pending' });
      else { setCommand({ state: 'saved' }); resource.retry(); }
    } catch (error) { setCommand({ state: 'error', message: errorText(error), code: error?.code }); }
  }

  if (resource.status === 'loading') return <main className="visit-care" aria-labelledby="visit-care-title"><h1 id="visit-care-title">Hướng dẫn chăm sóc</h1><Notice state="loading" title="Đang tải hướng dẫn">Đang đọc phiên bản mới nhất của visit.</Notice></main>;
  if (resource.status === 'pending') return <main className="visit-care" aria-labelledby="visit-care-title"><h1 id="visit-care-title">Hướng dẫn chăm sóc</h1><Notice state="pending" title="Đang chờ máy chủ xác nhận">Dữ liệu chưa được xác nhận; chưa coi là trống hoặc đã cập nhật.<Button variant="secondary" onClick={resource.retry}>Đối chiếu lại</Button></Notice></main>;
  if (resource.status === 'forbidden') return <main className="visit-care" aria-labelledby="visit-care-title"><h1 id="visit-care-title">Hướng dẫn chăm sóc</h1><Notice state="forbidden" title="Không có quyền truy cập">Chỉ Customer của booking mới được sửa hướng dẫn của visit.</Notice></main>;
  if (resource.status === 'error') return <main className="visit-care" aria-labelledby="visit-care-title"><h1 id="visit-care-title">Hướng dẫn chăm sóc</h1><Notice state="error" title="Không tải được hướng dẫn" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>{errorText({ code: resource.code })}</Notice></main>;
  if (resource.status === 'empty' || !resource.data) return <main className="visit-care" aria-labelledby="visit-care-title"><h1 id="visit-care-title">Hướng dẫn chăm sóc</h1><Notice state="empty" title="Chưa có hướng dẫn">Hướng dẫn sẽ xuất hiện sau khi visit được tạo.</Notice></main>;

  return <main className="visit-care" aria-labelledby="visit-care-title">
    <header className="visit-care__header"><p className="visit-care__eyebrow">VISIT {visitId}</p><h1 id="visit-care-title">Hướng dẫn chăm sóc</h1><p>Hướng dẫn được lưu theo phiên bản. Thay đổi dị ứng hoặc yêu cầu quan trọng tạo phiên bản mới và yêu cầu Sitter xác nhận lại.</p></header>
    {command.state === 'saved' && <Notice state="success" title="Đã gửi cập nhật">Máy chủ đang tải lại hướng dẫn để xác nhận phiên bản mới.</Notice>}
    {command.state === 'pending' && <Notice state="pending" title="Chưa có xác nhận cập nhật"><p>Chưa biết yêu cầu đã được ghi nhận hay chưa. Hãy đối chiếu phiên bản trước khi gửi lại.</p><Button variant="secondary" onClick={resource.retry}>Đối chiếu phiên bản</Button></Notice>}
    {command.state === 'error' && <Notice state="error" title="Chưa lưu được hướng dẫn" action={<Button variant="secondary" onClick={() => { setCommand({ state: 'idle' }); resource.retry(); }}>Tải lại</Button>}>{command.message}</Notice>}
    <section className="visit-care__card" aria-labelledby="visit-care-current-title">
      <div className="visit-care__card-heading"><div><p className="visit-care__eyebrow">PHIÊN BẢN {resource.data.version}</p><h2 id="visit-care-current-title">Hướng dẫn hiện tại</h2></div><span className="visit-care__updated">Cập nhật {formatDate(resource.data.updatedAt)}</span></div>
      <p className="visit-care__hint">Dùng JSON để giữ nguyên các trường care snapshot. Server vẫn kiểm tra schema, quyền sở hữu và hạn 2 giờ.</p>
      <form onSubmit={submit} className="visit-care__form">
        <label htmlFor="visit-care-editor">Nội dung hướng dẫn</label>
        <textarea id="visit-care-editor" value={draft} onChange={event => { setDraft(event.target.value); setCommand({ state: 'idle' }); }} rows={14} disabled={busy} spellCheck="false" />
        <label htmlFor="visit-care-reason">Lý do cập nhật (tuỳ chọn)</label>
        <input id="visit-care-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={busy} />
        <Button type="submit" loading={command.state === 'saving'} loadingLabel="Đang lưu…" disabled={busy || draftVersion !== resource.data.version}>Lưu phiên bản mới</Button>
      </form>
    </section>
    <section className="visit-care__card" aria-labelledby="visit-care-history-title"><h2 id="visit-care-history-title">Lịch sử phiên bản</h2>{history.length === 0 ? <Notice state="empty" title="Chưa có lịch sử">Phiên bản đầu tiên sẽ được ghi khi bạn lưu hướng dẫn.</Notice> : <ol className="visit-care__history">{history.map(item => <li key={item.version}><strong>Phiên bản {item.version}</strong><span>{formatDate(item.updatedAt)}</span><small>{item.reason || 'Không có lý do'}</small></li>)}</ol>}</section>
  </main>;
}
