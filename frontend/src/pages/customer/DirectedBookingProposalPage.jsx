import { useCallback, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import './directed-booking-proposal.css';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

function formatDate(value) {
  if (typeof value !== 'string') return 'Chưa có';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
    : 'Chưa có';
}

function amount(value) {
  const raw = value?.amountVnd ?? value?.amount;
  return Number.isSafeInteger(raw) ? money.format(raw) : 'Theo snapshot máy chủ';
}

function idempotencyKey(seed) {
  if (typeof seed === 'string' && seed.length >= 8) return seed;
  if (typeof globalThis.crypto?.randomUUID === 'function') return `direct-${globalThis.crypto.randomUUID()}`;
  return `direct-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function actionMessage(error) {
  if (error?.code === 'PROPOSAL_EXPIRED') return 'Đề xuất đã hết hạn. Hãy yêu cầu máy chủ tạo lịch mới.';
  if (error?.code === 'VERSION_CONFLICT' || error?.code === 'SLOT_NOT_PROPOSED') return 'Lịch đã thay đổi. Hãy tải lại đề xuất trước khi xác nhận.';
  if (error?.code === 'PROPOSAL_NOT_CONFIRMABLE') return 'Đề xuất không còn chờ xác nhận; hãy tải lại để xem trạng thái mới.';
  if (error?.code === 'CSRF_NOT_READY') return 'Phiên bảo mật chưa sẵn sàng. Vui lòng đăng nhập lại.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') return 'Chưa nhận được xác nhận từ máy chủ. Tải lại trước khi gửi lại.';
  return 'Không thể xác nhận lịch lúc này. Hãy thử lại sau.';
}

function snapshotPet(pet) {
  if (!pet || typeof pet !== 'object') return 'Thú cưng';
  return `${pet.name || 'Thú cưng'}${pet.species ? ` (${pet.species})` : ''}`;
}

export function DirectedBookingProposalPage({ api, proposalId: suppliedProposalId, proposal: suppliedProposal,
  booking, visit, petSnapshots, idempotencyKey: suppliedKey, onConfirmed }) {
  const params = useParams();
  const proposalId = suppliedProposalId || params.proposalId;
  const keyRef = useRef(idempotencyKey(suppliedKey));
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [commandState, setCommandState] = useState({ status: 'idle' });
  const load = useCallback(({ signal }) => {
    if (suppliedProposal) return Promise.resolve({ data: suppliedProposal, status: 200 });
    if (typeof api?.getProposal !== 'function') return Promise.resolve({ pending: true, data: null });
    return api.getProposal({ proposalId, signal });
  }, [api, proposalId, suppliedProposal]);
  const resource = useApiResource(load);
  const proposal = suppliedProposal || resource.data;
  const slots = proposal?.slots || [];
  const pets = proposal?.petSnapshots || petSnapshots || booking?.petSnapshots || [];
  const isConfirmable = proposal?.state === 'PENDING_CUSTOMER_CONFIRMATION' && slots.length > 0;

  async function confirm() {
    if (!isConfirmable || !selectedSlot || commandState.status === 'submitting' || typeof api?.confirmProposal !== 'function') return;
    setCommandState({ status: 'submitting' });
    try {
      const result = await api.confirmProposal(proposal.id || proposalId, {
        expectedVersion: proposal.version, selectedSlot, idempotencyKey: keyRef.current
      });
      setCommandState({ status: result?.pending ? 'pending' : 'success', result: result?.data });
      if (!result?.pending) onConfirmed?.(result?.data);
    } catch (error) {
      setCommandState({ status: 'error', code: error?.code, message: actionMessage(error) });
      if (error?.status === 401) resource.retry();
    }
  }

  return <main className="directed-proposal" aria-labelledby="directed-proposal-title">
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đề xuất lịch">Đang đọc khung giờ và snapshot từ máy chủ.</Notice>}
    {resource.status === 'pending' && <Notice state="pending" title="Đang chờ máy chủ xác nhận">Đề xuất chưa được xác nhận; dữ liệu chờ không được coi là đã đặt lịch.</Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Không thể xem đề xuất">Đề xuất này không thuộc phiên Customer hiện tại.</Notice>}
    {resource.status === 'error' && <Notice state="error" title="Không tải được đề xuất" action={<Button variant="secondary" onClick={resource.retry}>Tải lại</Button>}>Đề xuất có thể đã hết hạn hoặc mã không hợp lệ.</Notice>}
    {proposal && <>
      <header className="directed-proposal__header">
        <div><p className="directed-proposal__eyebrow">Paw World Care · Đề xuất sitter</p>
          <h1 id="directed-proposal-title">Xác nhận lịch với sitter</h1>
          <p>Kiểm tra visit, thú cưng và giá snapshot trước khi gửi offer. Chưa xác nhận thì máy chủ chưa tạo offer.</p></div>
        <span className={`directed-proposal__state directed-proposal__state--${String(proposal.state || '').toLowerCase()}`}>{proposal.state || 'Chưa xác định'}</span>
      </header>
      <section className="directed-proposal__panel" aria-labelledby="directed-proposal-summary-title">
        <h2 id="directed-proposal-summary-title">Thông tin visit</h2>
        <dl className="directed-proposal__facts">
          <div><dt>Visit</dt><dd>{visit?.localDate || formatDate(visit?.startAt || proposal.slots?.[0]?.startAt)}</dd></div>
          <div><dt>Sitter</dt><dd>{proposal.sitter?.displayName || proposal.sitter?.name || proposal.sitterId || 'Đã chọn sitter'}</dd></div>
          <div><dt>Giá snapshot</dt><dd>{amount(proposal.priceSnapshot || booking?.serviceSnapshot?.price)}</dd></div>
          <div><dt>Thanh toán</dt><dd>{proposal.paymentState || (proposal.paymentRequired ? 'Cần theo chính sách prepay' : 'Theo xác nhận máy chủ')}</dd></div>
        </dl>
        <p className="directed-proposal__pets"><strong>Thú cưng:</strong> {pets.length ? pets.map(snapshotPet).join(', ') : 'Theo snapshot máy chủ'}</p>
      </section>
      <section className="directed-proposal__panel" aria-labelledby="directed-proposal-slots-title">
        <h2 id="directed-proposal-slots-title">Khung giờ được đề xuất</h2>
        {!slots.length && <Notice state="empty" title="Chưa có khung giờ">Sitter chưa có slot phù hợp; hãy yêu cầu máy chủ đề xuất lại.</Notice>}
        {slots.length > 0 && <fieldset className="directed-proposal__slots"><legend>Chọn một khung giờ</legend>{slots.map(item => {
          const value = `${item.startAt}/${item.endAt}`;
          return <label key={value} className="directed-proposal__slot"><input type="radio" name="directed-slot" value={value}
            checked={selectedSlot?.startAt === item.startAt && selectedSlot?.endAt === item.endAt}
            onChange={() => setSelectedSlot(item)} /><span><strong>{formatDate(item.startAt)}</strong><small> đến {formatDate(item.endAt)}</small></span></label>;
        })}</fieldset>}
        {proposal.expiresAt && <p className="directed-proposal__expiry">Hạn xác nhận: {formatDate(proposal.expiresAt)}. Máy chủ sẽ kiểm tra lại hạn và slot.</p>}
        {commandState.status === 'error' && <Notice state="error" title="Chưa xác nhận được lịch">{commandState.message}</Notice>}
        {commandState.status === 'pending' && <Notice state="pending" title="Đang chờ máy chủ xác nhận">Đừng gửi lại thao tác với mã khác. Tải lại để đối chiếu kết quả.</Notice>}
        {commandState.status === 'success' && <Notice state="success" title="Đã gửi offer cho sitter">Máy chủ đã ghi nhận xác nhận lịch; sitter sẽ thấy work offer sau bước này.</Notice>}
        <Button onClick={confirm} loading={commandState.status === 'submitting'} disabled={!isConfirmable || !selectedSlot || commandState.status === 'success'}>
          Xác nhận lịch và gửi offer
        </Button>
      </section>
    </>}
  </main>;
}
