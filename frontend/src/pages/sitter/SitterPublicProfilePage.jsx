import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Notice } from '../../components/ui/index.js';
import './sitter-public-profile.css';

const states = { APPROVED: 'Đã duyệt', SUBMITTED: 'Đang chờ duyệt', REJECTED: 'Cần chỉnh sửa' };
const errorCopy = code => ({ VERSION_CONFLICT: 'Hồ sơ đã thay đổi ở nơi khác. Tải lại trạng thái trước khi gửi lại.', VALIDATION_FAILED: 'Kiểm tra phần giới thiệu và danh sách khu vực.', FORBIDDEN: 'Bạn không có quyền thay đổi hồ sơ này.' }[code] || 'Chưa xác nhận được kết quả. Hãy thử lại.');

export function SitterPublicProfilePage({ api }) {
  const [loadAttempt, setLoadAttempt] = useState(0);
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
  }, [api, loadAttempt]);
  const draft = { bio: bio.trim(), areas: areas.split('\n').map(area => area.trim()).filter(Boolean) };
  const changed = !profile || draft.bio !== profile.bio || JSON.stringify(draft.areas) !== JSON.stringify(profile.areas);
  const isPublished = profile?.state === 'APPROVED';
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !changed) return;
    const body = { ...draft, expectedVersion: profile?.version ?? 0 };
    const payload = JSON.stringify(body);
    if (isPublished && command.current?.payload !== payload && !window.confirm(
      'Hồ sơ hiện tại sẽ tạm ngừng hiển thị với khách hàng cho đến khi nội dung mới được duyệt. Bạn có muốn gửi duyệt lại?'
    )) return;
    if (command.current?.payload !== payload) command.current = { payload, key: window.crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const saved = await api.submit(body, command.current.key);
      setProfile(saved); setBio(saved.bio); setAreas(saved.areas.join('\n'));
      command.current = null; setNotice('Đã gửi hồ sơ chờ duyệt.');
    } catch (failure) { setError(failure.code || 'NETWORK_ERROR'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="sitter-public-profile">
    <header><h1 data-duplicate-title>Hồ sơ công khai</h1>
      <p>Cập nhật phần giới thiệu khách hàng có thể xem sau khi hồ sơ được duyệt.</p></header>
    {error && <Notice state="error" title={profile === undefined ? 'Chưa tải được hồ sơ' : 'Chưa gửi được hồ sơ'}
      action={profile === undefined ? <Button variant="secondary" onClick={() => setLoadAttempt(value => value + 1)}>Thử lại</Button>
        : error === 'VERSION_CONFLICT' ? <Button variant="secondary" onClick={() => {
          if (window.confirm('Tải lại hồ sơ sẽ thay nội dung chưa gửi bằng phiên bản mới nhất. Tiếp tục?')) setLoadAttempt(value => value + 1);
        }}>Tải phiên bản mới</Button> : undefined}>
      {errorCopy(error)}
    </Notice>}
    {notice && <Notice state="success" title={notice} />}
    {profile === undefined ? !error && <Notice state="loading" title="Đang tải hồ sơ" /> : <>
      <div className="sitter-public-profile__summary">
        <h2>Trạng thái hồ sơ</h2>
        <span data-state={profile?.state}>{states[profile?.state] ?? (profile?.state ? 'Đang cập nhật' : 'Chưa gửi duyệt')}</span>
        {profile?.reason && <p><strong>Phản hồi xét duyệt:</strong> {profile.reason}</p>}
        {profile?.state === 'APPROVED' && <Link to="/sitter/profile" state={{ mobileBack: '/sitter/public-profile' }}>Xem hồ sơ người chăm sóc</Link>}
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend>Nội dung hồ sơ</legend>
          <label>Giới thiệu<textarea required maxLength={1000} rows={5} value={bio} onChange={event => setBio(event.target.value)} /></label>
          <label>Khu vực phục vụ<textarea required maxLength={3029} rows={3} value={areas} onChange={event => setAreas(event.target.value)} aria-describedby="sitter-public-areas-help" /></label>
          <p id="sitter-public-areas-help">Nhập mỗi khu vực trên một dòng. Đây là phần giới thiệu hiển thị cho khách.</p>
          {isPublished && changed && <Notice state="warning" title="Hồ sơ sẽ tạm ngừng công bố">
            Khách hàng sẽ không thấy hồ sơ cho tới khi nội dung mới được duyệt.
          </Notice>}
          {changed && <Button type="submit" loading={busy} loadingLabel="Đang gửi…">{isPublished ? 'Gửi duyệt lại' : 'Gửi duyệt'}</Button>}
        </fieldset>
      </form>
    </>}
  </section>;
}
