import { useEffect, useRef, useState } from 'react';
import { pendingSettlementApi } from '../../services/settlement-api.js';
import './weekly-settlement.css';

const money = value => Number.isSafeInteger(value) && value >= 0
  ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value) : 'Chưa xác định';
export default function WeeklySettlementPage({ api = pendingSettlementApi }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const command = useRef(null);
  const withdrawals = useRef(new Map());
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null); setSelected([]);
    api.load({ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.code || 'NETWORK_ERROR'); });
    return () => controller.abort();
  }, [api, revision]);
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    const payload = JSON.stringify(selected.slice().sort());
    if (!command.current || command.current.payload !== payload) command.current = { payload, key: window.crypto.randomUUID() };
    try {
      await api.submit(JSON.parse(payload), command.current.key);
      command.current = null; setNotice('Đã ghi nhận yêu cầu; chưa chuyển tiền.'); setRevision(value => value + 1);
    } catch (failure) {
      setError(failure.code || 'NETWORK_ERROR');
      setNotice('Kết quả chưa được xác nhận. Gửi lại cùng lựa chọn sẽ dùng lại mã yêu cầu.');
    } finally { lock.current = false; setBusy(false); }
  }
  async function withdraw(row) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    const identity = JSON.stringify([row.id, row.version]);
    if (!withdrawals.current.has(identity)) withdrawals.current.set(identity, window.crypto.randomUUID());
    try {
      await api.withdraw(row.id, row.version, withdrawals.current.get(identity));
      withdrawals.current.delete(identity);
      setNotice('Đã rút yêu cầu. Lượt tất toán tuần này vẫn đã sử dụng.');
      setRevision(value => value + 1);
    } catch (failure) { setError(failure.code || 'NETWORK_ERROR'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="weekly-settlement" aria-busy={busy}>
    <h1>Tất toán tuần</h1>
    <p>Mỗi tuần Thứ Hai–Chủ Nhật, giờ Việt Nam, tối đa một yêu cầu. Từ chối hoặc rút vẫn tính quota.</p>
    {error && <p role="alert">{error === 'FORBIDDEN' ? 'Bạn không có quyền xem.' : error === 'INTEGRATION_PENDING'
      ? 'Đang chờ tích hợp sổ giao dịch.' : `Không thể xác nhận thao tác: ${error}`}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Đang tải…</p>}
    <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>Tải lại</button>
    {data && <>
      <p>Tuần bắt đầu {data.requestWeekKey} (Việt Nam)</p>
      <dl>{[['accrued', 'Đã ghi nhận'], ['pending', 'Chờ đủ điều kiện'], ['held', 'Tạm giữ'],
        ['available', 'Khả dụng'], ['reserved', 'Đang giữ'], ['paid', 'Đã trả']].map(([key, label]) =>
        <div key={key}><dt>{label}</dt><dd>{money(data.balances[key])}</dd></div>)}</dl>
      {!!data.decisionIds?.length && <p role="status">Chờ quyết định: {data.decisionIds.join(', ')}</p>}
      <fieldset disabled={busy || data.quotaUsed || !!data.decisionIds?.length}>
        <legend>Khoản kiếm tiền khả dụng</legend>
        {!data.earnings.length && <p>Chưa có khoản khả dụng.</p>}
        {data.earnings.map(earning => <label key={earning.id}>
          <input type="checkbox" disabled={!Number.isSafeInteger(earning.availableVnd) || earning.availableVnd <= 0}
            checked={selected.includes(earning.id)} onChange={event => {
            command.current = null;
            setSelected(ids => event.target.checked ? [...ids, earning.id] : ids.filter(id => id !== earning.id));
          }} /> <span>{earning.earningPeriodKey}: khả dụng {money(earning.availableVnd)}
            {earning.pendingVnd > 0 && ` · chờ đủ điều kiện ${money(earning.pendingVnd)}`}
            {earning.heldVnd > 0 && ` · tạm giữ ${money(earning.heldVnd)}`}
            {earning.reservedVnd > 0 && ` · đang giữ ${money(earning.reservedVnd)}`}
            {earning.paidVnd > 0 && ` · đã trả ${money(earning.paidVnd)}`}</span>
        </label>)}
      </fieldset>
      <button type="button" disabled={busy || !selected.length || data.quotaUsed || !!data.decisionIds?.length} onClick={submit}>Gửi yêu cầu tất toán</button>
      {data.quotaUsed && <p>Tuần này đã ghi nhận yêu cầu.</p>}
      <h2>Lịch sử yêu cầu</h2>
      {!data.requests.length && <p>Chưa có yêu cầu.</p>}
      <ul>{data.requests.map(row => <li key={row.id}>{row.requestWeekKey} · {money(row.amountVnd)} · {row.status}
        {row.status === 'SUBMITTED' && <button type="button" disabled={busy || !!data.decisionIds?.length}
          onClick={() => withdraw(row)}>Rút yêu cầu</button>}
      </li>)}</ul>
    </>}
  </section>;
}
