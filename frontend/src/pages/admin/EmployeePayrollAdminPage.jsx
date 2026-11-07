import {
  OperationsMetrics,
  OperationsTable,
  OperationsBadge,
} from '../../components/common/OperationsWorkspace.jsx';
import { Dialog } from '../../components/ui/index.js';
import { AutomaticPayrollForm } from '../../components/payroll/AutomaticPayrollForm.jsx';
import { useCallback, useRef, useState } from 'react';
import { usePayrollWorkspace } from '../../hooks/usePayrollWorkspace.js';
import {
  PayrollStatement,
  PayrollAdjustment,
  PayrollField,
  PayrollLoadState,
  PayrollPager,
  money,
  payrollStatus,
} from '../../components/payroll/PayrollDetails.jsx';
import {
  PayrollAdjustmentForm,
  PayrollAdjustmentDecision,
} from '../../components/payroll/PayrollAdjustmentForms.jsx';
import { EmployeeContractForm } from '../../components/payroll/EmployeeContractForm.jsx';

const employeeField = {
  label: 'Mã nhân viên',
  name: 'employeeId',
  pattern: '[a-fA-F0-9]{24}',
  maxLength: 24,
};
const numberValue = (data, key) => Number(data.get(key));
const numericFields = [
  ['scheduledMonthMinutes', 'Tổng phút công chuẩn tháng', 1],
  ['paidPeriodMinutes', 'Phút công được trả kỳ này', 0],
  ['kpiTargetMinutes', 'Mục tiêu phút chăm sóc tháng đã duyệt', 0],
  ['overtimeVnd', 'Làm thêm / ban đêm (VND)', 0],
  ['employeeInsuranceVnd', 'Bảo hiểm NLĐ đã xác minh (VND)', 0],
  ['incomeTaxVnd', 'Thuế TNCN đã xác minh (VND)', 0],
  ['otherLawfulDeductionsVnd', 'Khấu trừ hợp lệ khác (VND)', 0],
];
function DecisionForm({ row, kind, state, api }) {
  const decide = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      data = new window.FormData(form);
    const body = { expectedVersion: row.version, action: data.get('action') };
    if (body.action === 'REJECT') body.reason = data.get('reason');
    if (body.action === 'RECORD_PAYMENT') body.transferReference = data.get('transferReference');
    await state.command(`${kind}:${row.id}`, body, (key) =>
      api[kind === 'advance' ? 'advanceDecision' : 'statementDecision'](row.id, body, key),
    );
  };
  const [action, setAction] = useState('APPROVE');
  if (!['SUBMITTED', 'PREPARED', 'APPROVED'].includes(row.status)) return null;
  return (
    <form className="payroll-form" onSubmit={decide}>
      {row.status === 'APPROVED' ? (
        <>
          <input type="hidden" name="action" value="RECORD_PAYMENT" />
          <PayrollField
            label="Mã giao dịch ngân hàng đã thực hiện"
            name="transferReference"
            maxLength={160}
          />
          <button disabled={state.busy} type="submit">
            Ghi nhận đã chi trả
          </button>
        </>
      ) : (
        <>
          <label className="payroll-field">
            <span>Quyết định</span>
            <select name="action" value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="APPROVE">Duyệt</option>
              <option value="REJECT">{kind === 'advance' ? 'Từ chối' : 'Hủy phiếu chờ duyệt'}</option>
            </select>
          </label>
          {action === 'REJECT' && <PayrollField label="Lý do từ chối" name="reason" maxLength={1000} />}
          <button disabled={state.busy} type="submit">
            Lưu quyết định
          </button>
        </>
      )}
    </form>
  );
}

