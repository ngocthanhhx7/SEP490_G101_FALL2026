import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { Button, Dialog } from '../../components/ui/index.js';
import { usePhoneApp } from '../../hooks/usePhoneApp.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { createServiceBasketApi } from '../../services/service-basket-api.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { BookingCheckoutForm, BookingConfirmation } from './BookingCheckout.jsx';

const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
function CustomerBasket({ services, session, compact }) {
  const api = useMemo(() => createServiceBasketApi({ getCsrfToken: session.getCsrfToken }), [session.getCsrfToken]);
  const pets = useApiResource(api.pets);
  const [, setParams] = useSearchParams();
  const nextId = useRef(1), requestId = useRef(0);
  const checkoutHeading = useRef(null);
  const [checkout, setCheckout] = useState(false);
  useEffect(() => { if (checkout) checkoutHeading.current?.focus(); }, [checkout]);
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
  if (pets.status === 'empty') return <p><Link to="/account/pets">Thêm hồ sơ thú cưng</Link></p>;
  if (pets.status !== 'success') return <div><p role="alert">Chưa tải được hồ sơ thú cưng.</p><button type="button" onClick={pets.retry}>Thử lại</button></div>;
  return <><BookingConfirmation api={api} /><form onSubmit={submit} className="pwc-service-basket" hidden={compact && checkout}>
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
    {result && <div className="pwc-basket-total" role="status">
      <h3>Tóm tắt và giá</h3>
      {result.items.map((item, index) => <div key={index}>
        <strong>{services.find(service => service.id === item.serviceId)?.name ?? `Dịch vụ ${index + 1}`}</strong>
        <dl>
          <div><dt>Giá một buổi (gồm phụ phí áp dụng)</dt><dd>{item.subtotalVnd % item.visitCount === 0
            ? money(item.subtotalVnd / item.visitCount)
            : `${money(Math.floor(item.subtotalVnd / item.visitCount))} – ${money(Math.ceil(item.subtotalVnd / item.visitCount))}`}</dd></div>
          <div><dt>Số buổi</dt><dd>{item.visitCount}</dd></div>
          <div><dt>Thành tiền</dt><dd>{money(item.subtotalVnd)}</dd></div>
        </dl>
      </div>)}
      <dl>{[
        ['Tạm tính', result.baseVnd + result.surchargeVnd],
        ['Giảm nhiều buổi', -result.discountVnd],
        [`Giảm giá hạng ${({ MEMBER: 'Member', SILVER: 'Silver', GOLD: 'Gold' })[result.tier?.code] ?? ''}`, -(result.tierDiscountVnd ?? 0)],
        ['Tổng thanh toán', result.totalVnd]
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>
      <p>Thanh toán toàn bộ qua payOS trong 15 phút sau khi đặt lịch. Báo giá có hiệu lực đến {new Date(result.expiresAt).toLocaleTimeString('vi-VN')}.</p>
      {compact && result.items?.length > 0 && <Button type="button" onClick={() => setCheckout(true)}>Chọn lịch cho các buổi</Button>}
    </div>}
  </form>{result?.items?.length > 0 && <div hidden={compact && !checkout}>
    {compact && <h3 tabIndex={-1} ref={checkoutHeading}>Xếp lịch chăm sóc</h3>}
    <BookingCheckoutForm key={result.quoteId} quote={result} services={services} api={api}
      onEditQuote={compact ? () => setCheckout(false) : undefined} onConfirmed={booking => {
    setParams(current => { const next = new globalThis.URLSearchParams(current); next.set('booking', booking.id); return next; }); setResult(null); setRows([]); setCheckout(false);
  }} /></div>}</>;
}
export function ServiceBasket({ services }) {
  const session = useSession();
  const compact = usePhoneApp();
  const [open, setOpen] = useState(false);
  if (!services.length) return null;
  return <section className="pwc-service-basket-section" aria-labelledby="basket-title"><h2 id="basket-title">Dịch vụ bạn chọn</h2>
    {session.status === 'authenticated' && session.user?.roles?.includes('CUSTOMER')
      ? compact ? <>
        <Button onClick={() => setOpen(true)}>Mở giỏ dịch vụ</Button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Giỏ dịch vụ" className="mobile-flow-dialog">
          <CustomerBasket key={session.user.id} services={services} session={session} compact />
        </Dialog>
      </> : <CustomerBasket key={session.user.id} services={services} session={session} />
      : <Link to="/sign-in">Đăng nhập để chọn thú cưng và xem báo giá</Link>}
  </section>;
}
