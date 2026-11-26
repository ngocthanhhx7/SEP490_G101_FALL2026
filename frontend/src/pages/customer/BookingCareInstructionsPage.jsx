import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button, Notice, Toast } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createVisitCareInstructionsApi } from '../../services/visit-care-instructions-api.js';
import './booking-care-instructions.css';

const MSG51_SAVED = 'Đã lưu thay đổi.';

function formatVietnamDateTime(value) {
  if (!value) return 'Chưa có';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh'
  }).format(parsed);
}

function buildDraftFromVisit(visit) {
  return {
    pets: (visit?.pets ?? []).map(pet => ({
      petId: pet.petId,
      name: pet.name,
      feeding: pet.feeding ?? '',
      medicine: pet.medicine ?? '',
      behavior: pet.behavior ?? ''
    })),
    tasks: (visit?.tasks ?? []).map(task => ({
      itemId: task.itemId ?? null,
      label: task.label ?? '',
      required: task.required === true,
      locked: task.locked === true
    })),
    homeAccessNote: visit?.homeAccessNote ?? '',
    applyToLater: Boolean(visit?.withinTwoHours)
  };
}

function errorMessage(error) {
  if (error?.code === 'CARE_INSTRUCTIONS_CUTOFF') {
    return 'Buổi này còn dưới 2 giờ trước khi bắt đầu và không còn buổi sau chưa bắt đầu để áp dụng thay đổi.';
  }
  if (error?.code === 'VISIT_LOCKED') {
    return 'Buổi chăm sóc này đã bắt đầu và bị khoá chỉnh sửa.';
  }
  if (error?.code === 'VISIT_CANCELLED') {
    return 'Buổi chăm sóc này đã bị huỷ.';
  }
  if (error?.code === 'VERSION_CONFLICT') {
    return 'Dữ liệu buổi chăm sóc vừa thay đổi. Vui lòng tải lại trước khi lưu.';
  }
  if (error?.status === 403) return 'Bạn không có quyền sửa hướng dẫn chăm sóc của lịch đặt này.';
  if (error?.status === 404) return 'Không tìm thấy lịch đặt hoặc buổi chăm sóc.';
  return 'Chưa lưu được hướng dẫn chăm sóc. Vui lòng kiểm tra nội dung và thử lại.';
}

