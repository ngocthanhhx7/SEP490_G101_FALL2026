import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { avatarApi, avatarPath, AVATAR_CHANGED } from '../../services/avatar-api.js';
import './profile-avatar.css';

export function ProfileAvatar({ petId, label = 'Ảnh đại diện', fallback = 'PW', className = '' }) {
  const session = useSession({ optional: true }), [revision, setRevision] = useState(0);
  const path = avatarPath(petId), identity = session.user?.id;
  useEffect(() => {
    const refresh = () => { setRevision(value => value + 1); };
    window.addEventListener(AVATAR_CHANGED, refresh);
    return () => window.removeEventListener(AVATAR_CHANGED, refresh);
  }, []);
  return <AvatarImage key={`${identity}:${path}:${revision}`} identity={identity} path={path} revision={revision} label={label} fallback={fallback} className={className} />;
}
function AvatarImage({ identity, path, revision, label, fallback, className }) {
  const [failed, setFailed] = useState(false);
  return <span className={`pwc-profile-avatar ${className}`}>
    {!failed && identity ? <img src={`/api/v1${path}/content?revision=${revision}&owner=${encodeURIComponent(identity)}`} alt={label} onError={() => setFailed(true)} /> : <span aria-label={label}>{fallback}</span>}
  </span>;
}

export function AvatarEditor({ petId, label = 'Ảnh đại diện', fallback = 'PW', api = avatarApi, onSaved }) {
  const session = useSession({ optional: true });
  return <AvatarEditorContent key={`${session.user?.id}:${petId ?? 'me'}`} petId={petId} label={label} fallback={fallback} api={api} onSaved={onSaved} />;
}
function AvatarEditorContent({ petId, label, fallback, api, onSaved }) {
  const path = avatarPath(petId), [meta, setMeta] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const attempt = useRef(null), lock = useRef(false), active = useRef(true), abort = useRef(null), input = useRef(null);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    api.get(path, controller.signal).then(result => { if (active.current) setMeta(result.data); })
      .catch(() => { if (active.current && !controller.signal.aborted) setNotice('Chưa tải được ảnh. Bấm tải lại để tiếp tục.'); });
    return () => { active.current = false; controller.abort(); abort.current?.abort(); };
  }, [api, path]);
  async function reload() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const result = await api.get(path, controller.signal);
      if (!active.current) return;
      setMeta(result.data); attempt.current = null; setNotice(''); window.dispatchEvent(new window.Event(AVATAR_CHANGED));
    } catch { if (active.current) setNotice('Chưa tải được ảnh. Vui lòng thử lại.'); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  async function save(file, remove = false) {
    if (lock.current || !meta) return;
    if (!attempt.current) {
      if (!remove && (!file || !['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)) {
        setNotice('Chọn ảnh JPG/PNG tối đa 5 MB và 4 megapixel.'); return;
      }
      attempt.current = { file, remove, version: meta.version, key: globalThis.crypto.randomUUID() };
    }
    lock.current = true; setBusy(true); setNotice('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const result = await api.save(path, attempt.current, controller.signal);
      if (!active.current) return;
      if (result.pending || !Number.isSafeInteger(result.data?.version)) throw new Error('Uncertain response');
      setMeta(result.data); attempt.current = null; if (input.current) input.current.value = '';
      setNotice(result.data.present ? 'Đã lưu ảnh đại diện.' : 'Đã xóa ảnh đại diện.');
      window.dispatchEvent(new window.Event(AVATAR_CHANGED)); onSaved?.();
    } catch (error) {
      if (!active.current) return;
      const uncertain = !error.status || error.status >= 500 || error.status === 408 || error.status === 429;
      if (!uncertain) attempt.current = null;
      setNotice(uncertain ? 'Chưa nhận xác nhận. Thử lại cùng ảnh hoặc tải lại để đối chiếu.' : error.status === 409 ? 'Ảnh đã thay đổi. Tải lại trước khi tiếp tục.' : 'Chưa lưu được. Kiểm tra phiên và ảnh JPG/PNG tối đa 5 MB, 4 megapixel.');
    } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  return <section className="pwc-avatar-editor" aria-label={label}>
    <ProfileAvatar petId={petId} label={label} fallback={fallback} />
    <div><h2>{label}</h2><p>JPG/PNG · tối đa 5 MB, 4 megapixel. Ảnh chỉ hiển thị trong tài khoản của bạn.</p>
      <label className="pwc-avatar-editor__choose">Chọn hoặc thay ảnh<input ref={input} type="file" accept="image/jpeg,image/png" disabled={busy || !meta || !!attempt.current} onChange={event => save(event.target.files?.[0])} /></label>
      <button type="button" disabled={busy || !meta?.present || !!attempt.current} onClick={() => save(null, true)}>Xóa ảnh</button>
      {attempt.current && <button type="button" disabled={busy} onClick={() => save()}>Thử lại cùng yêu cầu</button>}
      <button type="button" disabled={busy} onClick={reload}>Tải lại ảnh</button>
      {busy && <p role="status">Đang lưu ảnh…</p>}{notice && <p role="status">{notice}</p>}
    </div>
  </section>;
}
