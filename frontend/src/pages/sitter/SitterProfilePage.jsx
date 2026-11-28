import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Camera, Pencil, Star } from 'lucide-react';
import { ProfileAvatar } from '../../components/common/ProfileAvatar.jsx';
import { Button, Dialog, Notice } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { AVATAR_CHANGED, avatarPath, createAvatarApi } from '../../services/avatar-api.js';
import { prepareAvatarImage } from '../../services/avatar-image.js';
import { createSitterPublicProfileApi } from '../../services/sitter-public-profile-api.js';
import { ProjectionPage } from '../dashboards/ProjectionPage.jsx';
import './sitter-profile.css';

const REQUIRED_MSG01 = 'Trường này là bắt buộc.';
const SAVED_MSG51 = 'Thay đổi của bạn đã được lưu.';
const FIXED_NOTE = 'Tên, số điện thoại và khu vực phục vụ không sửa ở đây; số buổi đã làm và điểm đánh giá do hệ thống tính.';
const monthFormatter = new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
const ratingFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

function initialsOf(name) {
  return name?.trim().split(/\s+/u).slice(-2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('vi') || 'PW';
}

function startedMonth(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? monthFormatter.format(new Date(parsed)) : null;
}

function EditSitterProfileDialog({ open, profile, selfApi, avatarApi, prepareImage, onClose, onSaved }) {
  const fileInputId = useId();
  const [bio, setBio] = useState(profile.bio ?? '');
  const [experience, setExperience] = useState(profile.experience ?? '');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const lock = useRef(false);
  const command = useRef(null);

  useEffect(() => {
    if (!selectedPhoto) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedPhoto.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedPhoto]);

  async function choosePhoto(event) {
    const file = event.target.files?.[0];
    if (!file || lock.current) return;
    setPreparing(true);
    setPhotoError('');
    try {
      const normalized = await prepareImage(file);
      setSelectedPhoto({ file: normalized, name: file.name });
    } catch {
      setPhotoError('Chưa đọc được ảnh. Chọn tệp JPG hoặc PNG tối đa 10 MB.');
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (lock.current || preparing) return;
    const trimmedBio = bio.trim();
    const trimmedExperience = experience.trim();
    const nextErrors = {};
    if (!trimmedBio) nextErrors.bio = REQUIRED_MSG01;
    if (!trimmedExperience) nextErrors.experience = REQUIRED_MSG01;
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError('');
      return;
    }
    lock.current = true;
    setBusy(true);
    setFieldErrors({});
    setError('');
    setPhotoError('');
    try {
      if (selectedPhoto?.file) {
        const path = avatarPath();
        const metaResult = await avatarApi.get(path);
        const version = metaResult?.data?.version ?? 0;
        const avatarKey = globalThis.crypto.randomUUID();
        await avatarApi.save(path, { file: selectedPhoto.file, remove: false, version, key: avatarKey });
        window.dispatchEvent(new window.CustomEvent(AVATAR_CHANGED, { detail: { path } }));
      }
      const body = {
        bio: trimmedBio,
        experience: trimmedExperience,
        expectedVersion: profile.version ?? 0
      };
      const fingerprint = JSON.stringify(body);
      if (command.current?.fingerprint !== fingerprint) {
        command.current = { fingerprint, key: globalThis.crypto.randomUUID() };
      }
      const saved = await selfApi.saveSelfProfile(body, command.current.key);
      command.current = null;
      onSaved(saved?.profile ?? { ...profile, bio: trimmedBio, experience: trimmedExperience, version: (profile.version ?? 0) + 1 });
    } catch (failure) {
      if (failure?.fieldErrors && Object.keys(failure.fieldErrors).length > 0) {
        setFieldErrors(failure.fieldErrors);
      } else if (failure?.code === 'VERSION_CONFLICT') {
        setError('Hồ sơ đã thay đổi ở nơi khác. Đóng hộp thoại và tải lại trước khi lưu tiếp.');
      } else {
        setError('Chưa lưu được thay đổi. Vui lòng thử lại.');
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Cập nhật hồ sơ người chăm sóc"
      className="sitter-profile-dialog"
      dismissible={!busy && !preparing}
      onClose={onClose}
    >
      <form className="sitter-profile-form" onSubmit={submit} noValidate aria-busy={busy || undefined}>
        <div className="sitter-profile-form__avatar">
          <div className="sitter-profile-form__avatar-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="Xem trước ảnh đại diện" />
            ) : (
              <ProfileAvatar fallback={initialsOf(profile.displayName)} api={avatarApi} />
            )}
          </div>
          <div className="sitter-profile-form__avatar-controls">
            <input
              id={fileInputId}
              ref={fileRef}
              className="sitter-profile-form__file"
              type="file"
              accept="image/jpeg,image/png"
              aria-label="Đổi ảnh"
              disabled={busy || preparing}
              onChange={choosePhoto}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy || preparing}
              onClick={() => fileRef.current?.click()}
            >
              <Camera size={16} aria-hidden="true" />
              Đổi ảnh
            </Button>
            {selectedPhoto && <p className="sitter-profile-form__filename">{selectedPhoto.name}</p>}
            {preparing && <p role="status">Đang xử lý ảnh…</p>}
            {photoError && <p className="sitter-profile-form__error" role="alert">{photoError}</p>}
          </div>
        </div>

        <label className="sitter-profile-form__field" htmlFor="sitter-profile-bio">
          <span>Giới thiệu <b aria-hidden="true">*</b></span>
          <textarea
            id="sitter-profile-bio"
            rows={4}
            maxLength={1000}
            required
            disabled={busy}
            value={bio}
            aria-invalid={Boolean(fieldErrors.bio) || undefined}
            aria-describedby={fieldErrors.bio ? 'sitter-profile-bio-error' : undefined}
            onChange={event => {
              setBio(event.target.value);
              if (fieldErrors.bio) setFieldErrors(prev => ({ ...prev, bio: undefined }));
            }}
          />
          {fieldErrors.bio && (
            <p id="sitter-profile-bio-error" className="sitter-profile-form__error" role="alert">
              {fieldErrors.bio}
            </p>
          )}
        </label>

        <label className="sitter-profile-form__field" htmlFor="sitter-profile-experience">
          <span>Kinh nghiệm <b aria-hidden="true">*</b></span>
          <textarea
            id="sitter-profile-experience"
            rows={4}
            maxLength={2000}
            required
            disabled={busy}
            value={experience}
            aria-invalid={Boolean(fieldErrors.experience) || undefined}
            aria-describedby={fieldErrors.experience ? 'sitter-profile-experience-error' : undefined}
            onChange={event => {
              setExperience(event.target.value);
              if (fieldErrors.experience) setFieldErrors(prev => ({ ...prev, experience: undefined }));
            }}
          />
          {fieldErrors.experience && (
            <p id="sitter-profile-experience-error" className="sitter-profile-form__error" role="alert">
              {fieldErrors.experience}
            </p>
          )}
        </label>

        <p className="sitter-profile-form__note">{FIXED_NOTE}</p>
        {error && <p className="sitter-profile-form__error" role="alert">{error}</p>}

        <div className="sitter-profile-form__actions">
          <Button type="button" variant="secondary" disabled={busy || preparing} onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" loading={busy} loadingLabel="Đang lưu…" disabled={preparing}>
            Lưu hồ sơ
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SelfSitterProfileWorkspace({ selfApi: suppliedSelfApi, avatarApi: suppliedAvatarApi, prepareImage = prepareAvatarImage }) {
  const session = useSession();
  const selfApi = useMemo(
    () => suppliedSelfApi ?? createSitterPublicProfileApi(createApiClient({ getCsrfToken: session.getCsrfToken })),
    [suppliedSelfApi, session.getCsrfToken]
  );
  const avatarApi = useMemo(
    () => suppliedAvatarApi ?? createAvatarApi({ getCsrfToken: session.getCsrfToken }),
    [suppliedAvatarApi, session.getCsrfToken]
  );
  const load = useCallback(async ({ signal }) => ({ data: (await selfApi.selfProfile({ signal })).profile }), [selfApi]);
  const resource = useApiResource(load);
  const [savedProfile, setSavedProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState('');

  if (session.status === 'loading') return <Notice state="loading" title="Đang kiểm tra phiên" />;
  if (session.status === 'pending') return <Notice state="pending" title="Đang chờ kết nối phiên" />;
  if (session.status !== 'authenticated' || !session.user?.roles?.includes('PET_SITTER')) {
    return <Notice state="forbidden" title="Bạn không có quyền xem dữ liệu này" />;
  }

  const profile = savedProfile ?? resource.data;
  const started = startedMonth(profile?.startedAt);

  return (
    <section className="sitter-self-profile" aria-labelledby="sitter-self-profile-title">
      <header className="sitter-self-profile__header">
        <div>
          <h1 id="sitter-self-profile-title" data-duplicate-title>Hồ sơ người chăm sóc</h1>
          <p>Thông tin giới thiệu và kinh nghiệm hiển thị với khách hàng.</p>
        </div>
        {profile && (
          <Button type="button" onClick={() => { setToast(''); setEditing(true); }}>
            <Pencil size={16} aria-hidden="true" />
            Sửa hồ sơ
          </Button>
        )}
      </header>

      {toast && <Notice state="success" title={toast} />}
      {resource.status === 'loading' && !profile && <Notice state="loading" title="Đang tải hồ sơ người chăm sóc" />}
      {['error', 'forbidden', 'pending'].includes(resource.status) && !profile && (
        <Notice
          state={resource.status}
          title="Chưa tải được hồ sơ người chăm sóc"
          action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}
        />
      )}

      {profile && (
        <div className="sitter-self-profile__card">
          <div className="sitter-self-profile__identity">
            <ProfileAvatar fallback={initialsOf(profile.displayName)} api={avatarApi} className="sitter-self-profile__avatar" />
            <div>
              <h2>{profile.displayName}</h2>
              <p className="sitter-self-profile__meta">
                <span>
                  <Star size={15} aria-hidden="true" />{' '}
                  {Number.isFinite(profile.rating)
                    ? `${ratingFormatter.format(profile.rating)} / 5 (${profile.reviewCount} đánh giá)`
                    : 'Chưa có đánh giá'}
                </span>
                <span> · {profile.completedVisitsCount ?? 0} buổi đã làm</span>
                {started && <span> · Tham gia từ {started}</span>}
              </p>
              <p className="sitter-self-profile__areas">
                <strong>Khu vực phục vụ:</strong>{' '}
                {profile.areas?.length ? profile.areas.join(', ') : 'Chưa đăng ký khu vực phục vụ'}
              </p>
            </div>
          </div>

          <section className="sitter-self-profile__section">
            <h3>Giới thiệu</h3>
            <p>{profile.bio || 'Chưa có giới thiệu. Bấm Sửa hồ sơ để cập nhật.'}</p>
          </section>

          <section className="sitter-self-profile__section">
            <h3>Kinh nghiệm</h3>
            <p>{profile.experience || 'Chưa có mô tả kinh nghiệm. Bấm Sửa hồ sơ để cập nhật.'}</p>
          </section>

          <p className="sitter-self-profile__note">{FIXED_NOTE}</p>
        </div>
      )}

      {editing && profile && (
        <EditSitterProfileDialog
          key={`${profile.id}:${profile.version}`}
          open={editing}
          profile={profile}
          selfApi={selfApi}
          avatarApi={avatarApi}
          prepareImage={prepareImage}
          onClose={() => setEditing(false)}
          onSaved={nextProfile => {
            setSavedProfile(nextProfile);
            setEditing(false);
            setToast(SAVED_MSG51);
          }}
        />
      )}
    </section>
  );
}

export function SitterProfilePage({ api, selfApi, avatarApi, prepareImage } = {}) {
  if (api && !selfApi) {
    return (
      <ProjectionPage
        api={api}
        kind="sitter-profile"
        roles={['PET_SITTER']}
        title="Hồ sơ người chăm sóc"
        description="Thông tin giới thiệu và đánh giá được phép hiển thị."
        filterDates={false}
        searchable={false}
      />
    );
  }
  return <SelfSitterProfileWorkspace selfApi={selfApi} avatarApi={avatarApi} prepareImage={prepareImage} />;
}
