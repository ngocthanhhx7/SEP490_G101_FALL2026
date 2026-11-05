import { CursorPagination } from '../../components/ui/Pagination.jsx';
import { OperationsMetrics, OperationsTable, OperationsBadge } from '../../components/common/OperationsWorkspace.jsx';
import { Dialog } from '../../components/ui/index.js';
import { useEffect, useRef, useState } from 'react';
import { pendingAdminSettlementApi } from '../../services/admin-settlement-api.js';
import './admin-settlements.css';

const statusLabel = {
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt, chờ chuyển',
  TRANSFER_PENDING: 'Cần đối soát chuyển khoản',
  PAID: 'Đã ghi nhận thanh toán',
  REJECTED: 'Đã từ chối',
  WITHDRAWN: 'Đã rút',
};
const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
function RequestCard({ row, api, disabled, refresh, onLock }) {
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('APPROVE');
  const [outcome, setOutcome] = useState('CONFIRMED');
  const [reference, setReference] = useState('');
  const [evidence, setEvidence] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [amount, setAmount] = useState(String(row.amountVnd));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    onLock?.(busy || pending);
    return () => onLock?.(false);
  }, [busy, pending, onLock]);
  const command = useRef(null);
  const lock = useRef(false);
  const upload = useRef(null);
  const [file, setFile] = useState(null);
  const submitted = row.status === 'SUBMITTED';
  const actionable = submitted || ['APPROVED', 'TRANSFER_PENDING'].includes(row.status);
  async function uploadEvidence() {
    if (!file || lock.current) return;
    if (upload.current?.file !== file) upload.current = { file, key: window.crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      setEvidence(await api.uploadEvidence(file, upload.current.key));
      setNotice('Đã tải bằng chứng riêng tư.');
    } catch (failure) {
      setError(failure.code || 'NETWORK_ERROR');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function send(event) {
    event?.preventDefault?.();
    if (lock.current) return;
    const body = pending
      ? command.current.body
      : submitted
        ? { decision, reason, expectedVersion: row.version }
        : {
            outcome,
            reference,
            evidenceReference: evidence,
            amountVnd: outcome === 'CONFIRMED' ? Number(amount) : undefined,
            paidAt: outcome === 'CONFIRMED' ? paidAt : undefined,
            expectedVersion: row.version,
          };
    const payload = JSON.stringify(body);
    if (!command.current || command.current.payload !== payload)
      command.current = { body, payload, key: window.crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api[submitted ? 'decide' : 'recordTransfer'](row.id, body, command.current.key);
      setNotice(
        result.status === 'PAID' ? 'Đã ghi nhận bằng chứng chuyển khoản.' : `Đã ghi nhận: ${result.status}.`,
      );
      command.current = null;
      refresh();
    } catch (failure) {
      setPending(!failure.status || failure.status >= 500 || failure.code === 'INVALID_RESPONSE');
      setError(failure.code || 'NETWORK_ERROR');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <article aria-label={`Yêu cầu ${row.id}`}>
      <h2>Yêu cầu …{row.id.slice(-8)}</h2>
      <p>
        Người chăm sóc: {row.sitterName ?? row.sitterId} · Tuần {row.requestWeekKey}
      </p>
      <p>
        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.amountVnd)} ·{' '}
        {statusLabel[row.status] ?? row.status}
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">Chưa xác nhận thao tác: {error}. Gửi lại cùng nội dung dùng lại mã yêu cầu.</p>
      )}
      {pending && (
        <button type="button" disabled={busy || disabled} onClick={send}>
          Kiểm tra lại cùng yêu cầu
        </button>
      )}
      {actionable && (
        <form onSubmit={send}>
          <fieldset disabled={busy || disabled || pending}>
            <legend>{submitted ? 'Quyết định' : 'Ghi kết quả chuyển khoản ngoài hệ thống'}</legend>
            {submitted ? (
              <>
                <label>
                  Quyết định
                  <select value={decision} onChange={(event) => setDecision(event.target.value)}>
                    <option value="APPROVE">Duyệt</option>
                    <option value="REJECT">Từ chối</option>
                  </select>
                </label>
                <label>
                  Lý do
                  <input
                    required
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <p>Chỉ ghi nhận giao dịch đã thực hiện. Duyệt chưa có nghĩa đã trả.</p>
                <label>
                  Kết quả
                  <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                    <option value="CONFIRMED">Đã xác nhận</option>
                    <option value="UNKNOWN">Chưa rõ / cần đối soát</option>
                  </select>
                </label>
                <label>
                  Reference chuyển khoản
                  <input
                    required
                    maxLength={160}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </label>
                <label>
                  Mã bằng chứng riêng tư
                  <input
                    required
                    maxLength={160}
                    value={evidence}
                    onChange={(event) => setEvidence(event.target.value)}
                  />
                </label>
                {api.uploadEvidence && (
                  <>
                    <label>
                      Ảnh chuyển khoản
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(event) => {
                          setFile(event.target.files?.[0] ?? null);
                          setEvidence('');
                          setNotice('');
                        }}
                      />
                    </label>
                    <button type="button" disabled={!file} onClick={uploadEvidence}>
                      Tải bằng chứng
                    </button>
                  </>
                )}
                {outcome === 'CONFIRMED' && (
                  <>
                    <label>
                      Số tiền VND
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                    </label>
                    <label>
                      Thời điểm có múi giờ (ISO, ví dụ 2026-10-15T10:00:00+07:00)
                      <input required value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
                    </label>
                  </>
                )}
              </>
            )}
            <button type="submit">
              {busy ? 'Đang ghi nhận…' : submitted ? 'Lưu quyết định' : 'Ghi kết quả'}
            </button>
          </fieldset>
        </form>
      )}
    </article>
  );
}

