import { useCallback, useRef, useState } from 'react';
import { Button, Notice } from '../../components/ui/index.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { sitterOperationsApi } from '../../services/sitter-operations-api.js';
import './sitter-assignments.css';

function operationKey() {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) throw new Error('Secure operation keys are unavailable');
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function time(value) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function stateText(state) {
  return { PENDING: 'Đang chờ phản hồi', ACCEPTED: 'Đã nhận', DECLINED: 'Đã từ chối', EXPIRED: 'Đã hết hạn', REVOKED: 'Đã thu hồi',
    ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang thực hiện', COMPLETED: 'Đã hoàn tất', WITHDRAWN: 'Đã rút khỏi ca', CANCELLED: 'Đã hủy' }[state] ?? state;
}

function messageFor(error) {
  if (error?.code === 'OFFER_EXPIRED') return 'Offer đã hết hạn; hãy tải lại danh sách để xem trạng thái mới nhất.';
  if (error?.code === 'SLOT_UNAVAILABLE' || error?.code === 'SITTER_NOT_ELIGIBLE') return 'Ca đã thay đổi hoặc bạn không còn đủ điều kiện nhận ca.';
  if (error?.code === 'VERSION_CONFLICT') return 'Offer đã thay đổi ở nơi khác. Hãy tải lại trước khi quyết định.';
  if (error?.status === 403 || error?.code === 'FORBIDDEN') return 'Tài khoản hiện không có quyền xem hoặc quyết định offer này.';
  return 'Chưa nhận được xác nhận từ máy chủ. Yêu cầu vẫn đang chờ kiểm tra.';
}

function ListNotice({ resource, retry, kind }) {
  if (resource.status === 'loading') return <Notice state="loading" title={`Đang tải ${kind}`}>Dữ liệu được lấy theo tài khoản Sitter hiện tại.</Notice>;
  if (resource.status === 'pending') return <Notice state="pending" title={`${kind} đang chờ tích hợp`}>Máy chủ chưa xác nhận dữ liệu. Không hiển thị dữ liệu mẫu.</Notice>;
  if (resource.status === 'forbidden') return <Notice state="forbidden" title="Không có quyền truy cập">Chỉ Sitter đang đăng nhập được xem ca và offer của mình.</Notice>;
  if (resource.status === 'error') return <Notice state="error" title={`Không tải được ${kind}`} action={<Button variant="secondary" onClick={retry}>Tải lại</Button>}>Dữ liệu chưa được xác nhận.</Notice>;
  if (resource.status === 'empty') return <Notice state="empty" title={kind === 'offer' ? 'Chưa có offer mới' : 'Chưa có lịch đã nhận'}>Các ca sẽ xuất hiện khi điều phối xác nhận.</Notice>;
  return null;
}

export function SitterAssignmentsPage({ api = sitterOperationsApi, createOperationKey = operationKey }) {
  const loadOffers = useCallback(({ signal }) => api.listOffers({}, { signal }), [api]);
  const loadAssignments = useCallback(({ signal }) => api.listAssignments({}, { signal }), [api]);
  const offers = useApiResource(loadOffers);
  const assignments = useApiResource(loadAssignments);
  const [selected, setSelected] = useState(null);
  const [command, setCommand] = useState(null);
  const operation = useRef(null);
  const offer = selected && (offers.data?.items ?? []).find(item => item.id === selected);
  const pendingCommand = command?.state === 'pending';

  async function decide(action) {
    if (!offer || pendingCommand || typeof api?.[action] !== 'function') return;
    const payload = { offerId: offer.id, expectedVersion: offer.version, action };
    const fingerprint = JSON.stringify(payload);
    if (!operation.current || operation.current.fingerprint !== fingerprint) operation.current = { fingerprint, key: createOperationKey() };
    setCommand({ state: 'loading' });
    try {
      const result = await api[action](offer.id, offer.version, operation.current.key);
      if (result?.pending || result?.status === 202) {
        setCommand({ state: 'pending', message: 'Máy chủ đang xử lý. Dùng nút tải lại để kiểm tra cùng offer.' });
        return;
      }
      const data = result?.data ?? result;
      if (!data || data.offerId !== offer.id || (action === 'acceptOffer' ? data.state !== 'ASSIGNED' : data.state !== 'DECLINED')) {
        setCommand({ state: 'pending', message: 'Chưa có xác nhận hợp lệ từ máy chủ.' });
        return;
      }
      operation.current = null;
      setCommand({ state: 'success', message: action === 'acceptOffer' ? 'Máy chủ đã xác nhận nhận ca.' : 'Máy chủ đã xác nhận từ chối offer.' });
      offers.retry(); assignments.retry();
    } catch (error) {
      setCommand({ state: !error?.status || ['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE'].includes(error?.code) ? 'pending' : error?.status === 403 ? 'forbidden' : 'error', message: messageFor(error) });
    }
  }

  return <section className="sitter-assignments" aria-labelledby="sitter-assignments-title">
    <a className="sitter-assignments__skip" href="#sitter-assignments-content">Đến nội dung offer</a>
    <header className="sitter-assignments__header"><p className="sitter-assignments__eyebrow">Khu vực Sitter</p><h1 id="sitter-assignments-title">Offer và lịch đã nhận</h1>
      <p>Chỉ thông tin cần cho việc nhận ca được hiển thị. Ghi chú ra vào nhà nằm trong cửa sổ quyền truy cập riêng.</p></header>
    <div id="sitter-assignments-content" className="sitter-assignments__columns">
      <section aria-labelledby="sitter-offers-heading"><h2 id="sitter-offers-heading">Offer dành cho bạn</h2><ListNotice resource={offers} retry={offers.retry} kind="offer" />
        {offers.status === 'success' && (offers.data?.items ?? []).length === 0 && <Notice state="empty" title="Chưa có offer mới">Các ca sẽ xuất hiện khi điều phối xác nhận.</Notice>}
        {offers.status === 'success' && (offers.data?.items ?? []).length > 0 && <ul className="sitter-assignments__list">{(offers.data?.items ?? []).map(item => <li key={item.id}>
          <button type="button" className={`sitter-assignments__card${selected === item.id ? ' is-selected' : ''}`} onClick={() => { setSelected(item.id); setCommand(null); }} aria-pressed={selected === item.id}>
            <span className="sitter-assignments__card-title">{item.serviceName}</span><span>{item.areaCode} · {stateText(item.state)}</span>
            <time dateTime={item.startAt}>{time(item.startAt)}</time><span>Phản hồi trước {time(item.deadline)}</span>
          </button>
        </li>)}</ul>}
      </section>
      <aside className="sitter-assignments__detail" aria-label="Chi tiết offer">
        {!offer && <p>Chọn một offer để xem chi tiết giới hạn và quyết định.</p>}
        {offer && <><p className="sitter-assignments__eyebrow">{offer.areaCode} · {stateText(offer.state)}</p><h2>{offer.serviceName}</h2>
          <dl><div><dt>Thời gian</dt><dd><time dateTime={offer.startAt}>{time(offer.startAt)}</time> – <time dateTime={offer.endAt}>{time(offer.endAt)}</time></dd></div>
            <div><dt>Hạn phản hồi</dt><dd><time dateTime={offer.deadline}>{time(offer.deadline)}</time></dd></div><div><dt>Thú cưng</dt><dd>{offer.pets.map(pet => `${pet.name} (${pet.species})`).join(', ') || '—'}</dd></div></dl>
          {command && <Notice state={command.state} title={command.state === 'success' ? 'Đã ghi nhận' : command.state === 'pending' ? 'Đang chờ máy chủ' : 'Chưa hoàn tất'}>{command.message}</Notice>}
          {offer.canRespond && !pendingCommand && <div className="sitter-assignments__actions"><Button onClick={() => decide('acceptOffer')}>Nhận ca</Button><Button variant="secondary" onClick={() => decide('declineOffer')}>Từ chối</Button></div>}
          {pendingCommand && <Button variant="secondary" onClick={() => { offers.retry(); assignments.retry(); }}>Kiểm tra lại</Button>}
          <p className="sitter-assignments__privacy">Địa chỉ và ghi chú riêng không nằm trong offer này.</p>
        </>}
      </aside>
    </div>
    <section className="sitter-assignments__schedule" aria-labelledby="sitter-schedule-heading"><h2 id="sitter-schedule-heading">Lịch đã phân công</h2><ListNotice resource={assignments} retry={assignments.retry} kind="lịch đã nhận" />
      {assignments.status === 'success' && (assignments.data?.items ?? []).length === 0 && <Notice state="empty" title="Chưa có lịch đã nhận">Các ca sẽ xuất hiện khi điều phối xác nhận.</Notice>}
      {assignments.status === 'success' && (assignments.data?.items ?? []).length > 0 && <ul className="sitter-assignments__schedule-list">{(assignments.data?.items ?? []).map(item => <li key={item.visitId}><article><h3>{item.serviceName}</h3><p>{stateText(item.state)} · {item.areaCode}</p><time dateTime={item.startAt}>{time(item.startAt)} – {time(item.endAt)}</time>{item.handoverRequired && <p>{item.handoverAccepted ? 'Đã xác nhận bàn giao' : 'Chờ xác nhận bàn giao để xem ghi chú riêng'}</p>}</article></li>)}</ul>}
    </section>
  </section>;
}

export default SitterAssignmentsPage;
