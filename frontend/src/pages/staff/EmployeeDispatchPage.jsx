import {
  OperationsMetrics,
  OperationsTable,
  OperationsBadge,
} from '../../components/common/OperationsWorkspace.jsx';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Send } from 'lucide-react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button, Dialog, Notice } from '../../components/ui/index.js';
import { DispatchDiagnostics, DispatchRecoveryPanel } from './DispatchRecoveryPanel.jsx';
import { DispatchSitterPicker } from './DispatchSitterPicker.jsx';
import { DispatchRanking } from './DispatchRanking.jsx';
import { StaffTravelMonitor } from './StaffTravelMonitor.jsx';
import { VisitBoard } from './visit-board/VisitBoard.jsx';
import { VisitBoardCustomer, VisitBoardStatus, VisitBoardSummary } from './visit-board/VisitBoardCells.jsx';
import { StaffBookingChangeRequests } from './booking-change/StaffBookingChangeRequests.jsx';
import { VISIT_WITHDRAWAL_REASON_LABELS } from '../../constants/visit-withdrawal-messages.js';
import '../../styles/employee-scheduling.css';

const time = (value) =>
  new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
const short = (id) => (id ? '…' + id.slice(-6) : '—');
const reviewLabel = (code) =>
  ({
    NO_ELIGIBLE_SITTER: 'Chưa có người chăm sóc đủ điều kiện nhận ca.',
    INSUFFICIENT_DISPATCH_CANDIDATES: 'Chưa đủ 5 người phù hợp để mời tự động.',
    STAFF_REVIEW_REQUIRED: 'Các lời mời đã bị từ chối hoặc hết hạn.',
    DIRECTED_SCHEDULE_REVIEW_REQUIRED: 'Người được khách chỉ định chưa thể nhận ca.',
    TRAVEL_REVIEW_REQUIRED: 'Cần xác minh khả năng di chuyển.',
    DAY_ORIGIN_MISSING: 'Chưa có điểm xuất phát cho ngày làm việc.',
    DISPATCH_SEARCH_LIMIT: 'Số lượng hồ sơ vượt giới hạn tìm tự động. Cần điều phối kiểm tra.',
    SHIFT_START_REACHED: 'Đã đến giờ nhưng chưa có người nhận ca. Cần liên hệ khách để sắp xếp lại.',
  })[code] ?? 'Cần kiểm tra và sắp xếp người nhận ca.';
