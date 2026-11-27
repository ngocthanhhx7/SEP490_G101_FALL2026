import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Notice, Pagination, Toast } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createFaultyProductClaimApi } from '../../services/faulty-product-claim-api.js';
import { formatOrderDate, formatOrderDateTime, formatPhone, formatVnd, productMessage } from '../../utils/product-format.js';
import './faulty-product-claims.css';

const TABS = [
  ['WAITING_CHECK', 'Chờ kiểm tra'],
  ['WAITING_ADMIN', 'Chờ Admin duyệt'],
  ['DONE', 'Đã xử lý']
];

const PROBLEM_LABELS = {
  FAULTY_PRODUCT: 'Sản phẩm lỗi',
  WRONG_PRODUCT: 'Giao sai sản phẩm'
};

const STATUS_META = {
  WAITING_CHECK: { label: 'Chờ kiểm tra', className: 'faulty-claims__badge--warn' },
  WAITING_ADMIN: { label: 'Chờ Admin duyệt', className: 'faulty-claims__badge--warn' },
  EXCHANGE_APPROVED: { label: 'Chờ gửi hàng đổi', className: 'faulty-claims__badge--warn' },
  EXCHANGE_SENT: { label: 'Đã gửi hàng đổi', className: 'faulty-claims__badge--done' },
  REFUND_APPROVED: { label: 'Đã duyệt hoàn tiền', className: 'faulty-claims__badge--done' },
  REJECTED: { label: 'Đã từ chối', className: 'faulty-claims__badge--danger' }
};

