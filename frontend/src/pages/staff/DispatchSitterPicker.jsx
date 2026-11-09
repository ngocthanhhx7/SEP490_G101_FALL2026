import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/index.js';
import { dispatchReason } from '../../utils/dispatch-format.js';

export function DispatchSitterPicker({ row, api, command, selectedSitter }) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(row.requestedSitterId || selectedSitter || ''), generation = useRef(0);
  const location = useLocation(), prefix = location.pathname.startsWith('/admin') ? '/admin' : '/staff';
  const disabled = command.busy || command.pending;
  const find = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setResult(null); setError('');
    try { const response = await api.candidates(row.id, { startAt: row.startAt, mode: 'MANUAL' });
      if (generation.current === current) { setResult(response.data); setSelected(value => response.data.items.some(item => item.sitterId === value) ? value : ''); }
    } catch (failure) { if (generation.current === current) setError(failure.status === 429 ? 'Đã kiểm tra nhiều lần. Chờ một phút rồi tải lại.' : 'Chưa kiểm tra được người chăm sóc. Hãy tải lại danh sách.'); }
    finally { if (generation.current === current) setLoading(false); }
  }, [api, row.id, row.startAt]);
  useEffect(() => { find(); return () => { generation.current++; }; }, [find]);
  return <section className="dispatch-picker" aria-label="Chọn người chăm sóc cho lịch hiện tại"><h3>Chỉ định cho lịch hiện tại</h3>
    <p>Giữ nguyên giờ khách đã đặt. Người được mời vẫn cần chấp nhận trước khi nhận ca. Sitter mới đã đủ điều kiện có thể được chọn ngay.</p>
    {row.requestedSitterId && <p>Khách đã chọn người chăm sóc; chỉ người này được nhận lời mời.</p>}
    {loading && <p role="status">Đang kiểm tra lịch, năng lực và hợp đồng…</p>}{error && <p role="alert">{error}</p>}
    {result && <><p>{result.items.length} người có thể mời · {result.blocked?.length ?? 0} người cần bổ sung điều kiện</p>
      <fieldset className="dispatch-candidate-list"><legend>Chọn một người chăm sóc</legend>{result.items.map(item => <label key={item.sitterId} className="dispatch-candidate"><input type="radio" name="dispatch-sitter" value={item.sitterId} checked={selected === item.sitterId} disabled={disabled} onChange={() => setSelected(item.sitterId)} /><span><strong>{item.displayName ?? 'Người chăm sóc'}</strong><small>Đủ điều kiện tại thời điểm kiểm tra</small></span></label>)}</fieldset>
      {!result.items.length && <p>Chưa thể gửi lời mời. Xử lý điều kiện còn thiếu bên dưới rồi kiểm tra lại.</p>}
      <div className="dispatch-blocked-list">{result.blocked?.map(item => <div key={item.sitterId}><strong>{item.displayName ?? 'Người chăm sóc'}</strong><p>{dispatchReason(item.reason)}</p><Link to={`${prefix}/sitters/${item.sitterId}?tab=${['OUTSIDE_WORKING_HOURS', 'WORK_AREA_MISMATCH', 'DAY_OFF'].includes(item.reason) ? 'schedule' : 'capability'}`}>Mở hồ sơ để xử lý</Link></div>)}</div>
    </>}
    <div className="dispatch-picker-actions"><Button variant="secondary" disabled={disabled || loading} onClick={find}>Kiểm tra lại danh sách</Button>
      <Button disabled={disabled || loading || !result?.items.some(item => item.sitterId === selected)} onClick={() => command.execute(key => api.invite(row.id, row.version, key, selected))}>Gửi lời mời cho người đã chọn</Button></div>
  </section>;
}
