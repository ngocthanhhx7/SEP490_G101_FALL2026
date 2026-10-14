import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Input, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { createCustomerAddressAdapter } from '../../services/customer-address-adapter.js';
import './customer-addresses.css';

const emptyDraft = { label: '', location: '', privateAccessNotes: '' };

function requestMessage(error) {
  if (error?.status === 401) return 'Phiên đã hết hạn. Vui lòng đăng nhập lại rồi tiếp tục.';
  if (error?.status === 403) return 'Tài khoản hiện tại không có quyền xem các địa chỉ này.';
  if (error?.status === 404) return 'Không tìm thấy địa chỉ đang thao tác.';
  if (error?.code === 'ADDRESS_VERSION_CONFLICT') return 'Địa chỉ đã được cập nhật ở nơi khác. Tải lại trước khi tiếp tục.';
  if (error?.code === 'CSRF_NOT_READY') return 'Phiên bảo mật chưa sẵn sàng. Vui lòng đăng nhập lại.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') {
    return 'Chưa nhận được xác nhận từ máy chủ. Tải lại danh sách để kiểm tra trước khi gửi lại.';
  }
  return 'Không thể lưu địa chỉ lúc này. Kiểm tra thông tin rồi thử lại.';
}

function cleanDraft(draft) {
  return {
    label: draft.label.normalize('NFC').replace(/[\s\u00a0]+/gu, ' ').trim(),
    location: draft.location.normalize('NFC').replace(/\r\n?/gu, '\n')
      .split('\n').map(line => line.replace(/[\t\u00a0 ]+/gu, ' ').trim()).filter(Boolean).join('\n'),
    privateAccessNotes: draft.privateAccessNotes.normalize('NFC').replace(/\r\n?/gu, '\n')
      .split('\n').map(line => line.replace(/[\t\u00a0 ]+/gu, ' ').trim()).join('\n').trim()
  };
}

