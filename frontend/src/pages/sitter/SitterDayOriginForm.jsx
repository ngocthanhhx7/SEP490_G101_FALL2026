import { useCallback, useRef, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { Button, Input } from '../../components/ui/index.js';
import { VietmapView } from '../../components/common/VietmapView.jsx';

export function SitterDayOriginForm({ api }) {
  const load = useCallback(({ signal }) => api.getOrigins({ signal }), [api]), resource = useApiResource(load);
  const [date, setDate] = useState(''), [from, setFrom] = useState('08:00'), [until, setUntil] = useState('18:00');
  const [coordinates, setCoordinates] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const operation = useRef(null), frozen = busy || Boolean(operation.current);
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    operation.current ??= { key: globalThis.crypto.randomUUID(), body: { expectedVersion: resource.data.version, localDate: date, coordinates,
      availableFrom: `${date}T${from}:00+07:00`, availableUntil: `${date}T${until}:00+07:00` } };
    try { const result = await api.saveOrigin(operation.current.body, operation.current.key);
      if (result.pending || result.data?.version !== operation.current.body.expectedVersion + 1) throw new Error('Unknown outcome');
      operation.current = null; setMessage('Đã lưu điểm xuất phát. Hệ thống dùng để kiểm tra thời gian đi và về trước khi mời ca.'); resource.retry();
    } catch (error) { setMessage(error.code === 'VERSION_CONFLICT' ? 'Hồ sơ đã đổi. Tải lại trước khi lưu.' : 'Chưa xác nhận được kết quả. Kiểm tra ngày, giờ, hợp đồng rồi thử lại.');
      if (error.status && error.status < 500) operation.current = null;
    } finally { setBusy(false); }
  }
  return <section className="sitter-availability__safety"><h2>Điểm xuất phát theo ngày</h2><p>Khai báo nơi bắt đầu và kết thúc ngày làm việc để hệ thống kiểm tra đường đi khi đề xuất ca. Không thay thế lịch rảnh đã đăng ký.</p>
    {resource.status === 'loading' && <p>Đang tải…</p>}{resource.status === 'error' && <Button variant="secondary" onClick={resource.retry}>Tải lại điểm xuất phát</Button>}
    {resource.data && !resource.data.capabilityReady && <p>Nhờ Staff xác minh năng lực nhận việc trước khi khai báo điểm xuất phát.</p>}
    {resource.data?.capabilityReady && <><ul>{resource.data.items.map(item => <li key={item.localDate}>{item.localDate} · {new Date(item.availableFrom).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })} – {new Date(item.availableUntil).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</li>)}</ul>
    <form onSubmit={save}><fieldset disabled={frozen}><legend>Khai báo hoặc thay thế một ngày</legend>
      <Input label="Ngày làm việc" type="date" required value={date} onChange={e => setDate(e.target.value)} />
      <Input label="Có thể xuất phát từ" type="time" required value={from} onChange={e => setFrom(e.target.value)} />
      <Input label="Cần về điểm xuất phát trước" type="time" required value={until} onChange={e => setUntil(e.target.value)} />
      <VietmapView coordinates={coordinates} onSelect={setCoordinates} disabled={frozen} label="Chọn điểm xuất phát trên bản đồ" />
      <p>{coordinates ? 'Đã chọn điểm trên bản đồ.' : 'Bấm bản đồ để chọn đúng điểm xuất phát của bạn.'}</p>
    </fieldset><Button type="submit" disabled={busy || !coordinates}>{operation.current ? 'Kiểm tra lại thao tác' : 'Lưu điểm xuất phát'}</Button>
    <Button variant="secondary" disabled={busy} onClick={() => { operation.current = null; resource.retry(); }}>Tải lại dữ liệu</Button></form></>}
    {message && <p role="status">{message}</p>}
  </section>;
}
