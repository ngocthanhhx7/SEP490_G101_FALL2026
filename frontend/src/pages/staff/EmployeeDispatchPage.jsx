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
import { Button, Dialog } from '../../components/ui/index.js';
import { DispatchDiagnostics, DispatchRecoveryPanel } from './DispatchRecoveryPanel.jsx';
import { DispatchSitterPicker } from './DispatchSitterPicker.jsx';
import { StaffTravelMonitor } from './StaffTravelMonitor.jsx';
import '../../styles/employee-scheduling.css';

const time = (value) =>
  new Date(value).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
const visitLabel = {
  SCHEDULED: 'Chờ phân công',
  ASSIGNED: 'Đã nhận',
  IN_PROGRESS: 'Đang chăm sóc',
  COMPLETED: 'Đã xong',
  CANCELLED: 'Đã hủy',
  STAFF_CLOSED: 'Đã đóng',
};
const short = (id) => (id ? '…' + id.slice(-6) : '—');
const reviewLabel = (code) =>
  ({
    NO_ELIGIBLE_SITTER: 'Chưa có người chăm sóc đủ điều kiện nhận ca.',
    STAFF_REVIEW_REQUIRED: 'Các lời mời đã bị từ chối hoặc hết hạn.',
    DIRECTED_SCHEDULE_REVIEW_REQUIRED: 'Người được khách chỉ định chưa thể nhận ca.',
    TRAVEL_REVIEW_REQUIRED: 'Cần xác minh khả năng di chuyển.',
    DAY_ORIGIN_MISSING: 'Chưa có điểm xuất phát cho ngày làm việc.',
    DISPATCH_SEARCH_LIMIT: 'Số lượng hồ sơ vượt giới hạn tìm tự động. Cần điều phối kiểm tra.',
    SHIFT_START_REACHED: 'Đã đến giờ nhưng chưa có người nhận ca. Cần liên hệ khách để sắp xếp lại.',
  })[code] ?? 'Cần kiểm tra và sắp xếp người nhận ca.';
