import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { createServiceBasketApi } from '../../services/service-basket-api.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { BookingCheckoutForm, BookingConfirmation } from './BookingCheckout.jsx';

const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
function CustomerBasket({ services, session }) {
  const api = useMemo(() => createServiceBasketApi({ getCsrfToken: session.getCsrfToken }), [session.getCsrfToken]);
  const pets = useApiResource(api.pets);
  const [, setParams] = useSearchParams();
  const nextId = useRef(1), requestId = useRef(0);
  const [rows, setRows] = useState([]), [result, setResult] = useState(null), [status, setStatus] = useState('idle');
  useEffect(() => () => { requestId.current++; }, []);
  const edit = (key, patch) => { requestId.current++; setRows(old => old.map(row => row.key === key ? { ...row, ...patch } : row)); setResult(null); setStatus('idle'); };
  const add = () => { requestId.current++; setRows(old => [...old, { key: nextId.current++, serviceId: services[0]?.id || '', petId: '', visits: 1, units: 1 }]); setResult(null); setStatus('idle'); };
  async function submit(event) {
    event.preventDefault(); const id = ++requestId.current; setResult(null); setStatus('loading');
    try {
      const items = rows.map(row => {
        const service = services.find(s => s.id === row.serviceId), unit = service.price.unitLabel;
        return { serviceId: row.serviceId, petIds: [row.petId], visitCount: Number(row.visits),
          durationMinutes: unit === 'tiếng' ? Number(row.units) * 60 : unit === '30 phút' ? Number(row.units) * 30 : service.details?.durationMinutes || 60,
          ...(unit === 'ngày' ? { dayCount: Number(row.units) } : {}),
          ...(unit === 'km' ? { distanceMeters: Math.round(Number(row.units) * 1000) } : {}) };
      });
      const response = await api.quote(items);
      if (id === requestId.current) { setResult(response); setStatus('success'); }
    } catch { if (id === requestId.current) setStatus('error'); }
  }
  if (pets.status === 'loading') return <p role="status">Đang tải hồ sơ thú cưng…</p>;
  if (pets.status === 'empty') return <p><Link to="/account/sitter-recommendations">Thêm hồ sơ thú cưng</Link></p>;
  if (pets.status !== 'success') return <div><p role="alert">Chưa tải được hồ sơ thú cưng.</p><button type="button" onClick={pets.retry}>Thử lại</button></div>;
  return <><BookingConfirmation api={api} /><form onSubmit={submit} className="pwc-service-basket">
    {rows.map((row, index) => {
      const service = services.find(s => s.id === row.serviceId), unit = service?.price.unitLabel;
      return <div className="pwc-basket-row" key={row.key}>
        <label>Dịch vụ {index + 1}<select value={row.serviceId} onChange={e => edit(row.key, { serviceId: e.target.value, petId: '', units: 1 })}>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label>Thú cưng<select required value={row.petId} onChange={e => edit(row.key, { petId: e.target.value })}>
          <option value="">Chọn bé</option>{pets.data.filter(p => service?.species.includes(p.species)).map(p => <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>)}
        </select></label>
        <label>Số lượt<input type="number" min="1" max="60" step="1" required value={row.visits} onChange={e => edit(row.key, { visits: e.target.value })} /></label>
        {['tiếng', '30 phút', 'ngày', 'km'].includes(unit) && <label>{unit === 'km' ? 'Km / lượt' : unit === 'ngày' ? 'Ngày / lượt' : 'Đơn vị / lượt (' + unit + ')'}
          <input type="number" required min={unit === 'km' ? '0.001' : '1'} max={unit === 'km' ? '1000' : unit === 'ngày' ? '60' : unit === 'tiếng' ? '24' : '48'} step={unit === 'km' ? '0.001' : '1'} value={row.units} onChange={e => edit(row.key, { units: e.target.value })} />
        </label>}
        <button type="button" aria-label={'Xóa dịch vụ ' + (index + 1)} title="Xóa dịch vụ" onClick={() => { requestId.current++; setRows(old => old.filter(r => r.key !== row.key)); setResult(null); setStatus('idle'); }}><Trash2 size={18} /></button>
      </div>;
    })}
    <div className="pwc-basket-actions"><button type="button" disabled={rows.length >= 20} onClick={add}><Plus size={18} />Thêm dịch vụ</button>
      <button type="submit" disabled={!rows.length || status === 'loading'}><Calculator size={18} />{status === 'loading' ? 'Đang tính…' : 'Xem báo giá'}</button></div>
    {status === 'error' && <p role="alert">Chưa thể báo giá. Kiểm tra hồ sơ, số lượt và điều kiện dịch vụ rồi thử lại.</p>}
    {result && <div className="pwc-basket-total" role="status"><dl>{[
      ['Tiền dịch vụ', result.baseVnd], ['Phụ phí đặc điểm', result.surchargeVnd], ['Giảm combo', -result.discountVnd], ['Phí bậc giá', result.orderFeeVnd], ['Tổng dự kiến', result.totalVnd]
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>
      <p>{result.paymentMode === 'PREPAY' ? 'Thanh toán trước khi thực hiện.' : 'Thanh toán sau khi hoàn tất.'} Báo giá có hiệu lực đến {new Date(result.expiresAt).toLocaleTimeString('vi-VN')}.</p>
    </div>}
  </form>{result?.items?.length > 0 && <BookingCheckoutForm key={result.quoteId} quote={result} services={services} api={api} onConfirmed={booking => {
    setParams(current => { const next = new globalThis.URLSearchParams(current); next.set('booking', booking.id); return next; }); setResult(null); setRows([]);
  }} />}</>;
}
export function ServiceBasket({ services }) {
  const session = useSession();
  if (!services.length) return null;
  return <section className="pwc-service-basket-section" aria-labelledby="basket-title"><h2 id="basket-title">Dịch vụ bạn chọn</h2>
    {session.status === 'authenticated' && session.user?.roles?.includes('CUSTOMER')
      ? <CustomerBasket key={session.user.id} services={services} session={session} />
      : <Link to="/sign-in">Đăng nhập để chọn thú cưng và xem báo giá</Link>}
  </section>;
}
