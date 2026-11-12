import { useRef, useState } from 'react';
import { Button, Input, Select } from '../../components/ui/index.js';
import { dispatchReason } from '../../utils/dispatch-format.js';

export function DispatchDiagnostics({ value }) {
  if (!value) return null;
  return <div><p>Đã xét {value.registered} nhân viên đăng ký khu vực · {value.eligible} người đủ điều kiện.</p>
    <ul>{Object.entries(value.rejected ?? {}).map(([code, count]) => <li key={code}>{dispatchReason(code)}: {count}</li>)}</ul></div>;
}

export function DispatchRecoveryPanel({ row, workAreas = [], api, command, selectedSitter, onProposed }) {
  const [startAt, setStartAt] = useState(''), [areaCode, setAreaCode] = useState(row.areaCode);
  const [result, setResult] = useState(null), [sitterId, setSitterId] = useState('');
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const generation = useRef(0);
  const disabled = command.busy || command.pending;
  const change = update => { generation.current++; setLoading(false); setResult(null); setSitterId(''); setError(''); update(); };
  async function find(event) {
    event.preventDefault(); const current = ++generation.current;
    setLoading(true); setResult(null); setError(''); setSitterId('');
    try {
      const response = await api.candidates(row.id, { startAt: `${startAt}:00+07:00`, areaCode, ...(row.requestedSitterId ? { mode: 'REPLACEMENT' } : {}) });
      if (generation.current !== current) return;
      setResult(response.data);
      const preferred = row.requestedSitterId || selectedSitter;
      setSitterId(response.data.items.find(item => item.sitterId === preferred)?.sitterId ?? '');
    } catch (failure) { if (generation.current === current) setError(failure.status === 429 ? 'Đã kiểm tra nhiều lần. Vui lòng chờ một phút.' : 'Chưa kiểm tra được ứng viên. Hãy thử lại.'); }
    finally { if (generation.current === current) setLoading(false); }
  }
  if (row.boarding) return <p>Ca lưu trú cần xem lại toàn bộ kỳ lưu trú trước khi đổi lịch.</p>;
  return <details><summary>Đề xuất lịch hoặc người thay thế</summary>
    <p>Lịch và người được chỉ định chỉ thay đổi sau khi khách xác nhận. Có thể giữ giờ đã đặt để đề xuất người thay thế; người đó vẫn cần nhận lời mời.</p>
    <form onSubmit={find}>
      <Input label="Bắt đầu đề xuất" type="datetime-local" required value={startAt} disabled={disabled}
        onChange={event => change(() => setStartAt(event.target.value))} />
      {row.location === 'HOME' && <Select label="Khu vực tại địa chỉ đã đặt" value={areaCode} disabled={disabled}
        onChange={event => change(() => setAreaCode(event.target.value))}>
        <option value={row.areaCode}>{workAreas.find(area => area.code === row.areaCode)?.label ?? row.areaCode}</option>
        {workAreas.filter(area => area.parentCode === row.areaCode).map(area => <option key={area.code} value={area.code}>{area.label}</option>)}
      </Select>}
      {row.location === 'HOME' && workAreas.some(area => area.parentCode === row.areaCode) && <p>Chọn đúng khu vực cụ thể theo địa chỉ khách đã đặt; không thay đổi vị trí ghim. Nhân viên đăng ký một khu vực không nhận việc trên toàn thành phố.</p>}
      <Button type="submit" disabled={disabled || loading}>{loading ? 'Đang kiểm tra…' : 'Kiểm tra người phù hợp'}</Button>
    </form>
    {error && <p role="alert">{error}</p>}
    <DispatchDiagnostics value={result?.diagnostics} />
    {result && !result.items.length && <p>Chưa có nhân viên phù hợp. Kiểm tra khu vực, lịch và năng lực trước khi đề xuất lại.</p>}
    {result?.items.length > 0 && <>
      <Select label="Người chăm sóc cho lịch đề xuất" value={sitterId} disabled={disabled} onChange={event => setSitterId(event.target.value)}>
        <option value="">Chọn người chăm sóc</option>{result.items.map(item => <option key={item.sitterId} value={item.sitterId}>{item.displayName}</option>)}
      </Select>
      <p>Đủ điều kiện tại thời điểm kiểm tra; hệ thống kiểm tra lại khi khách xác nhận và nhân viên nhận ca.</p>
      <Button disabled={disabled || !sitterId} onClick={() => {
        const body = { expectedVersion: row.version, startAt: result.startAt, areaCode: result.areaCode, sitterId };
        command.execute(async key => { const response = await api.propose(row.id, body, key); onProposed(response.data); return response; });
      }}>Gửi đề xuất cho khách</Button>
    </>}
  </details>;
}
