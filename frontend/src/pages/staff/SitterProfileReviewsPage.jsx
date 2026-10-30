import { useEffect, useRef, useState } from 'react';
import '../sitter/sitter-public-profile.css';

function ProfileReview({ row, api, refresh }) {
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('APPROVE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const command = useRef(null);
  const lock = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    const body = { decision, reason, expectedVersion: row.version };
    const payload = JSON.stringify(body);
    if (command.current?.payload !== payload) command.current = { payload, key: window.crypto.randomUUID() };
    lock.current = true; setBusy(true); setError('');
    try { await api.review(row.userId, body, command.current.key); refresh(); }
    catch (failure) { setError(failure.code || 'NETWORK_ERROR'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <article aria-label={`Hồ sơ ${row.userId}`}>
    <h2>{row.userId}</h2><p className="profile-bio">{row.bio}</p><p>{row.areas.join(', ')}</p>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label>Quyết định<select value={decision} onChange={event => setDecision(event.target.value)}>
        <option value="APPROVE">Duyệt</option><option value="REJECT">Từ chối</option>
      </select></label>
      <label>Lý do<textarea required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button type="submit">{busy ? 'Đang lưu…' : 'Lưu quyết định'}</button>
    </fieldset></form>
  </article>;
}

export function SitterProfileReviewsPage({ api }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    api.list({ cursor, signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.code || 'NETWORK_ERROR'); });
    return () => controller.abort();
  }, [api, cursor, revision]);
  return <section className="sitter-public-profile"><h1>Duyệt hồ sơ công khai</h1>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Đang tải…</p>}
    <button type="button" onClick={() => setRevision(value => value + 1)}>Tải lại</button>
    {data && <>
      {!data.items.length && <p>Không có hồ sơ chờ duyệt.</p>}
      {data.items.map(row => <ProfileReview key={`${row.userId}:${row.version}`} row={row} api={api} refresh={() => setRevision(value => value + 1)} />)}
      {data.nextCursor && <button type="button" onClick={() => setCursor(data.nextCursor)}>Trang tiếp</button>}
      {cursor && <button type="button" onClick={() => setCursor(null)}>Trang đầu</button>}
    </>}
  </section>;
}