export function EmployeeDispatchPage({ api, selectedSitter, initialVisitId, onCloseVisit, initialWorkflowId, initialWithdrawalId, initialClosureId, initialHandoverVisitId, initialTab, initialFilters, reassignedNotice, onReassign, canVerifyClosure = false }) {
  const validSelection = !selectedSitter || /^[a-f0-9]{24}$/i.test(selectedSitter);
  const [visitTravelEnabled, setVisitTravelEnabled] = useState(false);
  const [bookingChangesRevision, setBookingChangesRevision] = useState(0);
  const load = useCallback(async ({ signal }) => {
    const result = await api.queue({ signal });
    if (!signal.aborted && !result.pending) {
      setVisitTravelEnabled(result.data?.visitTravelEnabled === true);
    }
    return result;
  }, [api]);
  const queue = useApiResource(load);
  const [tab, setTab] = useState(initialHandoverVisitId ? 'all' : initialTab ?? 'needs');
  const [board, setBoard] = useState({ ids: new Set(), filtering: false });
  const [selected, setSelected] = useState(initialVisitId ?? null);
  const [addingInvitation, setAddingInvitation] = useState(false);
  function closeVisit() {
    setSelected(null);
    setAddingInvitation(false);
    onCloseVisit?.();
  }
  const [withdrawalToReview, setWithdrawalToReview] = useState(null);
  const loadSelected = useCallback(({ signal }) => selected && api.dispatchDetails
    ? api.dispatchDetails(selected, { signal }) : Promise.resolve({ data: null }), [api, selected]);
  const selectedDetails = useApiResource(loadSelected);
  const [proposal, setProposal] = useState(null);
  const command = useSchedulingCommand(() => {
    setAddingInvitation(false);
    queue.retry();
    if (selected) selectedDetails.retry();
  });
  const rows = queue.data?.items ?? [],
    active = selectedDetails.data?.id === selected ? selectedDetails.data : rows.find((row) => row.id === selected),
    legacyRows = rows.filter((row) => !board.ids.has(row.id)),
    today = queue.data?.today;
  const area = (code) => queue.data?.workAreas?.find((a) => a.code === code)?.label ?? 'Chưa rõ khu vực';
  const action = (row) =>
    row.pendingInvitation
      ? 'Đang chờ phản hồi'
      : row.reviewCode === 'SHIFT_START_REACHED'
        ? 'Đổi lịch với khách'
        : row.dispatchState === 'NEEDS_STAFF'
          ? 'Xem / xử lý'
          : 'Xem tình trạng';
  return (
    <section className="ops-workspace employee-scheduling">
      <header>
        <div>
          <h1>Điều phối ca chăm sóc</h1>
          <p className="ops-muted">Theo dõi buổi chăm sóc và xử lý các ca cần hỗ trợ.</p>
        </div>
        <Button variant="secondary" aria-label="Tải lại lịch điều phối" onClick={() => {
          queue.retry();
          setBookingChangesRevision(revision => revision + 1);
        }}>
          <RefreshCw size={18} />
          Tải lại
        </Button>
      </header>
      {selectedSitter && (
        <p>
          {validSelection ? 'Đã chọn người chăm sóc để mời.' : 'Mã người chăm sóc không hợp lệ.'}{' '}
          <Link to="/staff/dispatch">Bỏ chọn</Link>
        </p>
      )}
      <OperationsMetrics
        items={[
          { label: 'Buổi hôm nay', value: today?.summary.total },
          { label: 'Đang chăm sóc', value: today?.summary.inProgress },
          { label: 'Đã hoàn thành hôm nay', value: today?.summary.completed },
          { label: 'Chưa check-in sau 15 phút', value: today?.summary.late },
        ]}
        caption={
          today
            ? `Ngày ${today.date} · Giờ Việt Nam · Cập nhật ${time(today.asOf)}`
            : 'Đang chờ số liệu từ hệ thống.'
        }
      />
      {!active && command.message && <p role="status">{command.message}</p>}
      {selected && !active && selectedDetails.status === 'loading' && <p role="status">Đang tải chi tiết ca…</p>}
      {selected && !active && ['error', 'forbidden', 'pending'].includes(selectedDetails.status) && <p role="alert">
        Chưa tải được ca này. <button onClick={selectedDetails.retry}>Thử lại</button>{' '}
        <button onClick={closeVisit}>Đóng</button>
      </p>}
      {!active && command.pending && (
        <Button disabled={command.busy} onClick={command.retry}>
          Kiểm tra lại yêu cầu
        </Button>
      )}
      {reassignedNotice && <Notice state="success" title="Đã đổi người chăm sóc">{reassignedNotice}</Notice>}
      {proposal && <p role="status">Đã gửi đề xuất lịch mới, đang chờ khách xác nhận.</p>}
      {queue.status === 'loading' && <p role="status">Đang tải ca…</p>}
      <VisitBoard initialFilters={initialFilters} onReassign={onReassign} initialHandoverVisitId={initialHandoverVisitId} initialWorkflowId={initialWorkflowId} api={api} tab={tab} onTab={setTab} todayTotal={today?.summary?.total} workAreas={queue.data?.workAreas}
        openableIds={queue.data && new Set(rows.map((row) => row.id))} onOpenDispatch={setSelected} onChanged={queue.retry} onState={setBoard}
        initialWithdrawalId={initialWithdrawalId} initialClosureId={initialClosureId} canVerifyClosure={canVerifyClosure} requestedWithdrawalId={withdrawalToReview} onWithdrawalDismiss={() => setWithdrawalToReview(null)} refreshKey={queue.data} />
      {['error', 'forbidden', 'pending'].includes(queue.status) && (
        <p role="alert">
          Chưa tải được các ca cần điều phối. <button onClick={queue.retry}>Thử lại</button>
        </p>
      )}
      {tab === 'needs' && <section className="ops-section">
        <header>
          <div>
            <h2>{typeof api.visitBoard === 'function' ? 'Hàng đợi tìm người của hệ thống' : 'Cần xử lý'}</h2>
            <p className="ops-muted">
              Ca chờ điều phối, xếp theo giờ bắt đầu. Chỉ tìm lại sau khi hệ thống chuyển ca cần hỗ trợ.
            </p>
          </div>
        </header>
        <StaffBookingChangeRequests refreshRevision={bookingChangesRevision} onDecision={queue.retry} />
        {!!queue.data?.withdrawalRequests?.length && <div id="withdrawal-requests" className="withdrawal-requests">
          <h3>Yêu cầu rút buổi</h3>
          <OperationsTable label="Yêu cầu rút buổi" rows={queue.data.withdrawalRequests} columns={[
            { key: 'visit', label: 'Buổi', render: row => <><strong>{row.serviceName ?? short(row.id)}</strong><small>{time(row.startAt)}</small></> },
            { key: 'sitter', label: 'Người chăm sóc', render: row => row.sitterName ?? short(row.sitterId) },
            { key: 'reason', label: 'Lý do', render: row => <>{VISIT_WITHDRAWAL_REASON_LABELS[row.reasonCode] ?? '—'}
              {row.note && <small>{row.note}</small>}</> },
            { key: 'action', label: 'Thao tác', render: row => api.withdrawalReview
              ? <button onClick={() => setWithdrawalToReview(row.id)}>Xử lý yêu cầu rút</button> : 'Liên hệ điều phối để xử lý' }
          ]} />
          <p className="ops-muted">Người chăm sóc vẫn được phân công cho đến khi nhân viên thay người hoặc huỷ buổi.</p>
          {queue.data.withdrawalRequestsHaveMore && <p className="ops-muted">Đang hiển thị 50 yêu cầu theo giờ buổi sớm nhất.</p>}
        </div>}
        {board.filtering && <p role="status" className="ops-muted">Đang tìm hoặc lọc, hàng đợi tìm người của hệ thống tạm ẩn.</p>}
        {!board.filtering && <OperationsTable
          label="Ca cần điều phối"
          rows={legacyRows}
          empty="Chưa có ca chờ điều phối."
          columns={[
            {
              key: 'visit',
              label: 'Buổi chăm sóc',
              render: (r) => <VisitBoardSummary row={r} />,
            },
            { key: 'customerName', label: 'Khách hàng', render: (r) => r.customerName ?? 'Chưa có tên' },
            { key: 'area', label: 'Khu vực', render: (r) => area(r.areaCode) },
            {
              key: 'reason',
              label: 'Tình trạng',
              render: (r) => (
                <OperationsBadge
                  tone={
                    r.reviewCode === 'SHIFT_START_REACHED'
                      ? 'danger'
                      : r.dispatchState === 'NEEDS_STAFF'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {r.reviewCode
                    ? reviewLabel(r.reviewCode)
                    : r.pendingInvitation
                      ? `${r.pendingInvitationCount ?? 1} lời mời chờ phản hồi`
                      : 'Hệ thống đang tìm người'}
                </OperationsBadge>
              ),
            },
            {
              key: 'sitter',
              label: 'Người chăm sóc',
              render: (r) =>
                r.requestedSitterName ??
                (r.requestedSitterId ? short(r.requestedSitterId) : 'Chưa phân công'),
            },
            {
              key: 'action',
              label: 'Thao tác',
              render: (r) => <button onClick={() => setSelected(r.id)}>{action(r)}</button>,
            },
          ]}
        />}
        {queue.data?.queueHasMore && (
          <p className="ops-muted">
            Đang hiển thị 50 ca sớm nhất. Tải lại sau khi xử lý để xem các ca tiếp theo.
          </p>
        )}
      </section>}
      {tab === 'today' && <section className="ops-section">
        <header>
          <div>
            <h2>Buổi hôm nay</h2>
            <p className="ops-muted">
              Ca đã nhận nhưng chưa check-in sau 15 phút được đánh dấu cần kiểm tra. Không tự kết luận bỏ ca.
            </p>
          </div>
        </header>
        <div className="visit-board"><OperationsTable
          label="Buổi chăm sóc hôm nay"
          rows={today?.items ?? []}
          empty={today ? 'Chưa có buổi chăm sóc hôm nay.' : 'Chưa có số liệu hôm nay.'}
          columns={[
            { key: 'visit', label: 'Buổi chăm sóc', render: (r) => <VisitBoardSummary row={r} /> },
            { key: 'customer', label: 'Khách hàng', render: (r) => <VisitBoardCustomer row={r} /> },
            { key: 'area', label: 'Khu vực', render: (r) => area(r.areaCode) },
            { key: 'sitterName', label: 'Người chăm sóc', render: (r) => r.sitterName ?? 'Chưa phân công' },
            {
              key: 'state',
              label: 'Trạng thái',
              render: (r) => r.late ? <OperationsBadge tone="danger">Chưa check-in, cần kiểm tra</OperationsBadge> : <VisitBoardStatus row={r} />,
            },
          ]}
        /></div>
        {today?.hasMore && (
          <p className="ops-muted">
            Đang hiển thị 50 buổi đầu tiên trên tổng {today.summary.total} buổi. Báo cáo phía trên tính toàn
            bộ ngày.
          </p>
        )}
      </section>}
      {active && (
        <Dialog
          open
          title="Chi tiết điều phối"
          className="ops-dialog dispatch-detail-dialog"
          dismissible={!command.busy && !command.pending}
          onClose={closeVisit}
        >
          <div className="dispatch-detail-layout"><aside className="dispatch-visit-summary"><h3>{active.serviceDisplayName || active.serviceName || 'Chưa rõ dịch vụ'}</h3>
          <p>
            {time(active.startAt)} – {time(active.endAt)} · {area(active.areaCode)}
          </p>
          <p>
            {active.customerName ?? 'Khách hàng'} ·{' '}
            {active.reviewCode ? reviewLabel(active.reviewCode) : 'Hệ thống đang điều phối'}
          </p>
          {active.diagnostics && <details><summary>Kết quả kiểm tra điều kiện</summary><DispatchDiagnostics value={active.diagnostics} /></details>}
          </aside><div className="dispatch-detail-work">{active.pendingInvitation ? (
            <div className="dispatch-invitation-header">
              <div><p>{active.pendingInvitationCount ?? 1} lời mời đang chờ phản hồi</p>
                <small>Hạn gần nhất {time(active.pendingInvitation.earliestDeadline ?? active.pendingInvitation.deadline)}</small>
              </div>
              {!active.requestedSitterId && active.reviewCode !== 'SHIFT_START_REACHED' && api.candidates && (
                <Button variant="secondary" aria-expanded={addingInvitation} onClick={() => setAddingInvitation(value => !value)}>
                  {addingInvitation ? 'Đóng danh sách chọn' : 'Gửi thêm lời mời'}
                </Button>
              )}
            </div>
          ) : active.reviewCode === 'SHIFT_START_REACHED' ? (
            <p>Cần khách xác nhận lịch mới trước khi tìm lại.</p>
          ) : active.dispatchState === 'NEEDS_STAFF' && api.candidates ? (
            <DispatchSitterPicker key={`${active.id}:${active.version}`} row={active} api={api} command={command} selectedSitter={selectedSitter} onProposed={setProposal} />
          ) : active.dispatchState === 'NEEDS_STAFF' ? (
            <Button
              disabled={
                command.busy ||
                command.pending ||
                !validSelection ||
                Boolean(
                  selectedSitter && active.requestedSitterId && active.requestedSitterId !== selectedSitter,
                )
              }
              onClick={() =>
                command.execute((key) =>
                  api.invite(active.id, active.version, key, selectedSitter || undefined),
                )
              }
            >
              <Send size={18} />
              {selectedSitter ? 'Mời người đã chọn' : 'Thử tìm lại'}
            </Button>
          ) : (
            <p>Hệ thống đang tìm người nhận ca</p>
          )}
          {addingInvitation && active.pendingInvitation && !active.requestedSitterId && active.reviewCode !== 'SHIFT_START_REACHED' && api.candidates && (
            <DispatchSitterPicker key={`additional:${active.id}:${active.version}`} row={active} api={api} command={command}
              selectedSitter={selectedSitter} onProposed={setProposal} additional />
          )}
          <DispatchRanking ranking={active.dispatchRanking} latestOffers={active.latestOffers}
            loading={selectedDetails.status === 'loading'} failed={['error', 'forbidden', 'pending'].includes(selectedDetails.status)}
            onRetry={selectedDetails.retry} />
          {active.dispatchState === 'NEEDS_STAFF' && !active.pendingInvitation && api.candidates && (
            <DispatchRecoveryPanel
              key={`${active.id}:${active.version}`}
              row={active}
              workAreas={queue.data?.workAreas}
              api={api}
              command={command}
              selectedSitter={selectedSitter}
              onProposed={setProposal}
            />
          )}
          {command.message && <p role="status">{command.message}</p>}
          {command.pending && (
            <Button disabled={command.busy} onClick={command.retry}>
              Kiểm tra lại yêu cầu
            </Button>
          )}
          </div></div>
        </Dialog>
      )}
      {visitTravelEnabled && api.travelVisits && <StaffTravelMonitor api={api} />}
    </section>
  );
}
