import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dialog, Input, Notice } from '../../components/ui/index.js';
import { changeUserRoles } from '../../services/user-admin-api.js';

const OPTIONS = [['CUSTOMER', 'Khách hàng'], ['PET_SITTER', 'Pet sitter'], ['STAFF', 'Nhân viên'], ['ADMIN', 'Quản trị viên']];
export function UserRolesDialog({ user, request, onClose, onChanged, onReload }) {
  const [roles, setRoles] = useState([...user.roles]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reconcile, setReconcile] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const changed = [...roles].sort().join(',') !== [...user.roles].sort().join(',');
  async function submit(event) {
    event.preventDefault();
    if (busy || reconcile) return;
    if (!roles.length || !changed || reason.trim().length < 3) { setError('Chọn ít nhất một vai trò khác hiện tại và nhập lý do từ 3 ký tự.'); return; }
    if (!confirm) { setConfirm(true); return; }
    setBusy(true); setError('');
    try {
      await changeUserRoles(request, user, roles, reason.trim());
      onChanged(user);
    } catch (failure) {
      const messages = {
        SELF_ROLE_CHANGE_FORBIDDEN: 'Một quản trị viên khác cần thực hiện thay đổi vai trò cho bạn.',
        SITTER_ROLE_MANAGED: 'Quyền Pet sitter được quản lý qua hồ sơ ứng tuyển và trạng thái nhân sự.',
        VERSION_CONFLICT: 'Tài khoản vừa thay đổi. Tải lại thông tin trước khi thực hiện tiếp.',
        FORBIDDEN: 'Bạn không còn quyền đổi vai trò. Vui lòng đăng nhập lại.',
        UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        VALIDATION_FAILED: 'Kiểm tra lại vai trò và lý do thay đổi.'
      };
      const uncertain = ['NETWORK_ERROR', 'TIMEOUT', 'INVALID_RESPONSE', 'ROLE_CHANGE_UNCERTAIN'].includes(failure.code);
      setReconcile(uncertain || failure.status === 409 || failure.status === 401 || failure.status === 403);
      setError(messages[failure.code] ?? (uncertain ? 'Chưa xác nhận được kết quả. Tải lại trạng thái tài khoản trước khi thao tác tiếp.' : 'Chưa đổi được vai trò. Vui lòng thử lại.'));
    } finally { setBusy(false); }
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} title={confirm ? 'Xác nhận đổi vai trò' : 'Đổi vai trò'}
    dismissible={!busy} description={user.displayName} footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button>
      {reconcile ? <Button onClick={onReload}>Tải lại trạng thái</Button> : <Button form="admin-role-decision" type="submit" loading={busy} loadingLabel="Đang cập nhật…" disabled={!roles.length || !changed || reason.trim().length < 3}>{confirm ? 'Xác nhận thay đổi' : 'Tiếp tục'}</Button>}
    </>}>
    <form id="admin-role-decision" className="admin-role-form" onSubmit={submit}>
      <fieldset hidden={confirm} disabled={busy || confirm || reconcile}><legend>Vai trò tài khoản</legend>
        <div className="admin-role-options">{OPTIONS.map(([value, label]) => <label key={value}>
          <input type="checkbox" checked={roles.includes(value)} disabled={value === 'PET_SITTER'}
            onChange={event => { setRoles(previous => event.target.checked ? [...previous, value] : previous.filter(role => role !== value)); setError(''); }} />{label}
        </label>)}</div>
      </fieldset>
      {!confirm && <>
        <p className="admin-muted">Quyền Pet sitter được cấp qua <Link to="/admin/sitter-applications">xét hồ sơ ứng tuyển</Link>; tạm ngưng hoặc khôi phục tại hồ sơ đã duyệt.</p>
        <Input label="Lý do đổi vai trò" value={reason} onChange={event => { setReason(event.target.value); setError(''); }} required minLength={3} maxLength={1000} disabled={busy || reconcile} />
      </>}
      {confirm && <Notice state="pending" title="Quyền truy cập sẽ thay đổi">
        <p>Vai trò hiện tại: {OPTIONS.filter(([value]) => user.roles.includes(value)).map(([, label]) => label).join(', ')}.</p>
        <p>Vai trò mới: {OPTIONS.filter(([value]) => roles.includes(value)).map(([, label]) => label).join(', ')}.</p>
        <p className="admin-role-reason">Lý do: {reason}</p>
        <p>Tất cả phiên của tài khoản sẽ bị thu hồi. Người dùng cần đăng nhập lại.</p>
        {!busy && !reconcile && <Button variant="ghost" onClick={() => setConfirm(false)}>Chỉnh lại</Button>}
      </Notice>}
      {error && <Notice state="error" title="Chưa hoàn tất">{error}</Notice>}
    </form>
  </Dialog>;
}
