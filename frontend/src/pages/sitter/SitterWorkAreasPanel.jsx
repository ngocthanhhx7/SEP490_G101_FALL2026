import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Notice } from '../../components/ui/index.js';
import './sitter-work-areas.css';

export const MAX_SITTER_WORK_AREA_CODES = 20;

const LEVELS = Object.freeze([
  { code: 'CITY', label: 'Thành phố' },
  { code: 'DISTRICT', label: 'Khu vực phục vụ' },
]);
const SAFE_CODE = /^(CITY|DISTRICT)_[A-Z0-9][A-Z0-9_-]{0,55}$/;
const HAS_LETTER = /[\p{L}]/u;

function preparePanelData(data) {
  if (!data || !Array.isArray(data.options) || !Array.isArray(data.selectedCodes)
    || !Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 0) return null;

  const seen = new Set();
  const options = [];
  for (const option of data.options) {
    const code = typeof option?.code === 'string' ? option.code.trim().toUpperCase() : '';
    const label = typeof option?.label === 'string' ? option.label.trim() : '';
    if (!SAFE_CODE.test(code) || !LEVELS.some(level => level.code === option?.level)
      || !code.startsWith(`${option.level}_`) || !label || label.length > 100
      || !HAS_LETTER.test(label) || /[\u0000-\u001f\u007f,;@/\\]/u.test(label) || seen.has(code)) return null;
    seen.add(code);
    options.push({ code, label, level: option.level });
  }

  const selected = new Set();
  for (const value of data.selectedCodes) {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!SAFE_CODE.test(code) || !seen.has(code) || selected.has(code)) return null;
    selected.add(code);
  }
  const selectedCodes = [...selected].sort();
  if (selectedCodes.length > MAX_SITTER_WORK_AREA_CODES) return null;
  return { options, selectedCodes, expectedVersion: data.expectedVersion };
}

function createIdempotencyKey() {
  return typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : null;
}

function retryAction(onRetry) {
  return <Button variant="secondary" onClick={onRetry}>Tải lại trạng thái</Button>;
}

function pendingCopy(message) {
  return message || 'Chưa xác minh được trạng thái hiện tại. Tải lại trước khi tiếp tục.';
}

