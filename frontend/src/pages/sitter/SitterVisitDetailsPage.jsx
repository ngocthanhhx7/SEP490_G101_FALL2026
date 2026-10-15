import { useCallback, useRef, useState } from 'react';
import { Button, Input, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterOperationsApi } from '../../services/sitter-operations-api.js';
import './sitter-visit-details.css';

function operationKey() {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) throw new Error('Secure operation keys are unavailable');
  const bytes = new Uint8Array(16); source.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}
function time(value) { return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
function errorMessage(error) {
  if (error?.code === 'HANDOVER_REQUIRED') return 'Bàn giao chưa được xác nhận; ghi chú riêng vẫn bị khóa.';
  if (error?.code === 'ACCESS_WINDOW_CLOSED') return 'Ghi chú ra vào chỉ mở từ 60 phút trước giờ bắt đầu đến khi checkout.';
  if (error?.code === 'WITHDRAWAL_WINDOW_CLOSED') return 'Đã sát giờ bắt đầu. Hãy chuyển yêu cầu cho Staff xử lý.';
  if (error?.status === 403) return 'Tài khoản này không có quyền với visit.';
  return 'Chưa nhận được xác nhận từ máy chủ.';
}

export function SitterVisitDetailsPage({ visitId, api = sitterOperationsApi, createOperationKey = operationKey }) {
  const load = useCallback(({ signal }) => api.getVisit(visitId, { signal }), [api, visitId]);
  const resource = useApiResource(load);
  const [notes, setNotes] = useState({ state: 'idle' });
  const [withdrawal, setWithdrawal] = useState(null);
  const [reason, setReason] = useState('');
  const operation = useRef(null);

  async function readNotes() {
    setNotes({ state: 'loading' });
    try { const response = await api.getAccessNotes(visitId); setNotes(response?.pending ? { state: 'pending' } : { state: 'success', value: response.data.privateAccessNotes }); }
    catch (error) { setNotes({ state: error?.status === 403 ? 'forbidden' : 'error', message: errorMessage(error) }); }
  }
  async function withdraw(event) {
    event.preventDefault();
    if (!resource.data || !reason.trim()) return;
    const payload = { expectedVersion: resource.data.version, reason: reason.trim() };
    const fingerprint = JSON.stringify(payload);
    if (!operation.current || operation.current.fingerprint !== fingerprint) operation.current = { fingerprint, key: createOperationKey() };
    setWithdrawal({ state: 'loading' });
    try {
      const response = await api.withdrawVisit(visitId, payload, operation.current.key);
      if (response?.pending || response?.status === 202) { setWithdrawal({ state: 'pending', message: 'Máy chủ đang xử lý. Visit chưa được xác nhận là đã rút.' }); return; }
      const data = response?.data ?? response;
      if (!data || data.visitId !== visitId || data.state !== 'WITHDRAWN' || data.scheduleChanged === true || data.payoutRequested === true) { setWithdrawal({ state: 'pending', message: 'Chưa có xác nhận hợp lệ từ máy chủ.' }); return; }
      setWithdrawal({ state: 'success', message: 'Đã rút khỏi visit. Staff sẽ xử lý phân công lại; lịch visit không tự đổi.' }); operation.current = null; resource.retry();
    } catch (error) { setWithdrawal({ state: !error?.status || ['TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error?.code) ? 'pending' : error?.status === 403 ? 'forbidden' : 'error', message: errorMessage(error) }); }
  }

  if (resource.status === 'loading') return <section className="sitter-visit-details"><Notice state="loading" title="Đang tải chi tiết visit">Đang kiểm tra phân công hiện tại.</Notice></section>;
  if (resource.status === 'pending') return <section className="sitter-visit-details"><Notice state="pending" title="Chi tiết visit đang chờ tích hợp">Máy chủ chưa xác nhận dữ liệu.</Notice></section>;
  if (resource.status === 'forbidden') return <section className="sitter-visit-details"><Notice state="forbidden" title="Không có quyền xem visit">Chỉ Sitter đang được phân công mới có thể xem.</Notice></section>;
  if (resource.status === 'error' || !resource.data) return <section className="sitter-visit-details"><Notice state="error" title="Không tải được visit" action={<Button variant="secondary" onClick={resource.retry}>Tải lại</Button>}>Visit chưa được xác nhận.</Notice></section>;
  const visit = resource.data;
  return <section className="sitter-visit-details" aria-labelledby="sitter-visit-details-title">
    <header><p className="sitter-visit-details__eyebrow">{visit.areaCode} · {visit.state}</p><h1 id="sitter-visit-details-title">{visit.serviceName}</h1>
      <p><time dateTime={visit.startAt}>{time(visit.startAt)}</time> – <time dateTime={visit.endAt}>{time(visit.endAt)}</time></p></header>
    <section className="sitter-visit-details__card" aria-labelledby="sitter-visit-pets-title"><h2 id="sitter-visit-pets-title">Thông tin cần cho ca</h2><ul>{visit.pets.map(pet => <li key={pet.id}>{pet.name} · {pet.species}</li>)}</ul><p>Địa chỉ và ghi chú riêng không nằm trong phần chi tiết này.</p></section>
    <section className="sitter-visit-details__card" aria-labelledby="sitter-access-notes-title"><h2 id="sitter-access-notes-title">Ghi chú ra vào nhà</h2>
      {notes.state === 'idle' && <p>Chỉ có thể xem từ 60 phút trước giờ bắt đầu đến khi checkout, sau khi bàn giao được xác nhận.</p>}
      {notes.state === 'loading' && <Notice state="loading" title="Đang kiểm tra quyền xem">Không tải ghi chú trước khi máy chủ cho phép.</Notice>}
      {notes.state === 'pending' && <Notice state="pending" title="Đang chờ quyền xem">Máy chủ chưa xác nhận ghi chú.</Notice>}
      {['forbidden', 'error'].includes(notes.state) && <Notice state={notes.state} title="Chưa thể xem ghi chú">{notes.message}</Notice>}
      {notes.state === 'success' && <p className="sitter-visit-details__private-note">{notes.value || 'Không có ghi chú riêng.'}</p>}
      {notes.state === 'idle' && <Button variant="secondary" onClick={readNotes}>Kiểm tra và xem ghi chú</Button>}
    </section>
    {visit.state === 'ASSIGNED' && <section className="sitter-visit-details__card" aria-labelledby="sitter-withdraw-title"><h2 id="sitter-withdraw-title">Rút khỏi visit</h2><p>Chỉ được tự rút khi còn ít nhất 60 phút. Đây là thao tác vận hành, không phải yêu cầu payout và không tự đổi lịch.</p>
      {withdrawal && <Notice state={withdrawal.state} title={withdrawal.state === 'success' ? 'Đã ghi nhận rút khỏi visit' : 'Trạng thái rút visit'}>{withdrawal.message}</Notice>}
      <form onSubmit={withdraw}><Input label="Lý do" value={reason} maxLength={1000} required disabled={withdrawal?.state === 'loading' || withdrawal?.state === 'pending'} onChange={event => setReason(event.target.value)} /><Button type="submit" loading={withdrawal?.state === 'loading'} disabled={withdrawal?.state === 'pending'}>Gửi yêu cầu rút</Button></form>
    </section>}
  </section>;
}

export default SitterVisitDetailsPage;
