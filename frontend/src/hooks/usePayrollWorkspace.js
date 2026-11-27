import { useCallback, useEffect, useRef, useState } from 'react';

const PAYROLL_ERROR_MESSAGES = {
  PAYROLL_COMMISSION_HELD: 'Hoa hồng của booking đang được tạm giữ. Nếu chưa chi trả, hãy hủy bảng chưa chi và lập lại bảng lương; lương cơ bản và phụ cấp không bị khấu trừ. Hoặc chờ Admin kết luận khiếu nại/hoàn tiền.',
  PAYROLL_CONTRACT_CYCLE_REVIEW_REQUIRED: 'Cần xác minh hợp đồng trả lương hằng tháng trước khi lập bảng lương.',
  ADVANCE_MONTH_ALREADY_USED: 'Tháng này bạn đã có một đề nghị tạm ứng. Mỗi tháng chỉ gửi được một đề nghị.',
  ADVANCE_LIMIT_EXCEEDED: 'Số tiền tạm ứng vượt quá hạn mức cho phép của hợp đồng.',
  CONTRACT_REQUIRED: 'Bạn cần có hợp đồng đang hiệu lực để gửi đề nghị tạm ứng.',
  EMPLOYEE_NOT_ACTIVE: 'Tài khoản hiện không ở trạng thái hoạt động nên chưa gửi được đề nghị.'
};

export function usePayrollWorkspace(load) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageKind, setMessageKind] = useState(null);
  const keys = useRef(new Map());
  const locked = useRef(false);
  const controller = useRef(null);
  const mounted = useRef(false);
  const clearMessage = useCallback(() => { setMessage(null); setMessageKind(null); }, []);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setState({ loading: true, data: null, error: null });
    try {
      const data = await load({ signal: current.signal });
      if (!current.signal.aborted) setState({ loading: false, data, error: null });
    } catch (error) {
      if (!current.signal.aborted) setState({ loading: false, data: null, error: error.code || 'NETWORK_ERROR' });
    }
  }, [load]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; controller.current?.abort(); }; }, [refresh]);
  const command = async (operation, body, execute, { successMessage = 'Đã lưu.' } = {}) => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setMessage(null); setMessageKind(null);
    const fingerprint = JSON.stringify([operation, body]);
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, `payroll:${globalThis.crypto.randomUUID()}`);
    try {
      await execute(keys.current.get(fingerprint));
      keys.current.delete(fingerprint);
      if (mounted.current) { setMessage(successMessage); setMessageKind('success'); await refresh(); }
      return true;
    } catch (error) {
      if (mounted.current) {
        setMessageKind('error');
        setMessage(PAYROLL_ERROR_MESSAGES[error?.code] ?? `Chưa xác nhận được thao tác (${error?.code || 'NETWORK_ERROR'}).`);
      }
      return false;
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  return { ...state, busy, message, messageKind, clearMessage, refresh, command };
}
