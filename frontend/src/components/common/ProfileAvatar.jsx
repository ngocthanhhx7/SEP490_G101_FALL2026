import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, RotateCw, Trash2 } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { avatarApi, avatarPath, AVATAR_CHANGED, createAvatarApi } from '../../services/avatar-api.js';
import { prepareAvatarImage } from '../../services/avatar-image.js';
import { Button, Dialog } from '../ui/index.js';
import './profile-avatar.css';

export function ProfileAvatar({ petId, label = 'Ảnh đại diện', fallback = 'PW', className = '', api = avatarApi, onImageError }) {
  const session = useSession({ optional: true }), [revision, setRevision] = useState(0);
  const path = avatarPath(petId), identity = session.user?.id;
  useEffect(() => {
    const refresh = event => { if (!event.detail?.path || event.detail.path === path) setRevision(value => value + 1); };
    window.addEventListener(AVATAR_CHANGED, refresh);
    return () => window.removeEventListener(AVATAR_CHANGED, refresh);
  }, [path]);
  return <AvatarImage key={`${identity}:${path}:${revision}`} identity={identity} path={path} label={label} fallback={fallback} className={className} api={api} onImageError={onImageError} />;
}
function AvatarImage({ identity, path, label, fallback, className, api, onImageError }) {
  const [photo, setPhoto] = useState(null), errorHandler = useRef(onImageError); errorHandler.current = onImageError;
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController(); let objectUrl;
    Promise.resolve().then(() => (api.content ?? avatarApi.content)(path, controller.signal)).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setPhoto(objectUrl);
    }).catch(error => { if (!controller.signal.aborted) errorHandler.current?.(error); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [identity, path, api]);
  return <span className={`pwc-profile-avatar ${className}`}>
    {photo ? <img src={photo} alt={label} onError={() => { setPhoto(null); errorHandler.current?.({ code: 'IMAGE_DECODE_FAILED' }); }} /> : <span aria-label={label}>{fallback}</span>}
  </span>;
}

