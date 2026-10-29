import { useEffect, useRef, useState } from 'react';
import './sitter-public-profile.css';

export function SitterPublicProfilePage({ api }) {
  const [profile, setProfile] = useState(undefined);
  const [bio, setBio] = useState('');
  const [areas, setAreas] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const command = useRef(null);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setProfile(undefined); setError(''); setNotice(''); command.current = null;
    api.own({ signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setProfile(result.profile); setBio(result.profile?.bio ?? ''); setAreas(result.profile?.areas.join('\n') ?? '');
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.code || 'NETWORK_ERROR'); });
    return () => controller.abort();
  }, [api]);
  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    const body = { bio, areas: areas.split('\n').map(area => area.trim()).filter(Boolean), expectedVersion: profile?.version ?? 0 };
    const payload = JSON.stringify(body);
    if (command.current?.payload !== payload) command.current = { payload, key: window.crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      setProfile(await api.submit(body, command.current.key)); command.current = null; setNotice('Đã gửi hồ sơ chờ duyệt.');
    } catch (failure) { setError(failure.code || 'NETWORK_ERROR'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="sitter-public-profile">
    <h1>Hồ sơ công khai</h1>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {profile === undefined ? !error && <p role="status">Đang tải…</p> : <form onSubmit={submit}>
      <p>Trạng thái: {profile?.state ?? 'CHƯA GỬI'}</p>
      {profile?.reason && <p>{profile.reason}</p>}
      <fieldset disabled={busy}>
        <label>Giới thiệu<textarea required maxLength={1000} rows={6} value={bio} onChange={event => setBio(event.target.value)} /></label>
        <label>Khu vực phục vụ<textarea required maxLength={3029} rows={4} value={areas} onChange={event => setAreas(event.target.value)} /></label>
        <button type="submit">{busy ? 'Đang gửi…' : 'Gửi duyệt'}</button>
      </fieldset>
    </form>}
  </section>;
}
