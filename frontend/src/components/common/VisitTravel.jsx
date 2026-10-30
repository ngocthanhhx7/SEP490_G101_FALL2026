import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Navigation, Pause, RefreshCw } from 'lucide-react';
import { Button } from '../ui/index.js';

const states = { EN_ROUTE: 'Đang di chuyển', ARRIVED: 'Đã đến', STOPPED: 'Đã dừng chia sẻ', NOT_SHARING: 'Chưa chia sẻ vị trí' };
const routeNames = { GOOGLE_DRIVE_STATIC_ROAD_ETA: 'Google Maps · Ô tô',
  VIETMAP_V4_CAR_STATIC_ROAD_ETA: 'Vietmap · Ô tô', OSRM_STATIC_ROAD_ETA: 'OSRM · Ô tô' };
const errorText = error => error?.code === 'TRAVEL_WINDOW_CLOSED' ? 'Ngoài thời gian di chuyển của ca.' :
  error?.code === 'VERSION_CONFLICT' ? 'Trạng thái đã đổi. Vui lòng tải lại.' :
    error?.code === 'LOCATION_STALE' ? 'Chưa có vị trí mới để tính ETA.' : 'Chưa cập nhật được vị trí hoặc tuyến đường.';
const locate = () => new Promise((resolve, reject) => {
  if (!globalThis.navigator?.geolocation) { reject(new Error('GPS unavailable')); return; }
  globalThis.navigator.geolocation.getCurrentPosition(position => resolve({ coordinates: [position.coords.longitude, position.coords.latitude],
    accuracyMeters: position.coords.accuracy, observedAt: new Date(position.timestamp).toISOString() }), reject,
  { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
});
function TravelPanel({ api, visitId, employee }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [eta, setEta] = useState(null), [active, setActive] = useState(null);
  const sequence = useRef(0), live = useRef(null), mounted = useRef(true);
  const refresh = async () => {
    try { const result = await api.travel(visitId); if (mounted.current) { setData(result.data); setError(''); } }
    catch (failure) { if (mounted.current) setError(errorText(failure)); }
  };
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const poll = async () => {
      try { const result = await api.travel(visitId); if (!cancelled) setData(result.data); }
      catch (failure) { if (!cancelled) setError(errorText(failure)); }
    };
    poll(); const timer = globalThis.setInterval(poll, 30000);
    return () => {
      cancelled = true; mounted.current = false; sequence.current++; globalThis.clearInterval(timer);
      const sharing = live.current; live.current = null;
      if (sharing) api.travelCommand(visitId, { action: 'STOP', expectedVersion: sharing.version }).catch(() => {});
    };
  }, [api, visitId]);
  useEffect(() => {
    if (!active) return;
    let inflight = false;
    const timer = globalThis.setInterval(async () => {
      if (inflight || live.current?.sessionId !== active.sessionId) return;
      inflight = true;
      try {
        const position = await locate();
        if (live.current?.sessionId !== active.sessionId) return;
        const response = await api.travelLocation(visitId, { ...position, sessionId: active.sessionId });
        if (mounted.current && live.current?.sessionId === active.sessionId) { setData(response.data); setError(''); setEta(null); }
      } catch (failure) {
        if (mounted.current && live.current?.sessionId === active.sessionId) {
          setError(errorText(failure));
          if (['LOCATION_SHARING_STOPPED', 'TRAVEL_WINDOW_CLOSED', 'FORBIDDEN', 'UNAUTHENTICATED'].includes(failure.code)) { live.current = null; setActive(null); }
        }
      } finally { inflight = false; }
    }, 15000);
    return () => globalThis.clearInterval(timer);
  }, [active, api, visitId]);
  const command = async action => {
    if (busy || !data) return;
    const ticket = ++sequence.current; setBusy(true); setError(''); setEta(null);
    if (action !== 'START') { live.current = null; setActive(null); }
    try {
      const position = action === 'START' ? await locate() : null;
      if (ticket !== sequence.current) return;
      if (position && position.accuracyMeters > 100) throw new Error('GPS accuracy');
      const response = await api.travelCommand(visitId, { action, expectedVersion: data.version });
      if (ticket !== sequence.current) {
        if (action === 'START') api.travelCommand(visitId, { action: 'STOP', expectedVersion: response.data.version }).catch(() => {});
        return;
      }
      setData(response.data);
      if (position) {
        live.current = response.data; setActive(response.data);
        const updated = await api.travelLocation(visitId, { ...position, sessionId: response.data.sessionId });
        if (ticket === sequence.current) setData(updated.data);
      }
    } catch (failure) { if (mounted.current) { await refresh(); setError(errorText(failure)); } }
    finally { if (mounted.current) setBusy(false); }
  };
  const estimate = async () => {
    if (busy) return; setBusy(true); setError('');
    try { const result = await api.travelEta(visitId); if (mounted.current) setEta(result.data); }
    catch (failure) { if (mounted.current) setError(errorText(failure)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const fresh = data?.fresh && data.location && Date.now() - Date.parse(data.location.observedAt) <= 90000;
  return <div className="pwc-visit-travel">
    {!data && !error && <p role="status">Đang tải hành trình…</p>}
    {data && <><p>{states[data.state] || data.state}</p>
      {data.sharing && <p>{fresh ? `Cập nhật ${new Date(data.location.observedAt).toLocaleTimeString('vi-VN')} · Sai số ${Math.round(data.location.accuracyMeters)} m` : 'Chưa có vị trí mới.'}</p>}
      {fresh && <p><a target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([...data.location.coordinates].reverse().join(','))}`}>Vị trí nhân viên trên Google Maps</a></p>}
      {employee && data.available && <div className="employee-scheduling__actions">
        <Button disabled={busy || Boolean(active)} onClick={() => command('START')}><LocateFixed size={16} />Chia sẻ vị trí</Button>
        <Button variant="secondary" disabled={busy || !data.sharing} onClick={() => command('STOP')}><Pause size={16} />Dừng chia sẻ</Button>
        <Button variant="secondary" disabled={busy || data.state !== 'EN_ROUTE'} onClick={() => command('ARRIVED')}><MapPin size={16} />Đã đến</Button>
      </div>}
      <Button variant="secondary" disabled={busy || !fresh} onClick={estimate}><Navigation size={16} />Ước tính giờ đến</Button>
    </>}
    {eta && fresh && Date.parse(eta.observedAt) === Date.parse(data.location.observedAt) && <p role="status">Khoảng {Math.ceil(eta.minutes)} phút · {routeNames[eta.source] || 'Tuyến đường đã kiểm tra'}</p>}
    {error && <p role="alert">{error}</p>}
    <Button variant="ghost" title="Tải lại hành trình" aria-label="Tải lại hành trình" disabled={busy} onClick={refresh}><RefreshCw size={16} /></Button>
  </div>;
}
export function VisitTravel({ api, visitId, employee = false, startAt, endAt }) {
  const [open, setOpen] = useState(false);
  const now = Date.now();
  if (!api?.travel || now < Date.parse(startAt) - 120 * 60000 || now >= Date.parse(endAt)) return null;
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Hành trình đến điểm chăm sóc</summary>
    {open && <TravelPanel api={api} visitId={visitId} employee={employee} />}
  </details>;
}