export function BookingCareInstructionsPage({ api: suppliedApi, bookingId: suppliedBookingId } = {}) {
  const params = useParams();
  const bookingId = suppliedBookingId || params.bookingId;
  const { getCsrfToken } = useSession();
  const api = useMemo(
    () => suppliedApi ?? createVisitCareInstructionsApi({ getCsrfToken }),
    [suppliedApi, getCsrfToken]
  );

  const load = useCallback(
    ({ signal }) => api.getBookingCareInstructions(bookingId, { signal }),
    [api, bookingId]
  );
  const resource = useApiResource(load);
  const [dataOverride, setDataOverride] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const data = dataOverride ?? resource.data;
  const visits = useMemo(() => data?.visits ?? [], [data]);

  const selectedVisit = useMemo(() => {
    if (!visits.length) return null;
    if (selectedVisitId) {
      const match = visits.find(row => row.visitId === selectedVisitId);
      if (match) return match;
    }
    return visits.find(row => !row.cancelled && !row.locked) ?? visits[0];
  }, [visits, selectedVisitId]);

  useEffect(() => {
    if (resource.data) setDataOverride(null);
  }, [resource.data]);

  useEffect(() => {
    if (selectedVisit) {
      setSelectedVisitId(selectedVisit.visitId);
      setDraft(buildDraftFromVisit(selectedVisit));
      setFormError('');
    }
  }, [selectedVisit?.visitId, selectedVisit?.version, selectedVisit?.instructionVersion]);

  const laterEligibleVisits = useMemo(() => {
    if (!selectedVisit) return [];
    const selectedStart = Date.parse(selectedVisit.startAt);
    return visits.filter(
      row =>
        row.visitId !== selectedVisit.visitId &&
        !row.cancelled &&
        !row.locked &&
        !row.withinTwoHours &&
        Date.parse(row.startAt) > selectedStart
    );
  }, [selectedVisit, visits]);

  const readOnly = !selectedVisit
    || selectedVisit.cancelled
    || selectedVisit.locked
    || (selectedVisit.withinTwoHours && laterEligibleVisits.length === 0);

  function selectVisit(visit) {
    setSelectedVisitId(visit.visitId);
    setDraft(buildDraftFromVisit(visit));
    setFormError('');
  }

  function updatePet(petId, field, value) {
    setDraft(current => ({
      ...current,
      pets: current.pets.map(pet => (pet.petId === petId ? { ...pet, [field]: value } : pet))
    }));
  }

  function updateTask(index, patch) {
    setDraft(current => ({
      ...current,
      tasks: current.tasks.map((task, idx) => (idx === index ? { ...task, ...patch } : task))
    }));
  }

  function addTask() {
    setDraft(current => ({
      ...current,
      tasks: [...current.tasks, { itemId: null, label: '', required: false, locked: false }]
    }));
  }

  function removeTask(index) {
    setDraft(current => ({
      ...current,
      tasks: current.tasks.filter((_, idx) => idx !== index)
    }));
  }

  function discardChanges() {
    if (!selectedVisit) return;
    setDraft(buildDraftFromVisit(selectedVisit));
    setFormError('');
  }

  async function handleConfirm(event) {
    event.preventDefault();
    if (!selectedVisit || !draft || saving || readOnly) return;
    const emptyTask = draft.tasks.some(task => !task.label.trim());
    if (emptyTask) {
      setFormError('Vui lòng nhập nội dung cho tất cả việc cần làm hoặc xoá dòng trống.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        expectedVersion: selectedVisit.version,
        pets: draft.pets.map(pet => ({
          petId: pet.petId,
          feeding: pet.feeding,
          medicine: pet.medicine,
          behavior: pet.behavior
        })),
        tasks: draft.tasks.map(task => ({
          ...(task.itemId ? { itemId: task.itemId } : {}),
          label: task.label.trim(),
          required: task.locked ? true : task.required
        })),
        homeAccessNote: draft.homeAccessNote,
        applyToLater: selectedVisit.withinTwoHours ? true : draft.applyToLater
      };
      const result = await api.confirmVisitCareInstructions(bookingId, selectedVisit.visitId, payload);
      if (result?.data) {
        setDataOverride(result.data);
        const refreshed = result.data.visits.find(row => row.visitId === selectedVisit.visitId);
        if (refreshed) setDraft(buildDraftFromVisit(refreshed));
      }
      setToastMessage(MSG51_SAVED);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (resource.status === 'loading') {
    return (
      <main className="booking-care-page" aria-labelledby="care-instructions-title">
        <h1 id="care-instructions-title">Hướng dẫn chăm sóc</h1>
        <Notice state="loading" title="Đang tải hướng dẫn chăm sóc">Đang lấy danh sách các buổi của lịch đặt.</Notice>
      </main>
    );
  }
  if (resource.status === 'forbidden') {
    return (
      <main className="booking-care-page" aria-labelledby="care-instructions-title">
        <h1 id="care-instructions-title">Hướng dẫn chăm sóc</h1>
        <Notice state="forbidden" title="Không có quyền truy cập">Bạn không có quyền xem hoặc sửa hướng dẫn của lịch đặt này.</Notice>
      </main>
    );
  }
  if (resource.status === 'error' || !data) {
    return (
      <main className="booking-care-page" aria-labelledby="care-instructions-title">
        <h1 id="care-instructions-title">Hướng dẫn chăm sóc</h1>
        <Notice state="error" title="Chưa tải được hướng dẫn chăm sóc" action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>}>
          Vui lòng thử lại sau.
        </Notice>
      </main>
    );
  }

  return (
    <main className="booking-care-page" aria-labelledby="care-instructions-title">
      <Link className="booking-care-page__back" data-page-back to={`/account/bookings/${encodeURIComponent(bookingId)}`}>
        <ArrowLeft size={17} /> Quay lại chi tiết lịch đặt
      </Link>
      <header className="booking-care-page__header">
        <h1 id="care-instructions-title">Hướng dẫn chăm sóc</h1>
        <p>Chọn từng buổi để xem hoặc cập nhật hướng dẫn chăm sóc. Bạn có thể áp dụng cho các buổi sau chưa bắt đầu.</p>
      </header>
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />

      {!visits.length ? (
        <Notice state="empty" title="Chưa có buổi chăm sóc">Lịch đặt này hiện chưa có buổi nào.</Notice>
      ) : (
        <div className="booking-care-page__layout">
          <aside className="booking-care-page__visits" aria-label="Danh sách các buổi">
            <h2>Các buổi ({visits.length})</h2>
            <ul className="booking-care-page__visit-list">
              {visits.map((visit, index) => (
                <li key={visit.visitId}>
                  <button
                    type="button"
                    className={`booking-care-page__visit-btn${visit.visitId === selectedVisit?.visitId ? ' is-selected' : ''}`}
                    aria-pressed={visit.visitId === selectedVisit?.visitId}
                    onClick={() => selectVisit(visit)}
                  >
                    <strong>Buổi {index + 1} · {formatVietnamDateTime(visit.startAt)}</strong>
                    <span className="booking-care-page__visit-meta">
                      <span className="booking-care-page__badge">Phiên bản {visit.instructionVersion}</span>
                      {visit.cancelled && <span className="booking-care-page__badge booking-care-page__badge--cancelled">Đã huỷ</span>}
                      {!visit.cancelled && visit.locked && <span className="booking-care-page__badge booking-care-page__badge--locked">Đã khoá</span>}
                      {!visit.cancelled && !visit.locked && visit.withinTwoHours && (
                        <span className="booking-care-page__badge booking-care-page__badge--warn">Dưới 2 giờ</span>
                      )}
                      {!visit.cancelled && !visit.locked && visit.sitterAssigned && visit.requiresAcknowledgement && (
                        <span className="booking-care-page__badge booking-care-page__badge--warn">Chưa đọc</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {selectedVisit && draft && (
            <form className="booking-care-page__editor" onSubmit={handleConfirm}>
              <dl className="booking-care-page__version-box" aria-label="Thông tin phiên bản">
                <div>
                  <dt>Phiên bản đang giữ</dt>
                  <dd>Phiên bản {selectedVisit.instructionVersion}</dd>
                </div>
                <div>
                  <dt>Khách xác nhận lúc</dt>
                  <dd>{formatVietnamDateTime(selectedVisit.confirmedAt)}</dd>
                </div>
                <div>
                  <dt>Người chăm sóc đọc lúc</dt>
                  <dd>
                    {selectedVisit.acknowledgedAt
                      ? formatVietnamDateTime(selectedVisit.acknowledgedAt)
                      : selectedVisit.sitterAssigned
                        ? (selectedVisit.requiresAcknowledgement ? 'Chưa đọc bản mới' : 'Chưa ghi nhận')
                        : 'Chưa phân công'}
                  </dd>
                </div>
              </dl>

              {selectedVisit.cancelled && (
                <Notice state="warning" title="Buổi đã huỷ">Buổi chăm sóc này đã bị huỷ và không thể cập nhật hướng dẫn.</Notice>
              )}
              {!selectedVisit.cancelled && selectedVisit.locked && (
                <Notice state="warning" title="Đã khoá">Buổi chăm sóc này đã bắt đầu nên hướng dẫn được giữ cố định.</Notice>
              )}
              {!selectedVisit.cancelled && !selectedVisit.locked && selectedVisit.withinTwoHours && (
                <Notice state="warning" title="Còn dưới 2 giờ trước buổi">
                  {laterEligibleVisits.length > 0
                    ? `Buổi này còn dưới 2 giờ trước giờ bắt đầu. Thay đổi sẽ giữ nguyên phiên bản hiện tại của buổi này và áp dụng từ buổi sau (${laterEligibleVisits.length} buổi sau chưa bắt đầu).`
                    : 'Buổi này còn dưới 2 giờ trước giờ bắt đầu và không còn buổi sau chưa bắt đầu để áp dụng thay đổi.'}
                </Notice>
              )}
              {formError && <Notice state="error" title="Chưa lưu được thay đổi">{formError}</Notice>}

              <section aria-label="Hướng dẫn theo từng thú cưng">
                <h2>Hướng dẫn theo thú cưng</h2>
                {draft.pets.map(pet => (
                  <div key={pet.petId} className="booking-care-page__pet-card">
                    <h3>{pet.name}</h3>
                    <div className="booking-care-page__field">
                      <label htmlFor={`care-feeding-${pet.petId}`}>Cho ăn ({pet.name})</label>
                      <textarea
                        id={`care-feeding-${pet.petId}`}
                        rows={3}
                        maxLength={1000}
                        disabled={readOnly || saving}
                        value={pet.feeding}
                        onChange={event => updatePet(pet.petId, 'feeding', event.target.value)}
                      />
                    </div>
                    <div className="booking-care-page__field">
                      <label htmlFor={`care-medicine-${pet.petId}`}>Thuốc ({pet.name})</label>
                      <textarea
                        id={`care-medicine-${pet.petId}`}
                        rows={2}
                        maxLength={1000}
                        disabled={readOnly || saving}
                        value={pet.medicine}
                        onChange={event => updatePet(pet.petId, 'medicine', event.target.value)}
                      />
                      <p className="booking-care-page__hint">Thuốc chỉ để người chăm sóc biết thông tin, không tạo thành việc cần làm.</p>
                    </div>
                    <div className="booking-care-page__field">
                      <label htmlFor={`care-behavior-${pet.petId}`}>Hành vi ({pet.name})</label>
                      <textarea
                        id={`care-behavior-${pet.petId}`}
                        rows={2}
                        maxLength={1000}
                        disabled={readOnly || saving}
                        value={pet.behavior}
                        onChange={event => updatePet(pet.petId, 'behavior', event.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </section>

              <section className="booking-care-page__tasks" aria-label="Việc cần làm trong buổi">
                <h2>Việc cần làm trong buổi</h2>
                {draft.tasks.map((task, index) => (
                  <div key={task.itemId ?? `new-${index}`} className="booking-care-page__task-row">
                    <input
                      type="text"
                      aria-label={`Việc cần làm ${index + 1}`}
                      maxLength={200}
                      disabled={readOnly || saving || task.locked}
                      value={task.label}
                      placeholder="Nhập việc cần làm..."
                      onChange={event => updateTask(index, { label: event.target.value })}
                    />
                    <label className="booking-care-page__check">
                      <input
                        type="checkbox"
                        checked={task.locked ? true : task.required}
                        disabled={readOnly || saving || task.locked}
                        onChange={event => updateTask(index, { required: event.target.checked })}
                      />
                      Bắt buộc
                    </label>
                    {!task.locked && (
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Xoá việc ${index + 1}`}
                        disabled={readOnly || saving}
                        onClick={() => removeTask(index)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <div>
                    <Button type="button" variant="secondary" disabled={saving} onClick={addTask}>
                      <Plus size={16} /> Thêm việc
                    </Button>
                  </div>
                )}
              </section>

              <section className="booking-care-page__field" aria-label="Ghi chú vào nhà">
                <label htmlFor="care-home-access-note">Ghi chú vào nhà (tuỳ chọn)</label>
                <textarea
                  id="care-home-access-note"
                  rows={2}
                  maxLength={1000}
                  disabled={readOnly || saving}
                  value={draft.homeAccessNote}
                  onChange={event => setDraft(current => ({ ...current, homeAccessNote: event.target.value }))}
                />
                <p className="booking-care-page__hint">Chỉ người chăm sóc của buổi thấy, từ 1 giờ trước buổi đến khi check-out.</p>
              </section>

              {laterEligibleVisits.length > 0 && !selectedVisit.cancelled && !selectedVisit.locked && (
                <label className="booking-care-page__check">
                  <input
                    type="checkbox"
                    checked={selectedVisit.withinTwoHours ? true : draft.applyToLater}
                    disabled={saving || selectedVisit.withinTwoHours}
                    onChange={event => setDraft(current => ({ ...current, applyToLater: event.target.checked }))}
                  />
                  Áp dụng cho các buổi sau ({laterEligibleVisits.length} buổi chưa bắt đầu)
                </label>
              )}

              <div className="booking-care-page__actions">
                <Button type="submit" loading={saving} loadingLabel="Đang lưu…" disabled={readOnly || saving}>
                  Xác nhận hướng dẫn
                </Button>
                <Button type="button" variant="secondary" disabled={readOnly || saving} onClick={discardChanges}>
                  Huỷ thay đổi
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