export function AvatarEditor({ petId, label = 'Ảnh đại diện', fallback = 'PW', api: suppliedApi, onSaved, onBusyChange, prepareImage = prepareAvatarImage }) {
  const session = useSession({ optional: true });
  const api = useMemo(() => suppliedApi ?? createAvatarApi({ getCsrfToken: session.getCsrfToken ?? (() => null) }), [suppliedApi, session.getCsrfToken]);
  return <AvatarEditorContent key={`${session.user?.id}:${petId ?? 'me'}`} petId={petId} label={label} fallback={fallback} api={api} onSaved={onSaved} onBusyChange={onBusyChange} prepareImage={prepareImage} />;
}
function AvatarEditorContent({ petId, label, fallback, api, onSaved, onBusyChange, prepareImage }) {
  const path = avatarPath(petId), fileId = useId();
  const [meta, setMeta] = useState(null), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState(''), [selected, setSelected] = useState(null), [preview, setPreview] = useState(null), [deleting, setDeleting] = useState(false);
  const attempt = useRef(null), lock = useRef(false), active = useRef(true), abort = useRef(null), input = useRef(null), generation = useRef(0);
  const [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false);
  useEffect(() => { onBusyChange?.(busy || preparing || uncertain); return () => onBusyChange?.(false); }, [busy, preparing, uncertain, onBusyChange]);
  useEffect(() => {
    active.current = true; const controller = new AbortController();
    api.get(path, controller.signal).then(result => { if (active.current) setMeta(result.data); })
      .catch(() => { if (active.current && !controller.signal.aborted) setNotice('Chưa tải được thông tin ảnh. Bấm tải lại để tiếp tục.'); });
    return () => { active.current = false; generation.current++; controller.abort(); abort.current?.abort(); };
  }, [api, path]);
  useEffect(() => {
    if (!selected) { setPreview(null); return; }
    const url = URL.createObjectURL(selected.file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);
  const announce = () => window.dispatchEvent(new window.CustomEvent(AVATAR_CHANGED, { detail: { path } }));
  const clear = () => { generation.current++; setSelected(null); if (input.current) input.current.value = ''; };
  async function choose(file) {
    if (!file || lock.current || attempt.current) return;
    const current = ++generation.current; setPreparing(true); setNotice('');
    try { const normalized = await prepareImage(file); if (active.current && current === generation.current) setSelected({ file: normalized, name: file.name }); }
    catch { if (active.current && current === generation.current) setNotice('Chưa đọc được ảnh. Chọn tệp JPG/PNG tối đa 10 MB; ảnh quá lớn hoặc bị lỗi cần xuất lại từ thư viện ảnh.'); }
    finally { if (active.current && current === generation.current) setPreparing(false); }
  }
  async function reload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); const controller = new AbortController(); abort.current = controller;
    try {
      const result = await api.get(path, controller.signal); if (!active.current) return;
      setMeta(result.data); setConflict(false); announce();
      if (attempt.current && result.data.version === attempt.current.version) setNotice('Máy chủ chưa xác nhận thay đổi. Thử lại cùng yêu cầu để đối chiếu.');
      else { attempt.current = null; setUncertain(false); clear(); setNotice('Đã tải lại ảnh hiện tại.'); }
    } catch { if (active.current) setNotice('Chưa tải lại được ảnh. Vui lòng thử lại.'); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  async function save(remove = false) {
    if (lock.current || !meta || preparing || conflict) return;
    if (!attempt.current) {
      if (!remove && !selected?.file) return;
      if (!globalThis.crypto?.randomUUID) { setNotice('Trình duyệt chưa tạo được mã yêu cầu an toàn. Tải lại trang hoặc dùng trình duyệt được cập nhật.'); return; }
      attempt.current = { file: selected?.file, remove, version: meta.version, key: globalThis.crypto.randomUUID() };
    }
    lock.current = true; setBusy(true); setNotice(''); const controller = new AbortController(); abort.current = controller;
    try {
      const result = await api.save(path, attempt.current, controller.signal); if (!active.current) return;
      if (result.pending || result.data?.version !== attempt.current.version + 1 || result.data?.present !== !attempt.current.remove) throw new Error('Uncertain response');
      setMeta(result.data); attempt.current = null; setUncertain(false); clear(); setDeleting(false);
      setNotice(result.data.present ? 'Đã lưu ảnh đại diện.' : 'Đã xóa ảnh đại diện.'); announce(); onSaved?.();
    } catch (error) {
      if (!active.current) return;
      const unknown = !error.status || (error.status >= 200 && error.status < 300) || error.status >= 500 || [408, 425, 429].includes(error.status);
      setUncertain(unknown);
      if (!unknown) { attempt.current = null; setConflict(error.status === 409); }
      setNotice(unknown ? 'Chưa nhận xác nhận. Giữ nguyên ảnh và thử lại cùng yêu cầu, hoặc tải lại để đối chiếu.' : error.status === 409 ? 'Ảnh đã thay đổi ở nơi khác. Tải lại trước khi lưu tiếp.' : error.status === 401 ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để lưu ảnh.' : 'Chưa lưu được ảnh. Ảnh cũ vẫn được giữ; kiểm tra kết nối và thử lại.');
    } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  const imageError = useCallback(() => setNotice('Ảnh đã lưu nhưng chưa hiển thị được. Bấm tải lại ảnh để kiểm tra.'), []);
  const disabled = busy || preparing || uncertain;
  return <section className="pwc-avatar-editor" aria-label={label}>
    <div className="pwc-avatar-editor__preview">{preview ? <img src={preview} alt={`Xem trước ${label.toLowerCase()}`} /> : <ProfileAvatar petId={petId} label={label} fallback={fallback} api={api} onImageError={meta?.present ? imageError : undefined} />}
      <Camera size={19} aria-hidden="true" className="pwc-avatar-editor__camera" />
    </div>
    <div className="pwc-avatar-editor__content"><h2>{label}</h2><p>Chọn ảnh JPG hoặc PNG, tối đa 10 MB. Ảnh được cắt vuông ở giữa và thu gọn trước khi lưu.</p>
      <p className="pwc-avatar-editor__privacy">Ảnh được bảo vệ theo tài khoản; không có đường dẫn công khai.</p>
      <input className="pwc-avatar-editor__input" id={fileId} ref={input} type="file" tabIndex={-1} accept="image/jpeg,image/png" disabled={disabled || !meta} onChange={event => choose(event.target.files?.[0])} aria-label="Chọn hoặc thay ảnh" />
      <div className="pwc-avatar-editor__actions"><Button variant="secondary" disabled={disabled || !meta} onClick={() => input.current?.click()}><ImagePlus size={17} />{meta?.present ? 'Đổi ảnh' : 'Chọn ảnh'}</Button>
        {selected && !uncertain && <><Button disabled={disabled || conflict} onClick={() => save()}>Lưu ảnh</Button><Button variant="ghost" disabled={disabled} onClick={clear}>Hủy chọn</Button></>}
        {!selected && meta?.present && <Button variant="ghost" disabled={disabled} onClick={() => setDeleting(true)}><Trash2 size={16} />Xóa ảnh</Button>}
        <Button variant="ghost" disabled={busy || preparing} onClick={reload}><RotateCw size={16} />Tải lại ảnh</Button>
      </div>
      {selected && <p className="pwc-avatar-editor__filename">{selected.name} · ảnh xem trước chưa được lưu</p>}
      {!meta && !notice && <p role="status">Đang tải thông tin ảnh…</p>}
      {preparing && <p role="status">Đang xử lý ảnh để tải lên…</p>}{busy && <p role="status">Đang đối chiếu với máy chủ…</p>}
      {notice && <p role="status" className="pwc-avatar-editor__notice">{notice}</p>}
      {uncertain && !deleting && <Button disabled={busy} onClick={() => save()}>Thử lại cùng yêu cầu</Button>}
    </div>
    <Dialog open={deleting} title="Xóa ảnh đại diện?" intent="destructive" dismissible={!busy && !uncertain} onClose={() => setDeleting(false)}>
      {deleting && <><p>Ảnh đang dùng sẽ được gỡ khỏi hồ sơ. Bạn có thể chọn ảnh khác sau đó.</p><Button variant="danger" disabled={busy || uncertain} onClick={() => save(true)}>Xác nhận xóa ảnh</Button>
      {notice && <p role="status">{notice}</p>}{uncertain && <Button disabled={busy} onClick={() => save(true)}>Thử lại cùng yêu cầu</Button>}</>}
    </Dialog>
  </section>;
}