export function EmployeePayrollAdminPage({ api, employeeApi }) {
  const loadEmployee = useCallback((id, options) => employeeApi.get(id, options), [employeeApi]);
  const [advancePages, setAdvancePages] = useState([null]),
    [statementPages, setStatementPages] = useState([null]);
  const [adjustmentPages, setAdjustmentPages] = useState([null]);
  const [history, setHistory] = useState(false);
  const advanceCursor = advancePages.at(-1),
    statementCursor = statementPages.at(-1);
  const adjustmentCursor = adjustmentPages.at(-1);
  const load = useCallback(
    async ({ signal }) => {
      const [advances, statements, adjustments, overview] = await Promise.all([
        api.advances({ signal, cursor: advanceCursor, view: history ? 'HISTORY' : 'PENDING' }),
        api.statements({ signal, cursor: statementCursor }),
        api.adjustments({ signal, cursor: adjustmentCursor }),
        api.overview ? api.overview({ signal }) : Promise.resolve(null),
      ]);
      return {
        summary: overview?.summary,
        advances: advances.items,
        statements: statements.items,
        adjustments: adjustments.items,
        advanceNextCursor: advances.nextCursor,
        statementNextCursor: statements.nextCursor,
        adjustmentNextCursor: adjustments.nextCursor,
      };
    },
    [api, advanceCursor, statementCursor, adjustmentCursor, history],
  );
  const state = usePayrollWorkspace(load);
  const [selected, setSelected] = useState(null);
  const [uncertain, setUncertain] = useState(null);
  const modalState = {
    ...state,
    command: (operation, body, execute) =>
      state.command(operation, body, async (key) => {
        try {
          const result = await execute(key);
          setUncertain(null);
          return result;
        } catch (error) {
          setUncertain(
            !error.status || error.status >= 500 || error.code === 'INVALID_RESPONSE'
              ? { operation, body, execute }
              : null,
          );
          throw error;
        }
      }),
  };
  const [installments, setInstallments] = useState([]);
  const contractBody = useRef(null);
  const [contractLocked, setContractLocked] = useState(false),
    [contractRevision, setContractRevision] = useState(0);
  const saveContract = async (body) => {
    contractBody.current ??= body;
    const saved = await state.command('contract', contractBody.current, async (key) => {
      try {
        return await api.contract(contractBody.current, key);
      } catch (error) {
        const uncertain =
          !error.status ||
          error.status >= 500 ||
          ['TIMEOUT', 'NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code);
        setContractLocked(uncertain);
        if (!uncertain) {
          contractBody.current = null;
          if (error.code === 'VERSION_CONFLICT') setContractRevision((value) => value + 1);
        }
        throw error;
      }
    });
    if (saved) {
      contractBody.current = null;
      setContractLocked(false);
      setContractRevision((value) => value + 1);
    }
    return saved;
  };
  const prepare = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      data = new window.FormData(form);
    const body = {
      employeeId: data.get('employeeId'),
      ...Object.fromEntries(
        ['periodStart', 'periodEnd', 'dueAt'].map((key) => [key, `${data.get(key)}T00:00:00+07:00`]),
      ),
      ...Object.fromEntries(numericFields.map(([key]) => [key, numberValue(data, key)])),
      seriousViolationConfirmed: data.get('seriousViolationConfirmed') === 'on',
      includeMonthlyBonus: data.get('includeMonthlyBonus') === 'on',
      assessmentReference: data.get('assessmentReference'),
      deductionConsentReference: data.get('deductionConsentReference'),
      advanceRepayments: installments.map((item) => ({
        advanceId: data.get(`advance:${item}`),
        amountVnd: numberValue(data, `amount:${item}`),
        agreementReference: data.get(`agreement:${item}`),
      })),
    };
    if (await state.command('prepare', body, (key) => api.prepare(body, key))) {
      form.reset();
      setInstallments([]);
    }
  };
  const selectedRow = selected && state.data?.[selected.kind].find((r) => r.id === selected.id),
    summary = state.data?.summary;
  const badge = (row) => (
    <OperationsBadge
      tone={
        row.status === 'PAID'
          ? 'success'
          : ['PREPARED', 'SUBMITTED'].includes(row.status)
            ? 'warning'
            : row.status === 'APPROVED'
              ? 'info'
              : 'neutral'
      }
    >
      {payrollStatus(row.status)}
    </OperationsBadge>
  );
  return (
    <section className="ops-workspace payroll-workspace">
      <header>
        <div>
          <h1>Quản lý lương</h1>
          <p className="ops-muted">
            Đối chiếu phiếu lương, tạm ứng và các khoản điều chỉnh trước khi chi trả.
          </p>
        </div>
        <button disabled={state.busy || !!uncertain} onClick={state.refresh}>
          Tải lại
        </button>
      </header>
      <PayrollLoadState state={state} />
      <OperationsMetrics
        items={[
          { label: 'Tổng phiếu đã lập', value: summary?.total },
          { label: 'Phiếu chờ duyệt', value: summary?.prepared },
          { label: 'Đã duyệt, chờ chi', value: summary ? money(summary.awaitingPaymentVnd) : null },
          { label: 'Tạm ứng chờ duyệt', value: summary?.pendingAdvances },
        ]}
        caption="Báo cáo toàn bộ phiếu hiện có. Chờ chi chỉ gồm phiếu đã duyệt, chưa ghi nhận trả; không phải số dư ngân hàng."
      />
      <details className="ops-builder">
        <summary>Lập phiếu lương từ hợp đồng và dữ liệu công</summary>
        <AutomaticPayrollForm onSaved={state.refresh} />
      </details>
      <p>Hợp đồng tuyển mới được soạn, in và xác minh ngay trong hồ sơ ứng viên trước khi hoàn tất duyệt.</p>
      <section className="ops-builder">
        <details>
          <summary>Xác minh hợp đồng cũ / thay đổi hợp đồng</summary>
          <EmployeeContractForm
            key={contractRevision}
            busy={state.busy}
            locked={contractLocked}
            onSave={saveContract}
            loadEmployee={employeeApi ? loadEmployee : undefined}
          />
        </details>
      </section>
      <section className="ops-builder">
        <details>
          <summary>Đối soát nâng cao: lập phiếu từ hồ sơ đã chốt riêng</summary>
          <form onSubmit={prepare}>
            <div className="payroll-form">
              <PayrollField {...employeeField} />
              <PayrollField label="Từ ngày" name="periodStart" type="date" />
              <PayrollField label="Đến trước ngày" name="periodEnd" type="date" />
              <PayrollField label="Hạn trả" name="dueAt" type="date" />
              {numericFields.map(([name, label, min]) => (
                <PayrollField key={name} label={label} name={name} type="number" min={min} step="1" />
              ))}
              <PayrollField
                label="Mã hồ sơ công / thuế / bảo hiểm đã xác minh"
                name="assessmentReference"
                maxLength={160}
              />
              <PayrollField
                label="Căn cứ khấu trừ / thỏa thuận"
                name="deductionConsentReference"
                maxLength={160}
              />
            </div>
            <p>
              <label className="payroll-check">
                <input type="checkbox" name="includeMonthlyBonus" />
                Chốt thưởng KPI tháng đã kết thúc
              </label>
            </p>
            <p>
              <label className="payroll-check">
                <input type="checkbox" name="seriousViolationConfirmed" />
                Có vi phạm nghiêm trọng đã kết luận trong tháng
              </label>
            </p>
            {installments.map((item) => (
              <div key={item} className="payroll-form">
                <PayrollField label="Mã tạm ứng đã chi" name={`advance:${item}`} pattern="[a-fA-F0-9]{24}" />
                <PayrollField
                  label="Số tiền đối trừ kỳ này (VND)"
                  name={`amount:${item}`}
                  type="number"
                  min="1"
                  step="1"
                />
                <PayrollField
                  label="Mã thỏa thuận trả khoản ứng"
                  name={`agreement:${item}`}
                  maxLength={160}
                />
                <button
                  type="button"
                  onClick={() => setInstallments((rows) => rows.filter((id) => id !== item))}
                >
                  Bỏ khoản đối trừ
                </button>
              </div>
            ))}
            <div className="payroll-form">
              <button
                type="button"
                disabled={installments.length >= 12 || state.busy}
                onClick={() => setInstallments((rows) => [...rows, globalThis.crypto.randomUUID()])}
              >
                Thêm khoản đối trừ tạm ứng
              </button>
              <button disabled={state.busy} type="submit">
                Lập phiếu lương
              </button>
            </div>
          </form>
        </details>
      </section>
      <section className="ops-section">
        <header>
          <h2>{history ? 'Lịch sử tạm ứng' : 'Tạm ứng chờ xử lý'}</h2>
          <label>
            <input
              type="checkbox"
              checked={history}
              disabled={state.busy}
              onChange={(event) => {
                setHistory(event.target.checked);
                setAdvancePages([null]);
              }}
            />
            Hiện lịch sử tạm ứng
          </label>
        </header>
        <OperationsTable
          label="Đề nghị tạm ứng"
          rows={state.data?.advances ?? []}
          empty={history ? 'Chưa có đề nghị tạm ứng.' : 'Không có đề nghị chờ xử lý.'}
          columns={[
            {
              key: 'employee',
              label: 'Nhân viên',
              render: (r) => r.employeeName ?? r.employeeId ?? 'Đối chiếu hồ sơ',
            },
            { key: 'amount', label: 'Số tiền', render: (r) => money(r.amountVnd) },
            { key: 'monthKey', label: 'Tháng đề nghị' },
            { key: 'settlementPeriod', label: 'Kỳ đối trừ' },
            { key: 'state', label: 'Trạng thái', render: badge },
            {
              key: 'action',
              label: 'Thao tác',
              render: (r) => (
                <button disabled={state.busy} onClick={() => setSelected({ kind: 'advances', id: r.id })}>
                  Xem / xử lý
                </button>
              ),
            },
          ]}
        />
        <PayrollPager
          label="tạm ứng"
          pages={advancePages}
          setPages={setAdvancePages}
          nextCursor={state.data?.advanceNextCursor}
          busy={state.busy}
        />
      </section>
      <section className="ops-section">
        <header>
          <h2>Phiếu lương</h2>
          <p className="ops-muted">
            Mở từng phiếu để xem cách tính, in, duyệt hoặc ghi nhận giao dịch đã thực hiện.
          </p>
        </header>
        <OperationsTable
          label="Danh sách phiếu lương"
          rows={state.data?.statements ?? []}
          empty="Chưa có phiếu lương."
          columns={[
            {
              key: 'reference',
              label: 'Số phiếu',
              render: (r) => <span title={r.id}>{r.reference ?? '…' + r.id.slice(-6)}</span>,
            },
            {
              key: 'employee',
              label: 'Nhân viên',
              render: (r) => (
                <>
                  {r.employeeName ?? r.employeeId}
                  <small>{r.employeeCode ?? ''}</small>
                </>
              ),
            },
            {
              key: 'period',
              label: 'Kỳ lương',
              render: (r) => (
                <>
                  {new Date(r.periodStart).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} –{' '}
                  {new Date(r.periodEnd).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                </>
              ),
            },
            { key: 'gross', label: 'Tổng gross', render: (r) => money(r.breakdown.grossVnd) },
            { key: 'payable', label: 'Thực nhận', render: (r) => money(r.breakdown.payableVnd) },
            { key: 'state', label: 'Trạng thái', render: badge },
            {
              key: 'action',
              label: 'Thao tác',
              render: (r) => (
                <button disabled={state.busy} onClick={() => setSelected({ kind: 'statements', id: r.id })}>
                  Xem phiếu / xử lý
                </button>
              ),
            },
          ]}
        />
        <PayrollPager
          label="phiếu lương"
          pages={statementPages}
          setPages={setStatementPages}
          nextCursor={state.data?.statementNextCursor}
          busy={state.busy}
        />
      </section>
      <section className="ops-section">
        <header>
          <h2>Điều chỉnh lương</h2>
        </header>
        <OperationsTable
          label="Danh sách điều chỉnh"
          rows={state.data?.adjustments ?? []}
          empty="Chưa có điều chỉnh."
          columns={[
            { key: 'employeeId', label: 'Nhân viên' },
            {
              key: 'direction',
              label: 'Hướng điều chỉnh',
              render: (r) => (r.direction === 'SUPPLEMENT' ? 'Chi bổ sung' : 'Đối soát thu hồi'),
            },
            { key: 'amount', label: 'Số tiền', render: (r) => money(r.amountVnd) },
            { key: 'reason', label: 'Lý do' },
            { key: 'state', label: 'Trạng thái', render: badge },
            {
              key: 'action',
              label: 'Thao tác',
              render: (r) => (
                <button disabled={state.busy} onClick={() => setSelected({ kind: 'adjustments', id: r.id })}>
                  Xem điều chỉnh
                </button>
              ),
            },
          ]}
        />
        <PayrollPager
          label="điều chỉnh"
          pages={adjustmentPages}
          setPages={setAdjustmentPages}
          nextCursor={state.data?.adjustmentNextCursor}
          busy={state.busy}
        />
      </section>
      {selectedRow && (
        <Dialog
          open
          title={
            selected.kind === 'statements'
              ? 'Chi tiết phiếu lương'
              : selected.kind === 'advances'
                ? 'Đối chiếu tạm ứng'
                : 'Chi tiết điều chỉnh'
          }
          className="ops-dialog"
          dismissible={!state.busy && !uncertain}
          onClose={() => setSelected(null)}
        >
          <PayrollLoadState state={state} />
          {uncertain && (
            <p role="status">Chưa nhận được xác nhận. Giữ nguyên nội dung để kiểm tra lại cùng yêu cầu.</p>
          )}
          {uncertain && (
            <button
              disabled={state.busy}
              onClick={() => modalState.command(uncertain.operation, uncertain.body, uncertain.execute)}
            >
              Kiểm tra lại cùng yêu cầu
            </button>
          )}
          <fieldset disabled={state.busy || !!uncertain}>
            {selected.kind === 'statements' ? (
              <PayrollStatement key={selectedRow.id + selectedRow.version} statement={selectedRow}>
                <p>Nhân viên: {selectedRow.employeeName ?? selectedRow.employeeId}</p>
                <DecisionForm row={selectedRow} kind="statement" state={modalState} api={api} />
                <PayrollAdjustmentForm statement={selectedRow} state={modalState} api={api} />
              </PayrollStatement>
            ) : selected.kind === 'advances' ? (
              <>
                <p>
                  {money(selectedRow.amountVnd)} · {payrollStatus(selectedRow.status)}
                </p>
                <p>{selectedRow.reason}</p>
                {selectedRow.decisionReason && <p>{selectedRow.decisionReason}</p>}
                <DecisionForm
                  key={selectedRow.id + selectedRow.version}
                  row={selectedRow}
                  kind="advance"
                  state={modalState}
                  api={api}
                />
              </>
            ) : (
              <PayrollAdjustment row={selectedRow}>
                <p>Hồ sơ đánh giá: {selectedRow.assessmentReference}</p>
                {selectedRow.agreementReference && <p>Thỏa thuận: {selectedRow.agreementReference}</p>}
                {selectedRow.resolutionReference && <p>Hồ sơ kết luận: {selectedRow.resolutionReference}</p>}
                {selectedRow.transferReference && <p>Giao dịch: {selectedRow.transferReference}</p>}
                <PayrollAdjustmentDecision row={selectedRow} state={modalState} api={api} />
              </PayrollAdjustment>
            )}
          </fieldset>
        </Dialog>
      )}
    </section>
  );
}