export function EmployeeDispatchPage({ api, selectedSitter }) {
  const validSelection = !selectedSitter || /^[a-f0-9]{24}$/i.test(selectedSitter);
  const load = useCallback(({ signal }) => api.queue({ signal }), [api]);
  const queue = useApiResource(load);
  const [selected, setSelected] = useState(null);
  const [proposal, setProposal] = useState(null);
  const command = useSchedulingCommand(() => queue.retry());
  const rows = queue.data?.items ?? [],
    active = rows.find((row) => row.id === selected),
    today = queue.data?.today;
  const area = (code) => queue.data?.workAreas?.find((a) => a.code === code)?.label ?? code ?? '—';
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
        <Button variant="secondary" aria-label="Tải lại lịch điều phối" onClick={queue.retry}>
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
      {!active && command.pending && (
        <Button disabled={command.busy} onClick={command.retry}>
          Kiểm tra lại yêu cầu
        </Button>
      )}
      {proposal && <p role="status">Đã gửi đề xuất lịch mới, đang chờ khách xác nhận.</p>}
      {queue.status === 'loading' && <p role="status">Đang tải ca…</p>}
      {['error', 'forbidden', 'pending'].includes(queue.status) && (
        <p role="alert">
          Chưa tải được các ca cần điều phối. <button onClick={queue.retry}>Thử lại</button>
        </p>
      )}
      <section className="ops-section">
        <header>
          <div>
            <h2>Cần xử lý</h2>
            <p className="ops-muted">
              Ca chờ điều phối, xếp theo giờ bắt đầu. Chỉ tìm lại sau khi hệ thống chuyển ca cần hỗ trợ.
            </p>
          </div>
        </header>
        <OperationsTable
          label="Ca cần điều phối"
          rows={rows}
          empty="Chưa có ca chờ điều phối."
          columns={[
            {
              key: 'visit',
              label: 'Buổi',
              render: (r) => (
                <>
                  <strong title={r.id}>{short(r.bookingId)}</strong>
                  <small>
                    {time(r.startAt)} – {time(r.endAt)}
                  </small>
                </>
              ),
            },
            { key: 'customerName', label: 'Khách hàng', render: (r) => r.customerName ?? 'Chưa có tên' },
            { key: 'serviceName', label: 'Dịch vụ' },
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
        />
        {queue.data?.queueHasMore && (
          <p className="ops-muted">
            Đang hiển thị 50 ca sớm nhất. Tải lại sau khi xử lý để xem các ca tiếp theo.
          </p>
        )}
      </section>
      <section className="ops-section">
        <header>
          <div>
            <h2>Buổi hôm nay</h2>
            <p className="ops-muted">
              Ca đã nhận nhưng chưa check-in sau 15 phút được đánh dấu cần kiểm tra. Không tự kết luận bỏ ca.
            </p>
          </div>
        </header>
        <OperationsTable
          label="Buổi chăm sóc hôm nay"
          rows={today?.items ?? []}
          empty={today ? 'Chưa có buổi chăm sóc hôm nay.' : 'Chưa có số liệu hôm nay.'}
          columns={[
            {
              key: 'time',
              label: 'Giờ',
              render: (r) => (
                <>
                  {time(r.startAt)}
                  <small>Đến {time(r.endAt)}</small>
                </>
              ),
            },
            {
              key: 'booking',
              label: 'Lịch đặt',
              render: (r) => <span title={r.bookingId}>{short(r.bookingId)}</span>,
            },
            { key: 'serviceName', label: 'Dịch vụ' },
            { key: 'area', label: 'Khu vực', render: (r) => area(r.areaCode) },
            { key: 'sitterName', label: 'Người chăm sóc', render: (r) => r.sitterName ?? 'Chưa phân công' },
            {
              key: 'state',
              label: 'Trạng thái',
              render: (r) => (
                <OperationsBadge
                  tone={
                    r.late
                      ? 'danger'
                      : r.state === 'COMPLETED'
                        ? 'success'
                        : r.state === 'IN_PROGRESS'
                          ? 'info'
                          : 'neutral'
                  }
                >
                  {r.late ? 'Chưa check-in, cần kiểm tra' : (visitLabel[r.state] ?? 'Cần đối chiếu')}
                </OperationsBadge>
              ),
            },
          ]}
        />
        {today?.hasMore && (
          <p className="ops-muted">
            Đang hiển thị 50 buổi đầu tiên trên tổng {today.summary.total} buổi. Báo cáo phía trên tính toàn
            bộ ngày.
          </p>
        )}
      </section>
      {active && (
        <Dialog
          open
          title="Chi tiết điều phối"
          className="ops-dialog dispatch-detail-dialog"
          dismissible={!command.busy && !command.pending}
          onClose={() => setSelected(null)}
        >
          <div className="dispatch-detail-layout"><aside className="dispatch-visit-summary"><h3>{active.serviceName}</h3>
          <p>
            {time(active.startAt)} – {time(active.endAt)} · {area(active.areaCode)}
          </p>
          <p>
            {active.customerName ?? 'Khách hàng'} ·{' '}
            {active.reviewCode ? reviewLabel(active.reviewCode) : 'Hệ thống đang điều phối'}
          </p>
          <details><summary>Kết quả tìm tự động gần nhất</summary><DispatchDiagnostics value={active.diagnostics} /><p>Danh sách chỉ định bên dưới được kiểm tra lại theo điều kiện mời thủ công cho lịch hiện tại.</p></details>
          </aside><div className="dispatch-detail-work">{active.pendingInvitation ? (
            <p>
              {active.pendingInvitationCount ?? 1} lời mời đang chờ phản hồi ·{' '}
              {time(active.pendingInvitation.deadline)}
            </p>
          ) : active.reviewCode === 'SHIFT_START_REACHED' ? (
            <p>Cần khách xác nhận lịch mới trước khi tìm lại.</p>
          ) : active.dispatchState === 'NEEDS_STAFF' && api.candidates ? (
            <DispatchSitterPicker key={`${active.id}:${active.version}`} row={active} api={api} command={command} selectedSitter={selectedSitter} />
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
      {api.travelVisits && <StaffTravelMonitor api={api} />}
    </section>
  );
}