export function SitterWorkAreasPanel({ api }) {
  const load = useCallback(({ signal }) => {
    if (typeof api?.load !== 'function') throw Object.assign(new Error('API is not configured'), { status: 503 });
    return api.load({ signal });
  }, [api]);
  const resource = useApiResource(load);
  const [draftCodes, setDraftCodes] = useState(null);
  const [savedCodes, setSavedCodes] = useState(null);
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reconcileRequired, setReconcileRequired] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const saveController = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveController.current?.abort();
    };
  }, []);

  const panelData = resource.status === 'success' ? preparePanelData(resource.data) : null;
  useEffect(() => {
    if (!panelData) return;
    setDraftCodes(panelData.selectedCodes);
    setSavedCodes(panelData.selectedCodes);
    setExpectedVersion(panelData.expectedVersion);
    setReconcileRequired(false);
    setSaveNotice(null);
  }, [resource.status, resource.data]);

  function retryLoad() {
    setSaveNotice(null);
    setDraftCodes(null);
    setSavedCodes(null);
    resource.retry();
  }

  function toggleCode(code, checked) {
    setSaveNotice(null);
    setDraftCodes(current => {
      const updated = new Set(current ?? panelData?.selectedCodes ?? []);
      if (checked) updated.add(code);
      else updated.delete(code);
      return [...updated].sort();
    });
  }

  async function saveSelection(event) {
    event.preventDefault();
    const currentCodes = draftCodes ?? panelData?.selectedCodes ?? [];
    if (saving || reconcileRequired || !panelData || currentCodes.length > MAX_SITTER_WORK_AREA_CODES) return;
    if (typeof api?.save !== 'function') {
      setSaveNotice({ state: 'error', title: 'Chưa thể lưu khu vực', message: 'Chức năng lưu chưa được kết nối.' });
      return;
    }
    const idempotencyKey = createIdempotencyKey();
    if (!idempotencyKey) {
      setSaveNotice({ state: 'error', title: 'Chưa thể lưu khu vực', message: 'Thiết bị chưa hỗ trợ gửi yêu cầu lưu an toàn.' });
      return;
    }

    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setSaveNotice(null);
    try {
      const result = await api.save({
        areas: [...currentCodes], expectedVersion, idempotencyKey, signal: controller.signal,
      });
      if (!mounted.current) return;
      if (result?.pending || result?.status === 202 || result?.status === 204) {
        setReconcileRequired(true);
        setSaveNotice({ state: 'pending', title: 'Đang chờ xác nhận',
          message: pendingCopy('Đã nhận phản hồi nhưng chưa xác minh được trạng thái hiện tại.') });
        return;
      }
      const confirmed = preparePanelData(result?.data);
      const sameSelection = confirmed?.selectedCodes.length === currentCodes.length
        && confirmed.selectedCodes.every((code, index) => code === currentCodes[index]);
      if (!confirmed || !sameSelection || confirmed.expectedVersion <= expectedVersion) {
        setReconcileRequired(true);
        setSaveNotice({ state: 'pending', title: 'Chưa xác nhận được thay đổi', message: pendingCopy() });
        return;
      }
      setDraftCodes(confirmed.selectedCodes);
      setSavedCodes(confirmed.selectedCodes);
      setExpectedVersion(confirmed.expectedVersion);
      setSaveNotice({ state: 'success', title: 'Đã lưu khu vực', message: 'Máy chủ đã xác nhận danh sách khu vực phục vụ.' });
    } catch (error) {
      if (!mounted.current || error?.code === 'ABORTED') return;
      if (error?.status === 403) {
        setReconcileRequired(true);
        setSaveNotice({ state: 'forbidden', title: 'Không thể lưu khu vực',
          message: 'Phiên hiện tại không có quyền cập nhật khu vực phục vụ.' });
      } else if (error?.code === 'VERSION_CONFLICT') {
        setReconcileRequired(true);
        setSaveNotice({ state: 'error', title: '\u004c\u1ecbch \u0111\u00e3 thay \u0111\u1ed5i', message: '\u0054\u1ea3i l\u1ea1i khu v\u1ef1c v\u00e0 phi\u00ean b\u1ea3n l\u1ecbch tr\u01b0\u1edbc khi l\u01b0u.' });
      } else if (error?.code === 'CONFIRMED_VISIT_CONFLICT') {
        setSaveNotice({ state: 'warning', title: '\u0043\u1ea7n nh\u00e2n vi\u00ean x\u1eed l\u00fd l\u1ecbch \u0111\u00e3 x\u00e1c nh\u1eadn',
          message: '\u004bhu v\u1ef1c ch\u01b0a \u0111\u01b0\u1ee3c thay \u0111\u1ed5i. Bu\u1ed5i \u0111\u00e3 x\u00e1c nh\u1eadn v\u1eabn \u0111\u01b0\u1ee3c gi\u1eef; h\u00e3y li\u00ean h\u1ec7 nh\u00e2n vi\u00ean \u0111\u1ec3 r\u00e0 so\u00e1t xung \u0111\u1ed9t.' });
      } else if (error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT') {
        setReconcileRequired(true);
        setSaveNotice({ state: 'pending', title: 'Cần kiểm tra trạng thái', message: pendingCopy() });
      } else {
        setSaveNotice({ state: 'error', title: 'Chưa thể lưu khu vực',
          message: error?.status === 422 ? 'Chọn các khu vực hợp lệ rồi thử lại.' : 'Không thể lưu lúc này. Vui lòng thử lại sau.' });
      }
    } finally {
      if (mounted.current) setSaving(false);
      if (saveController.current === controller) saveController.current = null;
    }
  }

  const heading = <header className="sitter-work-areas__header">
    <p className="sitter-work-areas__eyebrow">Hồ sơ Pet Sitter</p>
    <h1 id="sitter-work-areas-title">Khu vực phục vụ</h1>
    <p>Chọn khu vực bạn có thể nhận ca chăm sóc.</p>
    <p className="sitter-work-areas__conflict">Thay đổi khu vực không tự hủy buổi đã xác nhận. Nếu lịch có xung đột, nhân viên cần rà soát.</p>
  </header>;

  let body;
  if (resource.status === 'loading') {
    body = <Notice state="loading" title="Đang tải khu vực phục vụ">Đang đọc danh sách khu vực của bạn.</Notice>;
  } else if (resource.status === 'pending') {
    body = <Notice state="pending" title="Đang chờ dữ liệu khu vực" action={retryAction(retryLoad)}>
      Máy chủ chưa trả về danh sách cuối cùng. Tải lại để kiểm tra trạng thái.
    </Notice>;
  } else if (resource.status === 'forbidden') {
    body = <Notice state="forbidden" title="Bạn không có quyền xem khu vực phục vụ">Đăng nhập bằng tài khoản Pet Sitter được kích hoạt để tiếp tục.</Notice>;
  } else if (resource.status === 'error') {
    body = <Notice state="error" title="Không tải được khu vực phục vụ" action={retryAction(retryLoad)}>
      Hãy kiểm tra kết nối rồi tải lại danh sách.
    </Notice>;
  } else if (resource.status === 'success' && !panelData) {
    body = <Notice state="error" title="Danh sách khu vực không hợp lệ" action={retryAction(retryLoad)}>
      Chưa thể xác minh dữ liệu thành phố và quận, huyện. Tải lại để thử lần nữa.
    </Notice>;
  } else if (resource.status === 'empty' || !panelData || panelData.options.length === 0) {
    body = <Notice state="empty" title="Chưa có danh sách khu vực khả dụng" action={retryAction(retryLoad)}>
      Danh mục thành phố và quận, huyện chưa sẵn sàng. Kết nối danh mục khu vực để tiếp tục.
    </Notice>;
  } else {
    const currentCodes = draftCodes ?? panelData.selectedCodes;
    const baselineCodes = savedCodes ?? panelData.selectedCodes;
    const selected = new Set(currentCodes);
    const atLimit = currentCodes.length >= MAX_SITTER_WORK_AREA_CODES;
    const dirty = currentCodes.length !== baselineCodes.length
      || currentCodes.some((code, index) => code !== baselineCodes[index]);
    body = <>
      <p className="sitter-work-areas__selection-count" aria-live="polite">
        Đã chọn {currentCodes.length}/{MAX_SITTER_WORK_AREA_CODES} khu vực.
      </p>
      <form onSubmit={saveSelection}>
        <fieldset className="sitter-work-areas__fieldset" disabled={saving || reconcileRequired}>
          <legend>Chọn khu vực hành chính</legend>
          <p id="sitter-work-areas-limit" className="sitter-work-areas__hint">
            Có thể chọn tối đa {MAX_SITTER_WORK_AREA_CODES} mã thành phố hoặc quận, huyện.
          </p>
          {LEVELS.map(level => {
            const options = panelData.options.filter(area => area.level === level.code);
            if (!options.length) return null;
            return <section className="sitter-work-areas__group" key={level.code} aria-labelledby={`work-area-${level.code}`}>
              <h2 id={`work-area-${level.code}`}>{level.label}</h2>
              <div className="sitter-work-areas__options">
                {options.map(area => <label className="sitter-work-areas__option" key={area.code}>
                  <input type="checkbox" name="areaCodes" value={area.code}
                    checked={selected.has(area.code)} disabled={!selected.has(area.code) && atLimit}
                    aria-describedby="sitter-work-areas-limit"
                    onChange={event => toggleCode(area.code, event.target.checked)} />
                  <span>{area.label}</span>
                </label>)}
              </div>
            </section>;
          })}
        </fieldset>

        {currentCodes.length === 0 && <p className="sitter-work-areas__empty-selection">Bạn chưa chọn khu vực phục vụ. Lưu danh sách trống sẽ bỏ các khu vực khỏi tìm kiếm yêu cầu mới.</p>}
        {saveNotice && <Notice state={saveNotice.state} title={saveNotice.title}
          action={reconcileRequired ? retryAction(retryLoad) : undefined}>
          {saveNotice.message}
        </Notice>}

        <div className="sitter-work-areas__actions">
          <Button type="submit" loading={saving} disabled={!dirty || reconcileRequired}
            loadingLabel="Đang lưu khu vực…">Lưu khu vực</Button>
        </div>
      </form>
    </>;
  }

  return <section className="sitter-work-areas" aria-labelledby="sitter-work-areas-title">
    <div className="sitter-work-areas__card">
      {heading}
      {body}
    </div>
  </section>;
}
