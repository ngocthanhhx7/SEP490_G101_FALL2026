import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/index.js';
import { DispatchBlockedSection, DispatchCandidateOptions } from './DispatchCandidateList.jsx';

export function DispatchSitterPicker({ row, api, command, selectedSitter, onProposed, additional = false }) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(row.requestedSitterId || selectedSitter || ''), generation = useRef(0);
  const location = useLocation(), prefix = location.pathname.startsWith('/admin') ? '/admin' : '/staff';
  const disabled = command.busy || command.pending;
  const selectedCandidate = result?.items.find(item => item.sitterId === selected);
  const proposesReplacement = Boolean(row.requestedSitterId && selected && selected !== row.requestedSitterId);
  const directAssignment = !proposesReplacement && selectedCandidate?.canAssignDirectly === true;
  const find = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setResult(null); setError('');
    try { const response = await api.candidates(row.id, { startAt: row.startAt, mode: row.requestedSitterId ? 'REPLACEMENT' : 'MANUAL' });
      if (generation.current === current) { setResult(response.data); setSelected(value => response.data.items.some(item => item.sitterId === value) ? value : ''); }
    } catch (failure) { if (generation.current === current) setError(failure.status === 429 ? 'Đã kiểm tra nhiều lần. Chờ một phút rồi tải lại.' : 'Chưa kiểm tra được người chăm sóc. Hãy tải lại danh sách.'); }
    finally { if (generation.current === current) setLoading(false); }
  }, [api, row.id, row.startAt, row.requestedSitterId]);
  useEffect(() => { find(); return () => { generation.current++; }; }, [find]);
  return <section className="dispatch-picker" aria-label="Chọn người chăm sóc cho lịch hiện tại"><h3>{additional ? 'Mời thêm người chăm sóc' : 'Chỉ định cho lịch hiện tại'}</h3>
    <p>{additional ? 'Chọn một người chưa được mời. Người toàn thời gian đủ giờ làm sẽ được giao thẳng và các lời mời còn mở sẽ đóng.' : 'Giữ nguyên giờ khách đã đặt. Người toàn thời gian trong giờ đăng ký sẽ nhận ca ngay; trường hợp khác sẽ nhận lời mời.'}</p>
    {row.requestedSitterId && <p>Khách đã chỉ định người chăm sóc. Chọn người khác sẽ gửi đề xuất để khách xác nhận trước khi mời nhận ca.</p>}
    {loading && <p role="status">Đang kiểm tra lịch, năng lực và hợp đồng…</p>}{error && <p role="alert">{error}</p>}
    {result && <><p>{result.items.length} người đủ điều kiện xét giao hoặc mời · {result.blocked?.length ?? 0} người cần bổ sung điều kiện</p>
      {result.items.length > 0 && <DispatchCandidateOptions items={result.items} selected={selected} disabled={disabled} onSelect={setSelected} meta={item => `${item.employmentType === 'FULL_TIME' ? 'Toàn thời gian' : item.employmentType === 'PART_TIME' ? 'Bán thời gian' : 'Hợp đồng cần kiểm tra'} · ${item.canAssignDirectly ? 'Giao buổi trực tiếp' : 'Gửi lời mời'}`} />}
      {!result.items.length && <p>{additional ? 'Chưa có người phù hợp khác để mời.' : 'Chưa thể gửi lời mời. Xử lý điều kiện còn thiếu bên dưới rồi kiểm tra lại.'}</p>}
      {result.blocked?.length > 0 && <DispatchBlockedSection blocked={result.blocked} selected={selected} prefix={prefix} />}
    </>}
    <div className="dispatch-picker-actions"><Button variant="secondary" disabled={disabled || loading} onClick={find}>Kiểm tra lại danh sách</Button>
      <Button disabled={disabled || loading || !result?.items.some(item => item.sitterId === selected)} onClick={() => command.execute(async key => {
        if (row.requestedSitterId && selected !== row.requestedSitterId) {
          const response = await api.propose(row.id, { expectedVersion: row.version, startAt: row.startAt, sitterId: selected }, key);
          onProposed?.(response.data); return response;
        }
        return api.invite(row.id, row.version, key, selected);
      })}>{proposesReplacement ? 'Gửi đề xuất đổi người cho khách' : directAssignment ? 'Giao buổi' : additional ? 'Gửi lời mời bổ sung' : 'Gửi lời mời'}</Button></div>
  </section>;
}
