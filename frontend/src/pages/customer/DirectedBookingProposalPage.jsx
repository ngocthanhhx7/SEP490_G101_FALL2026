import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  return Number.isSafeInteger(raw) ? money.format(raw) : 'Theo thông tin đã lưu';
}

function idempotencyKey(seed) {
  if (typeof seed === 'string' && seed.length >= 8) return seed;
  if (typeof globalThis.crypto?.randomUUID === 'function') return `direct-${globalThis.crypto.randomUUID()}`;
  return `direct-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function actionMessage(error) {
  if (error?.code === 'PROPOSAL_EXPIRED') return 'Đề xuất đã hết hạn. Vui lòng yêu cầu đề xuất lịch mới.';
  if (error?.code === 'VERSION_CONFLICT' || error?.code === 'SLOT_NOT_PROPOSED') return 'Lịch đã thay đổi. Hãy tải lại đề xuất trước khi xác nhận.';
  if (error?.code === 'PROPOSAL_NOT_CONFIRMABLE') return 'Đề xuất không còn chờ xác nhận; hãy tải lại để xem trạng thái mới.';
  if (error?.code === 'CSRF_NOT_READY') return 'Phiên bảo mật chưa sẵn sàng. Vui lòng đăng nhập lại.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') return 'Chưa nhận được xác nhận. Tải lại trước khi gửi lại.';
  return 'Không thể xác nhận lịch lúc này. Hãy thử lại sau.';
}

function snapshotPet(pet) {
  if (!pet || typeof pet !== 'object') return 'Thú cưng';
  return `${pet.name || 'Thú cưng'}${pet.species ? ` (${pet.species})` : ''}`;
}

export function DirectedBookingProposalPage(props) {
  const params = useParams();
  return <ProposalDetails key={props.proposalId || params.proposalId || props.proposal?.id} {...props} />;
}

function ProposalDetails({ api, proposalId: suppliedProposalId, proposal: suppliedProposal,
  booking, visit, petSnapshots, idempotencyKey: suppliedKey, onConfirmed }) {
  const params = useParams();
  const proposalId = suppliedProposalId || params.proposalId;
  const keyRef = useRef(idempotencyKey(suppliedKey));
  const operationRef = useRef(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [commandState, setCommandState] = useState({ status: 'idle' });
  const load = useCallback(({ signal }) => {
    if (suppliedProposal) return Promise.resolve({ data: suppliedProposal, status: 200 });
    if (typeof api?.getProposal !== 'function') return Promise.resolve({ pending: true, data: null });
    return api.getProposal({ proposalId, signal });
  }, [api, proposalId, suppliedProposal]);
  const resource = useApiResource(load);
  const loadedProposal = suppliedProposal || resource.data;
  const proposal = commandState.status === 'success' && commandState.result?.proposal
    ? { ...loadedProposal, ...commandState.result.proposal } : loadedProposal;
  const slots = proposal?.slots || [];
  const pets = proposal?.petSnapshots || petSnapshots || booking?.petSnapshots || [];
  const isConfirmable = proposal?.state === 'PENDING_CUSTOMER_CONFIRMATION' && slots.length > 0;

  async function confirm() {
    if (!isConfirmable || !selectedSlot || commandState.status === 'submitting' || typeof api?.confirmProposal !== 'function') return;
    setCommandState({ status: 'submitting' });
    try {
      if (!operationRef.current) operationRef.current = { expectedVersion: proposal.version, selectedSlot, idempotencyKey: keyRef.current };
      const result = await api.confirmProposal(proposal.id || proposalId, operationRef.current);
      setCommandState({ status: result?.pending ? 'pending' : 'success', result: result?.data });
      if (!result?.pending) onConfirmed?.(result?.data);
    } catch (error) {
      const uncertain = !error?.status || error.status >= 500 || ['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'INVALID_RESPONSE'].includes(error?.code);
      setCommandState({ status: uncertain ? 'pending' : 'error', code: error?.code, message: actionMessage(error) });
      if (!uncertain) operationRef.current = null;
      if (error?.status === 401) resource.retry();
    }
  }

  return <main className="directed-proposal" aria-labelledby="directed-proposal-title">
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải đề xuất lịch">Đang tải khung giờ đề xuất.</Notice>}
    {resource.status === 'pending' && <Notice state="pending" title="Đang chờ xác nhận">Đề xuất chưa được xác nhận; dữ liệu chờ không được coi là đã đặt lịch.</Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Không thể xem đề xuất">Đề xuất này không thuộc tài khoản hiện tại.</Notice>}
    {resource.status === 'error' && <Notice state="error" title="Không tải được đề xuất" action={<Button variant="secondary" onClick={resource.retry}>Tải lại</Button>}>Đề xuất có thể đã hết hạn hoặc mã không hợp lệ.</Notice>}
    {proposal && <>
      <header className="directed-proposal__header">
        <div><p className="directed-proposal__eyebrow">Paw World Care · Đề xuất pet sitter</p>
          <h1 id="directed-proposal-title">Xác nhận lịch với pet sitter</h1>
          <p>{proposal.state === 'CONFIRMED' ? 'Lịch mới đã được xác nhận. Pet sitter vẫn cần nhận lời mời.' : 'Lịch hiện tại được giữ đến khi bạn xác nhận lịch thay thế.'}</p></div>
        <span className="directed-proposal__state">{({ PENDING_CUSTOMER_CONFIRMATION: 'Chờ bạn xác nhận', CONFIRMED: 'Đã xác nhận lịch', EXPIRED: 'Đã hết hạn', CANCELLED: 'Đã hủy' })[proposal.state] ?? 'Cần kiểm tra trạng thái'}</span>
      </header>
      <section className="directed-proposal__panel" aria-labelledby="directed-proposal-summary-title">
        <h2 id="directed-proposal-summary-title">Thông tin buổi chăm sóc</h2>
        {proposal.previousSitterId && proposal.previousSitterId !== proposal.sitterId && <Notice state="pending" title="Đề xuất đổi người chăm sóc">
          Người đã chọn: {proposal.previousSitter?.displayName || 'Theo đơn đã đặt'}. Người thay thế: {proposal.sitter?.displayName || 'Người chăm sóc được đề xuất'}.
          Chỉ khi bạn xác nhận, hệ thống mới gửi lời mời cho người thay thế; người đó vẫn cần chấp nhận ca.
        </Notice>}
        <dl className="directed-proposal__facts">
          <div><dt>Buổi chăm sóc</dt><dd>{visit?.localDate || formatDate(visit?.startAt || proposal.slots?.[0]?.startAt)}</dd></div>
          {proposal.areaCode && <div><dt>Khu vực tại địa chỉ đã đặt</dt><dd>{proposal.areaLabel ?? proposal.areaCode}{proposal.previousAreaCode !== proposal.areaCode && ' · Đề xuất xác nhận khu vực cụ thể hơn, giữ nguyên vị trí ghim'}</dd></div>}
          <div><dt>Pet sitter</dt><dd>{proposal.sitter?.displayName || proposal.sitter?.name || proposal.sitterId || 'Đã chọn pet sitter'}</dd></div>
          <div><dt>Giá đã lưu</dt><dd>{amount(proposal.priceSnapshot || booking?.serviceSnapshot?.price)}</dd></div>
          <div><dt>Thanh toán</dt><dd>{proposal.paymentState || (proposal.paymentRequired ? 'Thanh toán trả trước' : 'Theo đơn đã đặt')}</dd></div>
        </dl>
        <p className="directed-proposal__pets"><strong>Thú cưng:</strong> {pets.length ? pets.map(snapshotPet).join(', ') : 'Theo thông tin đã lưu'}</p>
      </section>
      <section className="directed-proposal__panel" aria-labelledby="directed-proposal-slots-title">
        <h2 id="directed-proposal-slots-title">Khung giờ được đề xuất</h2>
        {!slots.length && <Notice state="empty" title="Chưa có khung giờ">Pet sitter chưa có khung giờ phù hợp. Vui lòng yêu cầu đề xuất lại.</Notice>}
        {slots.length > 0 && <fieldset className="directed-proposal__slots"><legend>Chọn một khung giờ</legend>{slots.map(item => {
          const value = `${item.startAt}/${item.endAt}`;
          return <label key={value} className="directed-proposal__slot"><input type="radio" name="directed-slot" value={value}
            checked={selectedSlot?.startAt === item.startAt && selectedSlot?.endAt === item.endAt}
            disabled={['submitting', 'pending', 'success'].includes(commandState.status) || !isConfirmable}
            onChange={() => { setSelectedSlot(item); operationRef.current = null; keyRef.current = idempotencyKey(); }} /><span><strong>{formatDate(item.startAt)}</strong><small> đến {formatDate(item.endAt)}</small></span></label>;
        })}</fieldset>}
        {proposal.expiresAt && <p className="directed-proposal__expiry">Hạn xác nhận: {formatDate(proposal.expiresAt)}. Hệ thống sẽ kiểm tra lại thời hạn và khung giờ khi xác nhận.</p>}
        {commandState.status === 'error' && <Notice state="error" title="Chưa xác nhận được lịch">{commandState.message}</Notice>}
        {commandState.status === 'pending' && <Notice state="pending" title="Đang chờ xác nhận">Chưa nhận được kết quả. Bạn có thể kiểm tra lại cùng yêu cầu.</Notice>}
        {proposal.state === 'CONFIRMED' && <Notice state="success" title="Đã gửi lời mời nhận ca">Theo dõi đơn để biết khi người chăm sóc nhận lời. <Link to={`/services?booking=${encodeURIComponent(proposal.bookingId || '')}`}>Xem đơn chăm sóc</Link></Notice>}
        {proposal.state !== 'CONFIRMED' && <Button onClick={confirm} loading={commandState.status === 'submitting'} disabled={!isConfirmable || !selectedSlot || commandState.status === 'success'}>
          {commandState.status === 'pending' ? 'Kiểm tra lại xác nhận lịch' : 'Xác nhận lịch và gửi lời mời'}
        </Button>}
        {commandState.status === 'error' && <Button variant="secondary" onClick={() => { setSelectedSlot(null); keyRef.current = idempotencyKey(); resource.retry(); }}>Tải lại đề xuất</Button>}
      </section>
    </>}
  </main>;
}
