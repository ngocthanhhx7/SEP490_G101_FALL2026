import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Dialog, Input, Notice, Select } from '../../components/ui/index.js';
import { createPetOperationKey, petApi } from '../../services/pet-api.js';
import './pet-list.css';

const SPECIES_LABELS = { DOG: 'Chó', CAT: 'Mèo' };

function messageForError(error, action) {
  if (error?.code === 'CSRF_NOT_READY') {
    return 'Phiên Customer và mã bảo vệ yêu cầu chưa được nối với máy chủ. Chưa có thay đổi nào được gửi.';
  }
  if (error?.code === 'IDEMPOTENCY_KEY_UNAVAILABLE') {
    return 'Trình duyệt chưa tạo được mã an toàn cho yêu cầu. Chưa có thay đổi nào được gửi.';
  }
  if (error?.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử lại.';
  if (error?.status === 403) return 'Tài khoản hiện không được phép xem hoặc thay đổi hồ sơ này.';
  if (error?.status === 404) return 'Hồ sơ không còn khả dụng. Hãy tải lại danh sách.';
  if (error?.status === 409 || ['VERSION_CONFLICT', 'INVALID_STATE'].includes(error?.code)) {
    return 'Hồ sơ đã thay đổi ở nơi khác. Tải lại danh sách để xem trạng thái mới nhất.';
  }
  if (error?.status === 422 || error?.code === 'VALIDATION_FAILED') {
    return action === 'create'
      ? 'Máy chủ chưa chấp nhận tên hoặc loài. Kiểm tra lại hai thông tin rồi thử lại.'
      : 'Máy chủ chưa thể lưu trữ hồ sơ này. Tải lại danh sách rồi thử lại.';
  }
  return action === 'load'
    ? 'Chưa tải được danh sách. Kiểm tra kết nối rồi thử lại.'
    : 'Chưa hoàn tất yêu cầu. Hãy thử lại sau.';
}

function isUnknownOutcome(error) {
  if (['CSRF_NOT_READY', 'IDEMPOTENCY_KEY_UNAVAILABLE', 'INVALID_RESOURCE_ID',
    'EXPECTED_VERSION_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED'].includes(error?.code)) return false;
  if (['NETWORK_ERROR', 'TIMEOUT'].includes(error?.code)) return true;
  const status = error?.status;
  return Number.isInteger(status)
    && ((status >= 200 && status < 300) || status === 408 || status === 425 || status === 429 || status >= 500);
}

function validateDraft(draft) {
  const errors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Nhập tên thú cưng.';
  else if (/[\u0000-\u001f\u007f]/.test(name)) errors.name = 'Tên chứa ký tự không hợp lệ.';
  if (!SPECIES_LABELS[draft.species]) errors.species = 'Chọn chó hoặc mèo.';
  return { name, errors };
}

function mergePets(existing, incoming) {
  const byId = new Map(existing.map(pet => [pet.id, pet]));
  incoming.forEach(pet => byId.set(pet.id, pet));
  return [...byId.values()];
}

function petSpeciesLabel(species) {
  return SPECIES_LABELS[species] || 'Loài chưa xác định';
}

export function PetListPage({ api = petApi, detailsPath = (petId) => `/account/pets/${petId}` }) {
  const loadPets = useCallback(({ signal }) => api.listPets({ signal }), [api]);
  const resource = useApiResource(loadPets);
  const [morePets, setMorePets] = useState([]);
  const [pageMeta, setPageMeta] = useState(null);
  const [moreState, setMoreState] = useState('idle');
  const [moreError, setMoreError] = useState('');
  const moreController = useRef(null);
  const nameInput = useRef(null);
  const speciesInput = useRef(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', species: '' });
  const [draftErrors, setDraftErrors] = useState({});
  const [createState, setCreateState] = useState('idle');
  const createAttempt = useRef(null);
  const [archivePet, setArchivePet] = useState(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveState, setArchiveState] = useState('idle');
  const [archiveError, setArchiveError] = useState('');
  const archiveAttempt = useRef(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (resource.status !== 'loading') return;
    setMorePets([]);
    setPageMeta(null);
    setMoreState('idle');
    setMoreError('');
  }, [resource.status]);

  useEffect(() => () => moreController.current?.abort(), []);

  useEffect(() => {
    if (createOpen) nameInput.current?.focus();
  }, [createOpen]);

  const visiblePets = mergePets(resource.data || [], morePets);
  const nextCursor = pageMeta ? pageMeta.nextCursor : resource.meta?.nextCursor;
  const mutationPending = ['saving', 'pending'].includes(createState)
    || ['saving', 'pending'].includes(archiveState);

  function showError(error, action) {
    const forbidden = error?.status === 403;
    setFeedback({
      state: forbidden ? 'forbidden' : 'error',
      title: forbidden ? 'Không thể tiếp tục' : 'Chưa hoàn tất',
      message: messageForError(error, action),
    });
  }

  async function loadMore() {
    if (!nextCursor || moreState === 'loading') return;
    moreController.current?.abort();
    const controller = new AbortController();
    moreController.current = controller;
    setMoreState('loading');
    setMoreError('');
    try {
      const result = await api.listPets({ cursor: nextCursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.pending) {
        setMoreState('pending');
        setMoreError('Máy chủ chưa xác nhận trang tiếp theo. Danh sách hiện có vẫn được giữ nguyên.');
        return;
      }
      setMorePets(current => mergePets(current, result.data));
      setPageMeta({ nextCursor: result.meta?.nextCursor ?? null });
      setMoreState('idle');
    } catch (error) {
      if (controller.signal.aborted) return;
      setMoreState(error?.status === 403 ? 'forbidden' : 'error');
      setMoreError(messageForError(error, 'load'));
    }
  }

  function openCreateForm() {
    setCreateOpen(true);
    setFeedback(null);
  }

  function closeCreateForm() {
    if (createState === 'pending' || createState === 'saving') return;
    createAttempt.current = null;
    setCreateOpen(false);
    setDraft({ name: '', species: '' });
    setDraftErrors({});
  }

  async function sendCreateAttempt(attempt) {
    if (!attempt || createState === 'saving') return;
    setCreateState('saving');
    setFeedback(null);
    try {
      const result = await api.createPet({ ...attempt.payload, idempotencyKey: attempt.idempotencyKey });
      if (result.pending) {
        setCreateState('pending');
        setFeedback(null);
        return;
      }
      createAttempt.current = null;
      setCreateState('idle');
      setCreateOpen(false);
      setDraft({ name: '', species: '' });
      setDraftErrors({});
      setFeedback({ state: 'success', title: 'Đã tạo hồ sơ', message: 'Máy chủ đã xác nhận hồ sơ thú cưng.' });
      resource.retry();
    } catch (error) {
      if (isUnknownOutcome(error)) {
        setCreateState('pending');
        setFeedback(null);
        return;
      }
      createAttempt.current = null;
      setCreateState('idle');
      showError(error, 'create');
    }
  }

  async function submitCreate(event) {
    event.preventDefault();
    if (createState === 'pending' || createState === 'saving') return;
    const validated = validateDraft(draft);
    setDraftErrors(validated.errors);
    if (Object.keys(validated.errors).length) {
      setFeedback(null);
      if (validated.errors.name) nameInput.current?.focus();
      else speciesInput.current?.focus();
      return;
    }
    let idempotencyKey;
    try {
      idempotencyKey = createPetOperationKey();
    } catch (error) {
      showError(error, 'create');
      return;
    }
    const attempt = { idempotencyKey, payload: { name: validated.name, species: draft.species } };
    createAttempt.current = attempt;
    await sendCreateAttempt(attempt);
  }

  function retryCreate() {
    if (createState === 'pending') sendCreateAttempt(createAttempt.current);
  }

  function openArchive(pet) {
    if (mutationPending || pet.state !== 'ACTIVE') return;
    archiveAttempt.current = null;
    setArchivePet(pet);
    setArchiveDialogOpen(true);
    setArchiveState('idle');
    setArchiveError('');
    setFeedback(null);
  }

  function closeArchive() {
    setArchiveDialogOpen(false);
    if (archiveState === 'pending' || archiveState === 'saving') return;
    setArchivePet(null);
    archiveAttempt.current = null;
    setArchiveError('');
    setArchiveState('idle');
  }

  async function sendArchiveAttempt(attempt) {
    if (!attempt || archiveState === 'saving') return;
    setArchiveState('saving');
    setArchiveError('');
    setFeedback(null);
    try {
      const result = await api.archivePet({ ...attempt, petId: archivePet.id });
      if (result.pending) {
        setArchiveState('pending');
        setArchiveError('Máy chủ chưa xác nhận việc lưu trữ. Có thể kiểm tra lại bằng chính yêu cầu này.');
        return;
      }
      archiveAttempt.current = null;
      setArchiveState('idle');
      setArchiveDialogOpen(false);
      setArchivePet(null);
      setFeedback({ state: 'success', title: 'Đã lưu trữ hồ sơ',
        message: 'Máy chủ đã xác nhận. Lịch sử đặt dịch vụ và snapshot trước đây vẫn được giữ nguyên.' });
      resource.retry();
    } catch (error) {
      if (isUnknownOutcome(error)) {
        setArchiveState('pending');
        setArchiveError('Chưa nhận được xác nhận. Hồ sơ có thể đã được lưu trữ; chỉ kiểm tra lại bằng cùng mã thao tác.');
        return;
      }
      archiveAttempt.current = null;
      setArchiveState(error?.status === 403 ? 'forbidden' : 'error');
      setArchiveError(messageForError(error, 'archive'));
      showError(error, 'archive');
    }
  }

  async function confirmArchive() {
    if (!archivePet || archiveState === 'saving' || archiveState === 'pending') return;
    let idempotencyKey;
    try {
      idempotencyKey = createPetOperationKey();
    } catch (error) {
      setArchiveState('error');
      setArchiveError(messageForError(error, 'archive'));
      return;
    }
    const attempt = { idempotencyKey, expectedVersion: archivePet.version };
    archiveAttempt.current = attempt;
    await sendArchiveAttempt(attempt);
  }

  function retryArchive() {
    if (archiveState === 'pending') sendArchiveAttempt(archiveAttempt.current);
  }

  const archiveNotice = archiveState === 'pending' && !archiveDialogOpen
    ? <Notice state="pending" title="Đang chờ xác nhận lưu trữ">
      <p>{archiveError}</p>
      <div className="pet-list__notice-action">
        <Button variant="secondary" onClick={retryArchive}>Kiểm tra bằng cùng yêu cầu</Button>
      </div>
    </Notice> : null;

  return <section className="pet-list" aria-labelledby="pet-list-title">
    <header className="pet-list__header">
      <div>
        <p className="pet-list__eyebrow">Paw World Care · Khách hàng</p>
        <h1 id="pet-list-title">Thú cưng của tôi</h1>
        <p className="pet-list__intro">Quản lý hồ sơ chó và mèo của bạn. Bạn có thể bắt đầu chỉ với tên và loài.</p>
      </div>
      <Button onClick={openCreateForm} disabled={mutationPending}>Thêm thú cưng</Button>
    </header>

    <p className="pet-list__safety-note">
      Thông tin chăm sóc hoặc sức khỏe chưa biết/chưa cung cấp không có nghĩa là không có dị ứng, thuốc hay rủi ro. Hãy xác nhận thông tin phù hợp trước từng dịch vụ.
    </p>

    {feedback && <Notice state={feedback.state} title={feedback.title}><p>{feedback.message}</p></Notice>}
    {archiveNotice}

    {createOpen && <section className="pet-list__create" aria-labelledby="pet-create-title">
      <div className="pet-list__create-heading">
        <div>
          <h2 id="pet-create-title">Tạo hồ sơ thú cưng</h2>
          <p>Chỉ cần tên và loài. Các thông tin khác có thể bổ sung sau.</p>
        </div>
        <Button variant="ghost" onClick={closeCreateForm} disabled={createState === 'saving' || createState === 'pending'}>
          Đóng biểu mẫu
        </Button>
      </div>
      <form className="pet-list__form" noValidate onSubmit={submitCreate} aria-busy={createState === 'saving'}>
        <Input ref={nameInput} label="Tên thú cưng" name="name" autoComplete="off" required
          value={draft.name} error={draftErrors.name} disabled={createState === 'saving' || createState === 'pending'}
          onChange={event => { setDraft(current => ({ ...current, name: event.target.value })); setDraftErrors(current => ({ ...current, name: '' })); }} />
        <Select ref={speciesInput} label="Loài" name="species" required value={draft.species} error={draftErrors.species}
          disabled={createState === 'saving' || createState === 'pending'}
          onChange={event => { setDraft(current => ({ ...current, species: event.target.value })); setDraftErrors(current => ({ ...current, species: '' })); }}>
          <option value="">Chọn loài</option>
          <option value="DOG">Chó</option>
          <option value="CAT">Mèo</option>
        </Select>
        <p className="pet-list__form-hint">Ảnh, giống, tuổi, cân nặng, sức khỏe và vaccine đều không bắt buộc để tạo hồ sơ.</p>
        {createState === 'pending' && <Notice state="pending" title="Đang chờ máy chủ xác nhận">
          <p>Hồ sơ chưa được xác nhận. Khi gửi lại, ứng dụng sẽ dùng đúng nội dung và mã thao tác trước đó.</p>
          <div className="pet-list__notice-action">
            <Button variant="secondary" onClick={retryCreate}>Kiểm tra bằng cùng yêu cầu</Button>
          </div>
        </Notice>}
        <div className="pet-list__form-actions">
          <Button type="submit" loading={createState === 'saving'} loadingLabel="Đang lưu…"
            disabled={createState === 'pending'}>Lưu hồ sơ</Button>
          {createState !== 'pending' && <Button variant="secondary" onClick={closeCreateForm} disabled={createState === 'saving'}>
            Hủy
          </Button>}
        </div>
      </form>
    </section>}

    <section className="pet-list__results" aria-label="Danh sách hồ sơ thú cưng"
      aria-busy={resource.status === 'loading' || moreState === 'loading'}>
      {resource.status === 'loading' && <Notice state="loading" title="Đang tải hồ sơ">
        <p>Đang tải danh sách thú cưng từ máy chủ.</p>
      </Notice>}
      {resource.status === 'empty' && <Notice state="empty" title="Bạn chưa có hồ sơ thú cưng">
        <p>Tạo hồ sơ đầu tiên bằng tên và loài. Trường còn thiếu không được xem là thông tin an toàn.</p>
        <div className="pet-list__notice-action"><Button onClick={openCreateForm} disabled={mutationPending}>Thêm thú cưng đầu tiên</Button></div>
      </Notice>}
      {resource.status === 'error' && <Notice state="error" title="Chưa tải được danh sách">
        <p>{messageForError({ code: resource.code }, 'load')}</p>
        <div className="pet-list__notice-action"><Button variant="secondary" onClick={resource.retry}>Tải lại</Button></div>
      </Notice>}
      {resource.status === 'forbidden' && <Notice state="forbidden" title="Không có quyền xem danh sách này">
        <p>Máy chủ từ chối yêu cầu. Danh sách hồ sơ không được hiển thị.</p>
        <div className="pet-list__notice-action"><Button variant="secondary" onClick={resource.retry}>Kiểm tra lại quyền truy cập</Button></div>
      </Notice>}
      {resource.status === 'pending' && <Notice state="pending" title="Máy chủ chưa xác nhận danh sách">
        <p>Chưa thể xác định có hồ sơ nào hay không. Tải lại để kiểm tra trạng thái hiện tại.</p>
        <div className="pet-list__notice-action"><Button variant="secondary" onClick={resource.retry}>Tải lại danh sách</Button></div>
      </Notice>}
      {resource.status === 'success' && <>
        <ul className="pet-list__grid">
          {visiblePets.map(pet => <li key={pet.id}>
            <article className="pet-card" aria-labelledby={`pet-name-${pet.id}`}>
              <div className="pet-card__topline">
                <span className="pet-card__species">{petSpeciesLabel(pet.species)}</span>
                <span className={`pet-card__state pet-card__state--${pet.state.toLowerCase()}`}>
                  {pet.state === 'ARCHIVED' ? 'Đã lưu trữ' : 'Đang hoạt động'}
                </span>
              </div>
              <h2 id={`pet-name-${pet.id}`}>{pet.name}</h2>
              <div className="pet-card__actions">
                <Link className="pet-card__details" to={detailsPath(pet.id)}>Xem hồ sơ</Link>
                {pet.state === 'ACTIVE' && <Button variant="secondary" onClick={() => openArchive(pet)}
                  disabled={mutationPending}>Lưu trữ</Button>}
              </div>
            </article>
          </li>)}
        </ul>
        {moreError && <Notice state={moreState === 'forbidden' ? 'forbidden' : moreState === 'pending' ? 'pending' : 'error'}
          title={moreState === 'pending' ? 'Đang chờ trang tiếp theo' : 'Chưa tải được trang tiếp theo'}>
          <p>{moreError}</p>
          <div className="pet-list__notice-action">
            <Button variant="secondary" onClick={loadMore}>
              {moreState === 'pending' ? 'Kiểm tra trang tiếp theo' : 'Thử tải lại'}
            </Button>
          </div>
        </Notice>}
        {nextCursor !== null && nextCursor !== undefined && <div className="pet-list__load-more">
          <Button variant="secondary" loading={moreState === 'loading'} loadingLabel="Đang tải…"
            disabled={moreState === 'pending'} onClick={loadMore}>Tải thêm hồ sơ</Button>
        </div>}
      </>}
    </section>

    <Dialog open={archiveDialogOpen} onClose={closeArchive} title="Lưu trữ hồ sơ thú cưng?"
      description={archivePet ? `Hồ sơ ${archivePet.name} sẽ được lưu trữ khỏi danh sách đang hoạt động. Dữ liệu lịch sử và snapshot đã xác nhận được giữ nguyên.` : undefined}
      intent="destructive">
      {archiveError && <Notice state={archiveState === 'pending' ? 'pending' : archiveState === 'forbidden' ? 'forbidden' : 'error'}
        title={archiveState === 'pending' ? 'Đang chờ máy chủ xác nhận' : 'Chưa lưu trữ được hồ sơ'}>
        <p>{archiveError}</p>
      </Notice>}
      <div className="pet-list__form-actions">
        <Button variant="secondary" onClick={closeArchive} disabled={archiveState === 'saving'}>Để sau</Button>
        {archiveState === 'pending'
          ? <Button variant="danger" onClick={retryArchive}>Kiểm tra bằng cùng yêu cầu</Button>
          : <Button variant="danger" loading={archiveState === 'saving'} loadingLabel="Đang lưu trữ…"
            onClick={confirmArchive}>Xác nhận lưu trữ</Button>}
      </div>
    </Dialog>
  </section>;
}