function ClaimPhoto({ claimId, photoId, position, api }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setSrc(null);
    setError('');
    api.readAdminPhoto(claimId, photoId, { signal: controller.signal })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(failure => {
        if (!controller.signal.aborted) setError(failure?.code === 'MEDIA_BUSY'
          ? 'Dịch vụ ảnh đang bận.' : 'Không tải được ảnh.');
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [claimId, photoId, api, attempt]);

  if (error) return <div>
    <p role="alert">{error}</p>
    <Button type="button" variant="secondary" onClick={() => setAttempt(value => value + 1)}>Tải lại ảnh</Button>
  </div>;
  if (!src) return <p role="status">Đang tải ảnh…</p>;
  return <img src={src} alt={`Ảnh khiếu nại ${position}`} />;
}

function ClaimPhotos({ claimId, photoIds, api }) {
  const [selectedId, setSelectedId] = useState(null);
  const index = photoIds.indexOf(selectedId);
  return <>
    <strong>Ảnh khách gửi ({photoIds.length})</strong>
    {photoIds.length > 0 && <div className="faulty-claims__photos" role="group" aria-label="Chọn ảnh khiếu nại">
      {photoIds.map((photoId, position) => <Button key={photoId} type="button" variant="secondary"
        aria-pressed={photoId === selectedId} onClick={() => setSelectedId(photoId)}>Ảnh {position + 1}</Button>)}
    </div>}
    {index >= 0 && <div className="faulty-claims__photos">
      <ClaimPhoto key={selectedId} claimId={claimId} photoId={selectedId} position={index + 1} api={api} />
    </div>}
  </>;
}

export function FaultyProductClaimsPage({ api: suppliedApi } = {}) {
  const { user, getCsrfToken } = useSession();
  const isAdmin = user?.roles?.includes('ADMIN');
  const isSaleStaff = user?.roles?.includes('SALE_STAFF');
  const [params, setParams] = useSearchParams();
  const initialTab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'WAITING_CHECK';
  const [tab, setTab] = useState(initialTab);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(params.get('claim') || null);
  const [inspectionText, setInspectionText] = useState('');
  const [inspectionError, setInspectionError] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const api = useMemo(
    () => suppliedApi ?? createFaultyProductClaimApi({ getCsrfToken }),
    [suppliedApi, getCsrfToken]
  );

  const loadList = useCallback(
    ({ signal }) => api.listClaims({ tab, page, limit: 20 }, { signal }).then(data => ({ data })),
    [api, tab, page]
  );
  const listResource = useApiResource(loadList);
  const data = listResource.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = data?.counts ?? { WAITING_CHECK: 0, WAITING_ADMIN: 0, DONE: 0 };

  const selected = useMemo(() => {
    if (!items.length) return null;
    if (selectedId) {
      const match = items.find(row => row.id === selectedId);
      if (match) return match;
    }
    return items[0];
  }, [items, selectedId]);

  useEffect(() => {
    setInspectionText('');
    setInspectionError('');
    setDecisionNote('');
    setActionError('');
  }, [selected?.id, selected?.version]);

  function changeTab(nextTab) {
    setTab(nextTab);
    setPage(1);
    setSelectedId(null);
    const next = new globalThis.URLSearchParams(params);
    next.set('tab', nextTab);
    next.delete('claim');
    setParams(next, { replace: true });
  }

  async function handleInspect(event) {
    event.preventDefault();
    if (!selected || busy) return;
    if (!inspectionText.trim()) {
      setInspectionError(productMessage('MSG107'));
      return;
    }
    setBusy(true);
    setInspectionError('');
    setActionError('');
    try {
      await api.inspectClaim(selected.id, {
        expectedVersion: selected.version,
        inspectionResult: inspectionText.trim()
      });
      setToastMessage(productMessage('MSG108'));
      setInspectionText('');
      listResource.retry();
    } catch (error) {
      if (error?.code === 'INSPECTION_RESULT_REQUIRED') {
        setInspectionError(productMessage('MSG107'));
      } else {
        setActionError('Chưa gửi được khiếu nại cho Admin. Vui lòng tải lại và thử lại.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDecide(decision) {
    if (!selected || busy || !isAdmin) return;
    setBusy(true);
    setActionError('');
    try {
      await api.decideClaim(selected.id, {
        expectedVersion: selected.version,
        decision,
        note: decisionNote.trim()
      });
      setToastMessage(productMessage('MSG109'));
      setDecisionNote('');
      listResource.retry();
    } catch {
      setActionError('Chưa lưu được quyết định. Vui lòng tải lại và thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function handleExchangeSent() {
    if (!selected || busy || !selected.canSendExchange) return;
    setBusy(true);
    setActionError('');
    try {
      await api.markExchangeSent(selected.id, { expectedVersion: selected.version });
      setToastMessage('Đã ghi nhận gửi hàng đổi và trừ tồn kho.');
      listResource.retry();
    } catch (error) {
      if (error?.code === 'EXCHANGE_INSUFFICIENT_STOCK') {
        setActionError('Tồn khả dụng không đủ để gửi hàng đổi. Vui lòng kiểm tra lại tồn kho.');
      } else {
        setActionError('Chưa ghi nhận được gửi hàng đổi. Vui lòng tải lại.');
      }
      listResource.retry();
    } finally {
      setBusy(false);
    }
  }

  const statusMeta = selected ? (STATUS_META[selected.status] ?? { label: selected.status, className: '' }) : null;

  return (
    <main className="faulty-claims" aria-labelledby="faulty-claims-title">
      <header className="faulty-claims__header">
        <h1 id="faulty-claims-title">Khiếu nại sản phẩm</h1>
        <p>Tiếp nhận báo sản phẩm lỗi hoặc giao sai từ khách hàng, kiểm tra và quyết định đổi hàng, hoàn tiền hoặc từ chối.</p>
      </header>
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />

      <div className="faulty-claims__tabs" role="tablist" aria-label="Trạng thái khiếu nại sản phẩm">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`faulty-claims__tab${tab === key ? ' is-active' : ''}`}
            onClick={() => changeTab(key)}
          >
            {label} ({counts[key] ?? 0})
          </button>
        ))}
      </div>

      {listResource.status === 'loading' && <Notice state="loading" title="Đang tải danh sách khiếu nại…" />}
      {listResource.status === 'forbidden' && <Notice state="forbidden" title="Bạn không có quyền xem trang này." />}
      {listResource.status === 'error' && (
        <Notice state="error" title="Chưa tải được danh sách khiếu nại" action={<Button variant="secondary" onClick={listResource.retry}>Thử lại</Button>} />
      )}

      {listResource.status === 'success' && (
        <div className="faulty-claims__grid">
          <section className="faulty-claims__panel" aria-label="Danh sách khiếu nại sản phẩm">
            {items.length === 0 ? (
              <Notice state="empty" title="Chưa có khiếu nại nào trong mục này." />
            ) : (
              <table className="faulty-claims__table">
                <thead>
                  <tr>
                    <th>Mã khiếu nại</th>
                    <th>Đơn hàng</th>
                    <th>Khách hàng</th>
                    <th>Ngày báo</th>
                    <th><span className="pwc-visually-hidden">Xem</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(claim => (
                    <tr key={claim.id} className={claim.id === selected?.id ? 'is-selected' : undefined}>
                      <td><strong>{claim.code}</strong></td>
                      <td>{claim.orderCode}</td>
                      <td>{claim.customerName}</td>
                      <td>{formatOrderDate(claim.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="pwc-shop-link-button"
                          onClick={() => setSelectedId(claim.id)}
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data && (page > 1 || items.length > 0) && (
              <Pagination
                page={data.page}
                limit={data.limit}
                total={data.total}
                itemLabel="khiếu nại"
                onPageChange={next => { setPage(next); setSelectedId(null); }}
              />
            )}
          </section>

          {selected && (
            <aside className="faulty-claims__panel" aria-label={`Chi tiết khiếu nại ${selected.code}`}>
              <h2>
                {selected.code}{' '}
                <span className={`faulty-claims__badge ${statusMeta.className}`}>{statusMeta.label}</span>
              </h2>
              <dl className="faulty-claims__facts">
                <dt>Đơn hàng</dt>
                <dd>{selected.orderCode}</dd>
                <dt>Ngày giao / nhận</dt>
                <dd>{formatOrderDate(selected.orderDeliveredAt)}</dd>
                <dt>Khách hàng</dt>
                <dd>{selected.customerName}</dd>
                <dt>Số điện thoại</dt>
                <dd>{selected.customerPhone ? formatPhone(selected.customerPhone) : 'Chưa có'}</dd>
                <dt>Sản phẩm</dt>
                <dd>{selected.productName} ({selected.productCode})</dd>
                <dt>Số lượng báo lỗi</dt>
                <dd>{selected.quantity} / {selected.orderedQuantity}</dd>
                <dt>Vấn đề</dt>
                <dd>{PROBLEM_LABELS[selected.problemType] ?? selected.problemType}</dd>
                <dt>Mô tả</dt>
                <dd>{selected.description || 'Không có mô tả thêm'}</dd>
                <dt>Đơn giá trên đơn</dt>
                <dd>{formatVnd(selected.unitPriceVnd)}</dd>
                <dt>Số tiền hoàn (nếu hoàn tiền)</dt>
                <dd><strong>{formatVnd(selected.refundEstimateVnd)}</strong></dd>
              </dl>

              <div>
                <ClaimPhotos key={selected.id} claimId={selected.id} photoIds={selected.photoIds ?? []} api={api} />
              </div>

              {selected.inspectionResult && (
                <div className="faulty-claims__section">
                  <strong>Kết quả kiểm tra</strong>
                  <p style={{ margin: 0 }}>{selected.inspectionResult}</p>
                  <small>
                    {selected.inspectedByName || 'Sale Staff'}
                    {selected.inspectedAt ? ` · ${formatOrderDateTime(selected.inspectedAt)}` : ''}
                  </small>
                </div>
              )}

              {selected.decision && (
                <div className="faulty-claims__section">
                  <strong>Quyết định của Admin</strong>
                  <p style={{ margin: 0 }}>
                    {selected.decision === 'EXCHANGE' && 'Duyệt đổi hàng (cùng sản phẩm)'}
                    {selected.decision === 'REFUND' && `Duyệt hoàn tiền ${formatVnd(selected.refundAmountVnd ?? selected.refundEstimateVnd)} (kế toán chi trả ngoài hệ thống)`}
                    {selected.decision === 'REJECT' && 'Từ chối khiếu nại'}
                  </p>
                  {selected.decisionNote && <p style={{ margin: 0 }}>Ghi chú: {selected.decisionNote}</p>}
                  <small>
                    {selected.decidedByName || 'Admin'}
                    {selected.decidedAt ? ` · ${formatOrderDateTime(selected.decidedAt)}` : ''}
                  </small>
                </div>
              )}

              {selected.status === 'EXCHANGE_SENT' && (
                <div className="faulty-claims__section">
                  <strong>Gửi hàng đổi</strong>
                  <p style={{ margin: 0 }}>
                    Đã gửi bởi {selected.exchangeSentByName || 'Sale Staff'}
                    {selected.exchangeSentAt ? ` lúc ${formatOrderDateTime(selected.exchangeSentAt)}` : ''}.
                  </p>
                </div>
              )}

              {actionError && <p className="faulty-claims__error" role="alert">{actionError}</p>}

              {selected.status === 'WAITING_CHECK' && (isSaleStaff || isAdmin) && (
                <form className="faulty-claims__section" onSubmit={handleInspect} noValidate>
                  <label htmlFor="claim-inspection-result"><strong>Kết quả kiểm tra *</strong></label>
                  <textarea
                    id="claim-inspection-result"
                    rows={3}
                    maxLength={2000}
                    value={inspectionText}
                    disabled={busy}
                    placeholder="Ghi rõ kết quả đối chiếu đơn hàng và ảnh sản phẩm…"
                    onChange={event => {
                      setInspectionText(event.target.value);
                      if (inspectionError) setInspectionError('');
                    }}
                  />
                  {inspectionError && <p className="faulty-claims__error" role="alert">{inspectionError}</p>}
                  <div className="faulty-claims__actions">
                    <Button type="submit" loading={busy} loadingLabel="Đang gửi…">
                      Gửi Admin duyệt
                    </Button>
                  </div>
                </form>
              )}

              {selected.status === 'WAITING_ADMIN' && isAdmin && (
                <div className="faulty-claims__section">
                  <p style={{ margin: 0 }}>
                    Số tiền hoàn (chỉ đọc): <strong>{formatVnd(selected.refundEstimateVnd)}</strong> (kế toán trả ngoài hệ thống).
                  </p>
                  <label htmlFor="claim-decision-note">Ghi chú quyết định (tuỳ chọn)</label>
                  <textarea
                    id="claim-decision-note"
                    rows={2}
                    maxLength={2000}
                    value={decisionNote}
                    disabled={busy}
                    onChange={event => setDecisionNote(event.target.value)}
                  />
                  <div className="faulty-claims__actions">
                    <Button type="button" disabled={busy} onClick={() => handleDecide('EXCHANGE')}>
                      Duyệt đổi hàng
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => handleDecide('REFUND')}>
                      Duyệt hoàn tiền
                    </Button>
                    <Button type="button" variant="danger" disabled={busy} onClick={() => handleDecide('REJECT')}>
                      Từ chối
                    </Button>
                  </div>
                </div>
              )}

              {selected.status === 'EXCHANGE_APPROVED' && (
                <div className="faulty-claims__section">
                  <p style={{ margin: 0 }}>
                    Số có sẵn hiện tại: <strong>{selected.productAvailable ?? 0}</strong> (cần {selected.quantity}).
                  </p>
                  {selected.canSendExchange ? (
                    <div className="faulty-claims__actions">
                      <Button type="button" loading={busy} loadingLabel="Đang cập nhật…" onClick={handleExchangeSent}>
                        Đã gửi hàng đổi
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="faulty-claims__error" role="status">
                        Không đủ hàng có sẵn để gửi hàng đổi.
                      </p>
                      {isAdmin && (
                        <div className="faulty-claims__actions">
                          <Button type="button" variant="secondary" disabled={busy} onClick={() => handleDecide('REFUND')}>
                            Chuyển sang duyệt hoàn tiền ({formatVnd(selected.refundEstimateVnd)})
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