export function CustomerAddressesPage({ addressAdapter: suppliedAdapter }) {
  const locationId = useId();
  const accessNotesId = useId();
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const api = useMemo(() => suppliedAdapter ? null : createApiClient({
    getCsrfToken: () => sessionRef.current.getCsrfToken?.(),
    onUnauthorized: () => sessionRef.current.invalidate()
  }), [suppliedAdapter]);
  const adapter = useMemo(() => suppliedAdapter ?? createCustomerAddressAdapter(api), [api, suppliedAdapter]);
  const [pageCursors, setPageCursors] = useState([]);
  const cursor = pageCursors.at(-1) ?? null;
  const loadAddresses = useCallback(({ signal }) => adapter.list({ cursor, signal }), [adapter, cursor]);
  const resource = useApiResource(loadAddresses);
  const addresses = resource.data?.addresses ?? [];
  const [dialog, setDialog] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionPending, setActionPending] = useState(false);

  function openCreate() {
    setDraft(emptyDraft);
    setFormError('');
    setDialog({ type: 'create' });
  }

  function openEdit(address) {
    setDraft({ label: address.label, location: address.location, privateAccessNotes: address.privateAccessNotes ?? '' });
    setFormError('');
    setDialog({ type: 'edit', address });
  }

  function finishCommand(result, successMessage) {
    setDialog(null);
    setFormError('');
    setActionError('');
    setActionFeedback(result?.pending
      ? 'Máy chủ đang xử lý thay đổi. Tải lại danh sách để đối chiếu kết quả.'
      : successMessage);
    setPageCursors([]);
    resource.retry();
  }

  async function saveAddress(event, confirmedImpact = false) {
    event?.preventDefault();
    if (actionPending) return;
    const values = cleanDraft(draft);
    if (!values.label || !values.location || values.label.length > 60
      || values.location.length > 500 || values.privateAccessNotes.length > 1000) {
      setFormError('Kiểm tra tên, địa chỉ và ghi chú. Địa chỉ cần có nội dung; ghi chú tối đa 1.000 ký tự.');
      return;
    }
    setActionPending(true);
    setFormError('');
    setActionError('');
    try {
      let result;
      if (dialog?.type === 'edit' || dialog?.type === 'edit-impact') {
        result = await adapter.update(dialog.address.id, {
          ...values,
          expectedVersion: dialog.address.version,
          ...(confirmedImpact ? { confirmOpenBookingImpact: true } : {})
        });
      } else {
        result = await adapter.create(values);
      }
      finishCommand(result, dialog?.type?.startsWith('edit') ? 'Đã gửi cập nhật địa chỉ.' : 'Đã gửi địa chỉ mới.');
    } catch (error) {
      if (error?.code === 'ADDRESS_BOOKING_CONFIRMATION_REQUIRED') {
        setDialog(current => ({ ...current, sourceType: current.type === 'edit-impact' ? current.sourceType : current.type,
          type: 'edit-impact' }));
        setFormError('');
      } else {
        if (dialog?.type === 'edit-impact') {
          setDialog(current => ({ ...current, type: current.sourceType ?? 'edit' }));
        }
        setFormError(requestMessage(error));
        if (error?.status === 401) session.invalidate();
      }
    } finally {
      setActionPending(false);
    }
  }

  async function archiveAddress(confirmedImpact = false) {
    if (!dialog?.address || actionPending) return;
    setActionPending(true);
    setActionError('');
    try {
      const result = await adapter.archive(dialog.address.id, {
        expectedVersion: dialog.address.version,
        ...(confirmedImpact ? { confirmOpenBookingImpact: true } : {})
      });
      finishCommand(result, 'Đã ẩn địa chỉ khỏi danh sách sử dụng mới.');
    } catch (error) {
      if (error?.code === 'ADDRESS_BOOKING_CONFIRMATION_REQUIRED') {
        setDialog(current => ({ ...current, sourceType: current.type === 'archive-impact' ? current.sourceType : current.type,
          type: 'archive-impact' }));
      } else {
        if (dialog?.type === 'archive-impact') {
          setDialog(current => ({ ...current, type: current.sourceType ?? 'archive' }));
        }
        setActionError(requestMessage(error));
        if (error?.status === 401) session.invalidate();
      }
    } finally {
      setActionPending(false);
    }
  }

  async function setDefault(address) {
    if (actionPending || address.isDefault) return;
    setActionPending(true);
    setActionError('');
    setActionFeedback('');
    try {
      const result = await adapter.update(address.id, { isDefault: true, expectedVersion: address.version });
      setActionFeedback(result?.pending ? 'Đang chờ xác nhận máy chủ cho địa chỉ mặc định.' : 'Đã gửi cập nhật địa chỉ mặc định.');
      resource.retry();
    } catch (error) {
      setActionError(requestMessage(error));
      if (error?.status === 401) session.invalidate();
    } finally {
      setActionPending(false);
    }
  }

  function confirmOpenBookingImpact() {
    if (dialog?.type === 'edit-impact') saveAddress(undefined, true);
    if (dialog?.type === 'archive-impact') archiveAddress(true);
  }

  return <section className="customer-addresses" aria-labelledby="customer-addresses-title">
    <header className="customer-addresses-heading">
      <div>
        <span className="customer-addresses-eyebrow">HỒ SƠ CUSTOMER</span>
        <h1 id="customer-addresses-title">Địa chỉ phục vụ</h1>
        <p>Quản lý địa chỉ đến chăm sóc và hướng dẫn riêng cho từng nơi.</p>
      </div>
      <Button onClick={openCreate} disabled={resource.status === 'loading' || resource.status === 'forbidden'}>
        Thêm địa chỉ
      </Button>
    </header>

    {resource.status === 'loading' && <div className="customer-addresses-loading" role="status" aria-label="Đang tải địa chỉ">
      <span /><span /><span />
    </div>}
    {resource.status === 'pending' && <Notice state="pending" title="Đang chờ máy chủ xác nhận danh sách">
      Có thể tải lại để kiểm tra trạng thái đã lưu.
      <Button variant="secondary" onClick={resource.retry}>Tải lại</Button>
    </Notice>}
    {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem địa chỉ">
      Chỉ Customer đang đăng nhập mới được xem địa chỉ trong hồ sơ của mình.
    </Notice>}
    {resource.status === 'error' && <Notice state="error" title="Không tải được địa chỉ"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>
      {requestMessage({ code: resource.code })}
    </Notice>}
    {resource.status === 'success' && addresses.length === 0 && <Notice state="empty" title="Chưa có địa chỉ phục vụ">
      Thêm địa chỉ đầu tiên để dùng khi đặt lịch chăm sóc tại nhà.
      <Button onClick={openCreate}>Thêm địa chỉ</Button>
    </Notice>}

    {resource.status === 'success' && addresses.length > 0 && <>
      <p className="customer-addresses-privacy">Ghi chú ra vào chỉ hiển thị trong hồ sơ của bạn. Sitter được giao chỉ nhận bản snapshot trong cửa sổ truy cập của buổi chăm sóc.</p>
      <div className="customer-addresses-list" aria-label="Danh sách địa chỉ">
        {addresses.map(address => <article className="customer-address-card" key={address.id}>
          <div className="customer-address-card-heading">
            <div><span className="customer-address-label">{address.label}</span>
              {address.isDefault && <span className="customer-address-default">Mặc định</span>}
            </div>
          </div>
          <p className="customer-address-location">{address.location}</p>
          <div className="customer-address-note">
            <strong>Ghi chú riêng cho buổi chăm sóc</strong>
            <p>{address.privateAccessNotes || 'Chưa có ghi chú.'}</p>
          </div>
          <div className="customer-address-actions">
            {!address.isDefault && <Button variant="secondary" disabled={actionPending}
              onClick={() => setDefault(address)}>Đặt làm mặc định</Button>}
            <Button variant="secondary" disabled={actionPending} onClick={() => openEdit(address)}>Sửa</Button>
            <Button variant="danger" disabled={actionPending}
              onClick={() => setDialog({ type: 'archive', address })}>Ẩn địa chỉ</Button>
          </div>
        </article>)}
      </div>
      <nav className="customer-addresses-pagination" aria-label="Phân trang địa chỉ">
        <Button variant="secondary" disabled={pageCursors.length === 0 || actionPending}
          onClick={() => setPageCursors(value => value.slice(0, -1))}>Trang trước</Button>
        <span>Trang {pageCursors.length + 1}</span>
        <Button variant="secondary" disabled={!resource.data?.nextCursor || actionPending}
          onClick={() => setPageCursors(value => [...value, resource.data.nextCursor])}>Trang sau</Button>
      </nav>
    </>}

    {actionFeedback && <Notice state="success" title="Đã gửi thay đổi">
      {actionFeedback}<Button variant="secondary" onClick={() => { setActionFeedback(''); resource.retry(); }}>Đối chiếu danh sách</Button>
    </Notice>}
    {actionError && <Notice state="error" title="Chưa lưu được thay đổi"
      action={<Button variant="secondary" onClick={() => { setActionError(''); resource.retry(); }}>Tải lại danh sách</Button>}>
      {actionError}
    </Notice>}

    <Dialog open={['create', 'edit'].includes(dialog?.type)} onClose={() => setDialog(null)}
      title={dialog?.type === 'edit' ? 'Sửa địa chỉ' : 'Thêm địa chỉ'}
      description="Địa chỉ và ghi chú được kiểm tra lại ở máy chủ." dismissible={!actionPending}>
      <form className="customer-address-form" onSubmit={saveAddress}>
        <Input label="Tên gợi nhớ" value={draft.label} autoComplete="off" maxLength={60} required
          onChange={event => setDraft(value => ({ ...value, label: event.target.value }))}
          hint="Ví dụ: Nhà riêng hoặc Nhà ông bà." />
        <div className="customer-address-field">
          <label className="pwc-label" htmlFor={locationId}>Địa chỉ phục vụ<span aria-hidden="true"> *</span></label>
          <textarea id={locationId} className="pwc-control" rows="3" maxLength={500} required value={draft.location}
            onChange={event => setDraft(value => ({ ...value, location: event.target.value }))} />
          <small className="pwc-hint">Nhập địa chỉ cần thiết để tìm nơi chăm sóc. Tối đa 500 ký tự.</small>
        </div>
        <div className="customer-address-field">
          <label className="pwc-label" htmlFor={accessNotesId}>Ghi chú ra vào riêng</label>
          <textarea id={accessNotesId} className="pwc-control" rows="4" maxLength={1000} value={draft.privateAccessNotes}
            onChange={event => setDraft(value => ({ ...value, privateAccessNotes: event.target.value }))} />
          <small className="pwc-hint">Không ghi thông tin thanh toán. Ghi chú chỉ được chia sẻ với sitter được giao theo thời hạn truy cập.</small>
        </div>
        {formError && <Notice state="error" title="Chưa lưu được địa chỉ">{formError}</Notice>}
        <div className="customer-address-dialog-actions">
          <Button type="button" variant="secondary" disabled={actionPending} onClick={() => setDialog(null)}>Hủy</Button>
          <Button type="submit" loading={actionPending} loadingLabel="Đang lưu…">Lưu địa chỉ</Button>
        </div>
      </form>
    </Dialog>

    <Dialog open={dialog?.type === 'archive'} onClose={() => setDialog(null)} intent="destructive"
      title="Ẩn địa chỉ này?" description="Địa chỉ sẽ không còn xuất hiện khi tạo lịch mới. Booking đã xác nhận giữ snapshot hiện tại."
      dismissible={!actionPending}>
      <p>Địa chỉ được lưu trữ mềm để giữ nguyên lịch sử booking.</p>
      {actionError && <Notice state="error" title="Chưa ẩn được địa chỉ">{actionError}</Notice>}
      <div className="customer-address-dialog-actions">
        <Button variant="secondary" disabled={actionPending} onClick={() => setDialog(null)}>Giữ địa chỉ</Button>
        <Button variant="danger" loading={actionPending} loadingLabel="Đang ẩn…" onClick={() => archiveAddress(false)}>Ẩn địa chỉ</Button>
      </div>
    </Dialog>

    <Dialog open={dialog?.type === 'edit-impact' || dialog?.type === 'archive-impact'} onClose={() => setDialog(null)}
      intent="destructive" title="Xác nhận ảnh hưởng booking đang mở"
      description="Booking hiện có tiếp tục dùng snapshot địa chỉ và hướng dẫn đã lưu khi xác nhận. Thay đổi chỉ áp dụng cho các lựa chọn mới."
      dismissible={!actionPending}>
      <p>Hãy xác nhận để tiếp tục {dialog?.type === 'archive-impact' ? 'ẩn địa chỉ' : 'sửa địa chỉ'}.</p>
      <div className="customer-address-dialog-actions">
        <Button variant="secondary" disabled={actionPending}
          onClick={() => setDialog(current => ({ ...current, type: current.sourceType ?? (current.type === 'edit-impact' ? 'edit' : 'archive') }))}>
          Quay lại
        </Button>
        <Button variant="danger" loading={actionPending} loadingLabel="Đang xử lý…"
          onClick={confirmOpenBookingImpact}>Xác nhận và tiếp tục</Button>
      </div>
    </Dialog>
  </section>;
}
