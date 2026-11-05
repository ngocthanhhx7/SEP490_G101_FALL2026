import {
  OperationsMetrics,
  OperationsTable,
  OperationsBadge,
} from '../../components/common/OperationsWorkspace.jsx';
import { Dialog } from '../../components/ui/index.js';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../sitter/sitter-public-profile.css';

function ProfileReview({ row, api, refresh, onLock }) {
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('APPROVE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    onLock?.(busy || pending);
    return () => onLock?.(false);
  }, [busy, pending, onLock]);
  const command = useRef(null);
  const lock = useRef(false);
  async function submit(event) {
    event?.preventDefault?.();
    if (lock.current) return;
    const body = pending ? command.current.body : { decision, reason, expectedVersion: row.version };
    const payload = JSON.stringify(body);
    if (command.current?.payload !== payload)
      command.current = { body, payload, key: window.crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await api.review(row.userId, body, command.current.key);
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
    <article aria-label={`Hồ sơ ${row.userId}`}>
      <h2>{row.displayName ?? row.userId}</h2>
      <p className="profile-bio">{row.bio}</p>
      <p>{row.areas.join(', ')}</p>
      {error && <p role="alert">Chưa lưu được quyết định ({error}).</p>}
      {pending && (
        <button type="button" disabled={busy} onClick={submit}>
          Kiểm tra lại cùng quyết định
        </button>
      )}
      {row.state === 'SUBMITTED' && (
        <form onSubmit={submit}>
          <fieldset disabled={busy || pending}>
            <label>
              Quyết định
              <select value={decision} onChange={(event) => setDecision(event.target.value)}>
                <option value="APPROVE">Duyệt</option>
                <option value="REJECT">Từ chối</option>
              </select>
            </label>
            <label>
              Lý do
              <textarea
                required
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button type="submit">{busy ? 'Đang lưu…' : 'Lưu quyết định'}</button>
          </fieldset>
        </form>
      )}
    </article>
  );
}

export function SitterProfileReviewsPage({ api, userId }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [cursor, setCursor] = useState(null),
    [pages, setPages] = useState([]),
    [revision, setRevision] = useState(0),
    [state, setState] = useState('SUBMITTED'),
    [selected, setSelected] = useState(null),
    [locked, setLocked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    api
      .list({ cursor, userId, state, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.code || 'NETWORK_ERROR');
      });
    return () => controller.abort();
  }, [api, cursor, userId, state, revision]);
  const active = data?.items.find((r) => r.userId === selected),
    summary = data?.summary;
  const labels = { SUBMITTED: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối' };
  return (
    <section className="ops-workspace">
      <header>
        <div>
          <h1>Duyệt hồ sơ công khai</h1>
          <p className="ops-muted">Kiểm tra nội dung giới thiệu trước khi công khai với khách hàng.</p>
        </div>
        <button disabled={locked} onClick={() => setRevision((v) => v + 1)}>
          Tải lại
        </button>
      </header>
      {userId && (
        <p>
          <Link to={'/staff/sitters/' + userId}>Hồ sơ người chăm sóc</Link> ·{' '}
          <Link to="/staff/sitter-profiles">Tất cả hồ sơ chờ duyệt</Link>
        </p>
      )}
      <OperationsMetrics
        items={[
          { label: 'Tổng hồ sơ đã gửi', value: summary?.total },
          { label: 'Chờ duyệt', value: summary?.SUBMITTED },
          { label: 'Đã duyệt', value: summary?.APPROVED },
          { label: 'Từ chối', value: summary?.REJECTED },
        ]}
        caption="Số liệu từ các bản hồ sơ công khai hiện có; không phải số hồ sơ ứng tuyển."
      />
      <section className="ops-section">
        <header>
          <h2>Danh sách hồ sơ</h2>
          <label>
            Trạng thái{' '}
            <select
              aria-label="Trạng thái hồ sơ công khai"
              disabled={locked}
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setCursor(null);
                setPages([]);
                setSelected(null);
              }}
            >
              {Object.entries(labels).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </header>
        {error && <p role="alert">Chưa tải được hồ sơ ({error}).</p>}
        {!data && !error && <p role="status">Đang tải…</p>}
        <OperationsTable
          label="Hồ sơ công khai"
          rows={data?.items ?? []}
          rowKey={(r) => r.userId}
          empty={data ? 'Không có hồ sơ trong trạng thái này.' : 'Chưa có dữ liệu.'}
          columns={[
            {
              key: 'name',
              label: 'Người chăm sóc',
              render: (r) => (
                <>
                  <strong>{r.displayName ?? 'Người chăm sóc'}</strong>
                  <small title={r.userId}>…{r.userId.slice(-6)}</small>
                </>
              ),
            },
            {
              key: 'bio',
              label: 'Giới thiệu',
              render: (r) => <span>{r.bio.length > 130 ? r.bio.slice(0, 130) + '…' : r.bio}</span>,
            },
            { key: 'areas', label: 'Khu vực', render: (r) => r.areas.join(', ') },
            {
              key: 'updatedAt',
              label: 'Cập nhật',
              render: (r) => new Date(r.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            },
            {
              key: 'state',
              label: 'Trạng thái',
              render: (r) => (
                <OperationsBadge
                  tone={r.state === 'SUBMITTED' ? 'warning' : r.state === 'APPROVED' ? 'success' : 'danger'}
                >
                  {labels[r.state] ?? r.state}
                </OperationsBadge>
              ),
            },
            {
              key: 'action',
              label: 'Thao tác',
              render: (r) => (
                <button disabled={locked} onClick={() => setSelected(r.userId)}>
                  {r.state === 'SUBMITTED' ? 'Xem và duyệt' : 'Xem chi tiết'}
                </button>
              ),
            },
          ]}
        />
        {data && !data.items.length && state === 'SUBMITTED' && (
          <p className="ops-muted">Không có hồ sơ chờ duyệt.</p>
        )}
        <nav className="ops-toolbar" aria-label="Phân trang hồ sơ">
          <button
            disabled={locked || !pages.length}
            onClick={() => {
              setCursor(pages.at(-1));
              setPages((p) => p.slice(0, -1));
            }}
          >
            Trang trước
          </button>
          <span>Trang {pages.length + 1}</span>
          <button
            disabled={locked || !data?.nextCursor}
            onClick={() => {
              setPages((p) => [...p, cursor]);
              setCursor(data.nextCursor);
            }}
          >
            Trang tiếp
          </button>
        </nav>
      </section>
      {active && (
        <Dialog
          open
          title="Kiểm tra hồ sơ công khai"
          className="ops-dialog"
          dismissible={!locked}
          onClose={() => setSelected(null)}
        >
          <ProfileReview
            key={`${active.userId}:${active.version}`}
            row={active}
            api={api}
            onLock={setLocked}
            refresh={() => setRevision((v) => v + 1)}
          />
        </Dialog>
      )}
    </section>
  );
}