export default function AdminSettlementsPage({ api = pendingAdminSettlementApi }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [revision, setRevision] = useState(0),
    [cursor, setCursor] = useState(null),
    [pages, setPages] = useState([]),
    [selected, setSelected] = useState(null),
    [locked, setLocked] = useState(false),
    [status, setStatus] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    api
      .load({ signal: controller.signal, cursor })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.code || 'NETWORK_ERROR');
      });
    return () => controller.abort();
  }, [api, revision, cursor]);
  const active = data?.items.find((r) => r.id === selected),
    summary = data?.summary;
  const count = (s) => summary?.filter((r) => s.includes(r._id)).reduce((n, r) => n + r.count, 0),
    amount = (s) =>
      summary ? money(summary.filter((r) => s.includes(r._id)).reduce((n, r) => n + r.amountVnd, 0)) : null;
  return (
    <section className="ops-workspace admin-settlements">
      <header>
        <div>
          <h1>Duyệt tất toán</h1>
          <p className="ops-muted">
            Đối chiếu yêu cầu theo tuần Việt Nam. Duyệt và ghi nhận chuyển khoản là hai bước riêng.
          </p>
        </div>
        <button disabled={locked} onClick={() => setRevision((v) => v + 1)}>
          Tải lại
        </button>
      </header>
      <OperationsMetrics
        items={[
          { label: 'Tổng yêu cầu', value: summary?.reduce((n, r) => n + r.count, 0) },
          { label: 'Chờ duyệt', value: count(['SUBMITTED']) },
          { label: 'Đã duyệt / cần đối soát', value: amount(['APPROVED', 'TRANSFER_PENDING']) },
          { label: 'Đã ghi nhận thanh toán', value: amount(['PAID']) },
        ]}
        caption="Số liệu từ toàn bộ yêu cầu hiện có, không phải doanh thu hay số dư ngân hàng. Không chuyển tiền tự động."
      />
      {error && (
        <p role="alert">
          {error === 'FORBIDDEN'
            ? 'Bạn không có quyền xem tất toán.'
            : error === 'INTEGRATION_PENDING'
              ? 'Chức năng tất toán đang chờ kết nối dữ liệu.'
              : `Chưa tải được yêu cầu (${error}).`}
        </p>
      )}
      {!data && !error && <p role="status">Đang tải…</p>}
      {!!data?.decisionIds?.length && (
        <div className="ops-policy" role="status">
          <strong>Chưa mở thao tác duyệt hoặc ghi nhận chuyển khoản.</strong>
          <p>
            Các điều kiện tích hợp và bằng chứng đối soát chưa sẵn sàng để áp dụng chính sách tất toán. Bạn
            vẫn có thể xem để đối chiếu.
          </p>
          <details>
            <summary>Điều kiện đang khóa thao tác</summary>
            <ul>
              {data.decisionIds.map((id) => (
                <li key={id}>
                  {{
                    'FIN-07-ELIG': 'Điều kiện khoản thu được tất toán',
                    'FIN-07-POSTPAY': 'Đối soát dịch vụ thu tiền sau',
                    'FIN-08-EDIT': 'Điều chỉnh khoản thu và yêu cầu đã lập',
                  }[id] ?? 'Điều kiện nghiệp vụ chưa sẵn sàng'}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <section className="ops-section">
        <header>
          <h2>Yêu cầu tất toán</h2>
          <label>
            Lọc trên trang này{' '}
            <select
              aria-label="Trạng thái tất toán trên trang"
              value={status}
              disabled={locked}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tất cả</option>
              {Object.entries(statusLabel).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </header>
        <OperationsTable
          label="Danh sách yêu cầu tất toán"
          rows={(data?.items ?? []).filter((r) => !status || r.status === status)}
          empty="Chưa có yêu cầu tất toán trong danh sách."
          columns={[
            { key: 'id', label: 'Yêu cầu', render: (r) => <strong title={r.id}>…{r.id.slice(-8)}</strong> },
            {
              key: 'sitter',
              label: 'Người chăm sóc',
              render: (r) => <span title={r.sitterId}>{r.sitterName ?? '…' + r.sitterId.slice(-6)}</span>,
            },
            { key: 'requestWeekKey', label: 'Tuần yêu cầu' },
            { key: 'amount', label: 'Số tiền', render: (r) => money(r.amountVnd) },
            {
              key: 'status',
              label: 'Trạng thái',
              render: (r) => (
                <OperationsBadge
                  tone={
                    r.status === 'PAID'
                      ? 'success'
                      : r.status === 'SUBMITTED'
                        ? 'warning'
                        : r.status === 'TRANSFER_PENDING'
                          ? 'danger'
                          : 'neutral'
                  }
                >
                  {statusLabel[r.status] ?? r.status}
                </OperationsBadge>
              ),
            },
            {
              key: 'submittedAt',
              label: 'Ngày gửi',
              render: (r) =>
                r.submittedAt
                  ? new Date(r.submittedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                  : '—',
            },
            {
              key: 'action',
              label: 'Thao tác',
              render: (r) => (
                <button disabled={locked} onClick={() => setSelected(r.id)}>
                  Xem / đối chiếu
                </button>
              ),
            },
          ]}
        />
        <CursorPagination page={pages.length + 1} label="tất toán" hasNext onFirst={() => { setCursor(null); setPages([]); }}
 onPrevious={() => {
              setCursor(pages.at(-1));
              setPages((p) => p.slice(0, -1));
            }} onNext={() => {
              setPages((p) => [...p, cursor]);
              setCursor(data.nextCursor);
            }}
 previousDisabled={locked || !pages.length} nextDisabled={locked || !data?.nextCursor}
 previousLabel={"Trang trước"} nextLabel={"Trang tiếp"} />
      </section>
      {active && (
        <Dialog
          open
          title="Đối chiếu yêu cầu tất toán"
          className="ops-dialog"
          dismissible={!locked}
          onClose={() => setSelected(null)}
        >
          <RequestCard
            key={`${active.id}:${active.version}`}
            row={active}
            api={api}
            disabled={!Array.isArray(data.decisionIds) || !!data.decisionIds.length}
            onLock={setLocked}
            refresh={() => setRevision((v) => v + 1)}
          />
        </Dialog>
      )}
    </section>
  );
}
