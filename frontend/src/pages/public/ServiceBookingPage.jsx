import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarCheck, Check, RefreshCw, Users, UserRound, Sparkles } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createServiceBasketApi } from '../../services/service-basket-api.js';
import { createSitterRecommendationApi } from '../../services/sitter-recommendation-api.js';
import { ApiError, createApiClient } from '../../services/api-client.js';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import { formatCatalogPrice } from '../../utils/catalog-format.js';
import { serviceVisual } from './service-visuals.js';
import { BookingConfirmation } from './BookingCheckout.jsx';
import './service-booking.css';

const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const locations = { HOME: 'Tại nhà', FACILITY: 'Tại cơ sở', OUTDOOR: 'Ngoài trời' };
const uncertainResponse = error => ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'COMMAND_PENDING', 'INVALID_RESPONSE', 'ABORTED'].includes(error.code) || error.status >= 500;
function errorText(error) {
  return ({ QUOTE_CHANGED: 'Hồ sơ, giá hoặc điều kiện đã thay đổi. Vui lòng lấy báo giá mới.',
    RESOURCE_NOT_FOUND: 'Báo giá hoặc hồ sơ không còn khả dụng. Vui lòng tải lại.',
    SCHEDULING_UNAVAILABLE: 'Chưa thể kiểm tra nhân viên. Bạn có thể gửi đơn để nhân viên hỗ trợ sắp xếp.',
    CARE_INFORMATION_REQUIRED: 'Cần xác nhận thông tin chăm sóc trong hồ sơ thú cưng trước khi tìm sitter.',
    RANKING_POLICY_UNAVAILABLE: 'Gợi ý sitter đang chờ chính sách xếp hạng. Bạn vẫn có thể chọn chỉ định hoặc để nhân viên sắp xếp.',
    ROUTING_UNAVAILABLE: 'Chưa lấy được đường đi để gợi ý sitter. Vui lòng thử lại.',
    SITTER_NOT_ELIGIBLE: 'Sitter đã chọn không còn đáp ứng lịch này. Hãy kiểm tra lại.',
    SLOT_UNAVAILABLE: 'Sitter vừa có lịch khác. Hãy kiểm tra lại.',
    OUTSIDE_WORKING_HOURS: 'Lịch này nằm ngoài ca đăng ký của sitter.',
    WORK_AREA_MISMATCH: 'Địa chỉ nằm ngoài khu vực sitter đã đăng ký.',
    CONTRACT_REQUIRED: 'Sitter chưa có hợp đồng bao phủ lịch này.',
    MATCH_EXPIRED: 'Gợi ý đã hết hạn. Hãy tìm lại trước khi xác nhận.',
    MATCH_CHANGED: 'Hồ sơ hoặc lịch đã thay đổi so với gợi ý. Hãy tìm lại.',
    MATCH_ALREADY_USED: 'Gợi ý này đã tạo đơn. Vui lòng kiểm tra đơn của bạn.',
    VISIT_SCHEDULE_OVERLAP: 'Các buổi của cùng thú cưng bị trùng giờ.',
    VALIDATION_FAILED: 'Kiểm tra thời lượng, ngày giờ, địa chỉ và điều kiện dịch vụ.',
    FORBIDDEN: 'Tài khoản hiện tại không thể đặt dịch vụ.',
    UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' })[error.code] ?? 'Chưa nhận được xác nhận. Vui lòng thử lại hoặc liên hệ PawWorld.';
}

export function BookingFlow({ service, api, matching, onBooked }) {
  const load = useCallback(async ({ signal }) => {
    const [pets, addresses, options] = await Promise.all([api.pets({ signal }), api.addresses({ signal }), api.checkoutOptions({ signal })]);
    if ([pets, addresses, options].some(value => value.pending)) throw new ApiError('COMMAND_PENDING', 202);
    if (!Array.isArray(pets.data) || !Array.isArray(addresses.data) || !options.data) throw new ApiError('INVALID_RESPONSE');
    return { data: { pets: pets.data, addresses: addresses.data, options: options.data } };
  }, [api]);
  const setup = useApiResource(load), [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [petIds, setPetIds] = useState([]), [units, setUnits] = useState(1), [count, setCount] = useState(1), [starts, setStarts] = useState(['']);
  const [location, setLocation] = useState(service.details?.locations?.[0] ?? 'HOME'), [addressId, setAddressId] = useState('');
  const [mode, setMode] = useState('SYSTEM'), [quote, setQuote] = useState(null), [available, setAvailable] = useState(null), [selected, setSelected] = useState('');
  const [shortlists, setShortlists] = useState(null), [consent, setConsent] = useState(false), [uncertain, setUncertain] = useState(false);
  const command = useRef(null), locked = useRef(false), generation = useRef(0);
  const unit = service.price.unitLabel, boarding = unit === 'ngày';
  const durationMinutes = unit === 'tiếng' ? Number(units) * 60 : unit === '30 phút' ? Number(units) * 30 : service.details?.durationMinutes || 60;
  const pets = setup.data?.pets.filter(pet => service.species.includes(pet.species)) ?? [];
  const addresses = setup.data?.addresses ?? [];
  const quoteAlive = quote && Date.parse(quote.expiresAt) > Date.now();
  useEffect(() => () => { generation.current++; }, []);
  function invalidate() { generation.current++; setQuote(null); setAvailable(null); setShortlists(null); setSelected(''); setConsent(false); setError(''); }
  function schedule() {
    return starts.map(start => ({ itemIndex: 0, startAt: new Date(start+'+07:00').toISOString(), location,
      ...(location !== 'FACILITY' ? { addressId } : {}) }));
  }
  async function price(event) {
    event.preventDefault(); if (locked.current) return;
    if (!petIds.length) { setError('Chọn ít nhất một thú cưng.'); return; }
    if (starts.some(start => !start || Date.parse(start+'+07:00') <= Date.now() + (count > 1 || boarding && units > 1 ? 15 : 0) * 60000)) {
      setError('Chọn thời gian trong tương lai, sau hạn thanh toán nếu đơn cần trả trước.'); return;
    }
    const ticket = ++generation.current; locked.current = true; setBusy(true); setError('');
    try {
      const value = await api.quote([{ serviceId: service.id, petIds, durationMinutes, visitCount: Number(count),
        ...(boarding ? { dayCount: Number(units) } : {}), ...(unit === 'km' ? { distanceMeters: Math.round(Number(units) * 1000) } : {}) }]);
      if (ticket === generation.current) { setQuote(value); setStep(1); setAvailable(null); setShortlists(null); setSelected(''); }
    } catch (failure) { if (ticket === generation.current) setError(errorText(failure)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function find(kind) {
    if (locked.current) return;
    if (!quoteAlive) { setError('Báo giá đã hết hạn. Vui lòng quay lại lấy báo giá mới.'); return; }
    const ticket = ++generation.current; locked.current = true; setBusy(true); setError(''); setConsent(false);
    try {
      if (kind === 'AI') {
        setShortlists(null);
        const values = [];
        for (const visit of schedule()) values.push(await matching.recommend({ serviceId: service.id, petIds, addressId,
          startAt: visit.startAt, endAt: new Date(Date.parse(visit.startAt) + durationMinutes * 60000).toISOString(), limit: 5 }));
        if (ticket === generation.current) setShortlists(values);
      } else {
        setAvailable(null); setSelected('');
        const values = [];
        for (const visit of schedule()) values.push(await api.availability({ quoteId: quote.quoteId, visit }));
        if (ticket === generation.current) setAvailable({ sitters: values[0].sitters.filter(sitter => values.every(value => value.sitters.some(row => row.id === sitter.id))),
          complete: values.every(value => value.complete) });
      }
    } catch (failure) { if (ticket === generation.current) setError(errorText(failure)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function confirm(event) {
    event.preventDefault(); if (locked.current) return;
    if (!uncertain) {
      if (!quoteAlive) { setError('Báo giá đã hết hạn. Vui lòng lấy báo giá mới.'); return; }
      if (shortlists?.some(list => !list.candidates.length || Date.parse(list.expiresAt) <= Date.now())) { setError('Gợi ý không còn khả dụng. Hãy tìm lại hoặc chọn nhân viên hỗ trợ sắp xếp.'); return; }
      if (mode === 'DIRECT' && !selected) { setError('Chọn một sitter đã kiểm tra phù hợp với tất cả buổi.'); return; }
      command.current = { key: 'checkout:'+globalThis.crypto.randomUUID(), body: { quoteId: quote.quoteId, acceptServicePolicies: consent,
        visits: schedule().map((visit, index) => ({ ...visit, bookingMode: mode,
          ...(mode === 'DIRECT' ? { requestedSitterId: selected } : {}),
          ...(mode === 'SYSTEM' && shortlists ? { matchId: shortlists[index].matchId } : {}) })) } };
    }
    locked.current = true; setBusy(true); setError('');
    try { const value = await api.confirm(command.current.body, command.current.key); onBooked(value); }
    catch (failure) { const pending = uncertainResponse(failure); setUncertain(pending); setError(pending ? 'Chưa xác định đơn đã được tạo hay chưa. Kiểm tra lại bằng cùng yêu cầu trước khi đặt mới.' : errorText(failure)); }
    finally { locked.current = false; setBusy(false); }
  }
  if (setup.status === 'loading') return <p role="status">Đang tải thông tin đặt lịch…</p>;
  if (setup.status !== 'success') return <div role="alert"><p>Chưa tải được thông tin đặt lịch.</p><button onClick={setup.retry}><RefreshCw size={16} />Tải lại</button></div>;
  const needsAddress = location !== 'FACILITY';
  const canMatch = location === 'HOME' && !boarding && unit !== 'km' && service.code !== 'vet-escort' && durationMinutes <= 360 && starts.every(start => Date.parse(start+'+07:00') >= Date.now()+86400000);
  return <div className="booking-flow">
    <ol className="booking-steps" aria-label="Tiến trình đặt dịch vụ">{['Thú cưng và lịch', 'Chọn pet sitter', 'Xác nhận'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{index < step ? <Check size={16} /> : index+1}</span>{label}</li>)}</ol>
    {step === 0 && <form onSubmit={price}>
      <h2>Thú cưng và lịch chăm sóc</h2>
      <fieldset disabled={busy}><legend>Thú cưng của bạn</legend>
        {pets.map(pet => <label className="booking-check" key={pet.id || pet._id}><input type="checkbox" checked={petIds.includes(pet.id || pet._id)} onChange={event => { invalidate(); const id = pet.id || pet._id; setPetIds(current => event.target.checked ? [...current, id] : current.filter(value => value !== id)); }} />{pet.name} · {pet.weightKg} kg</label>)}
        {!pets.length && <p>Chưa có hồ sơ {service.species.map(value => value === 'DOG' ? 'chó' : 'mèo').join(' / ')} phù hợp. <Link to="/account/pets" target="_blank">Thêm thú cưng</Link></p>}
        <Link to="/account/pets" target="_blank">Cập nhật hồ sơ chăm sóc</Link>
        <button type="button" className="booking-refresh" onClick={setup.retry}><RefreshCw size={16} />Tải lại hồ sơ</button>
      </fieldset>
      <fieldset className="booking-fields" disabled={busy}>
        {['tiếng', '30 phút', 'ngày', 'km'].includes(unit) && <label>{unit === 'ngày' ? 'Số ngày mỗi lượt' : unit === 'km' ? 'Khoảng cách mỗi lượt (km)' : 'Số đơn vị mỗi lượt ('+unit+')'}<input type="number" required min={unit === 'km' ? .001 : 1} max={boarding ? 60 : unit === 'km' ? 1000 : unit === 'tiếng' ? 24 : 48} step={unit === 'km' ? .001 : 1} value={units} onChange={event => { invalidate(); setUnits(event.target.value); }} /></label>}
        <label>Số buổi<input type="number" min="1" max="60" required value={count} onChange={event => { invalidate(); const value = Number(event.target.value); setCount(event.target.value); if (value >= 1 && value <= 60) setStarts(current => Array.from({ length: value }, (_, index) => current[index] ?? '')); }} /></label>
        <label>Địa điểm<select value={location} onChange={event => { invalidate(); setLocation(event.target.value); }}>{(service.details?.locations ?? ['HOME']).map(value => <option key={value} value={value}>{locations[value]}</option>)}</select></label>
        {needsAddress ? <label>Địa chỉ đã xác nhận<select value={addressId} required onChange={event => { invalidate(); setAddressId(event.target.value); }}><option value="">Chọn địa chỉ</option>{addresses.map(address => <option key={address.id || address._id} value={address.id || address._id}>{address.label}</option>)}</select></label> : <p>{setup.data.options.facilityAddress ?? 'Địa chỉ cơ sở chưa được cấu hình.'}</p>}
        {starts.map((start, index) => <label key={index}>Buổi {index+1} (giờ Việt Nam)<input type="datetime-local" required value={start} onChange={event => { invalidate(); setStarts(current => current.map((value, i) => i === index ? event.target.value : value)); }} /></label>)}
      </fieldset>
      {needsAddress && <p><Link to="/account/addresses" target="_blank">Thêm hoặc sửa địa chỉ trên bản đồ</Link><button type="button" className="booking-refresh" onClick={setup.retry}><RefreshCw size={16} />Tải lại địa chỉ</button></p>}
      <button className="pwc-button pwc-button-primary" disabled={busy || !pets.length || needsAddress && !addresses.length || !needsAddress && !setup.data.options.facilityAddress}>{busy ? 'Đang lấy báo giá…' : 'Tiếp tục'}<ArrowRight size={17} /></button>
    </form>}
    {step === 1 && <section><h2>Bạn muốn chọn pet sitter theo cách nào?</h2>
      <div className="booking-modes">{[['SYSTEM', Users, 'Hệ thống đề xuất'], ['DIRECT', UserRound, 'Chỉ định pet sitter']].map(([value, Icon, label]) => <label key={value} className={mode === value ? 'is-selected' : ''}><input type="radio" name="booking-mode" value={value} checked={mode === value} disabled={busy} onChange={() => { generation.current++; setMode(value); setShortlists(null); setAvailable(null); setSelected(''); setError(''); }} /><Icon size={22} /><strong>{label}</strong></label>)}</div>
      {mode === 'SYSTEM' ? <><p>PawWorld kiểm tra lịch và gửi lời mời cho nhân viên phù hợp. Ca được phân công sau khi sitter nhận lời.</p>
        {canMatch && <button type="button" className="pwc-button pwc-button-secondary" disabled={busy} onClick={() => find('AI')}><Sparkles size={17} />{busy ? 'Đang tìm…' : 'Xem gợi ý cho lịch này'}</button>}
        {!canMatch && <p>Lịch này sẽ được nhân viên điều phối theo phạm vi dịch vụ.</p>}
        {shortlists && <><ul className="booking-shortlist">{shortlists.map((list, index) => <li key={index}><h3>Buổi {index+1}</h3>{list.candidates.length ? <ol>{list.candidates.map(sitter => <li key={sitter.sitterId}><strong>{sitter.displayName}</strong> · {sitter.score}/100{<details><summary>Lý do phù hợp</summary><ul>{sitter.breakdown.map((line, i) => <li key={i}>{line.explanation}</li>)}</ul></details>}</li>)}</ol> : <p>Chưa có sitter đủ điều kiện cho lịch này.</p>}<p>Gợi ý đến {new Date(list.expiresAt).toLocaleTimeString('vi-VN')}; không phải xác nhận giữ chỗ.</p></li>)}</ul>
          <button type="button" onClick={() => { setShortlists(null); setError(''); }}>Để nhân viên hỗ trợ sắp xếp</button></>}
      </> : <><p>Sitter cần đáp ứng lịch, khu vực và hồ sơ thú cưng của tất cả buổi. Lựa chọn sẽ được kiểm tra lại trước khi tạo đơn và gửi lời mời.</p>
        {boarding ? <p>Lưu trú cần nhân viên chia ca chăm sóc trước khi chỉ định. <Link to="/contact">Liên hệ điều phối</Link></p> : <button type="button" className="pwc-button pwc-button-secondary" disabled={busy} onClick={() => find('DIRECT')}><Users size={17} />{busy ? 'Đang kiểm tra…' : 'Tìm sitter phù hợp'}</button>}
        {available && <><div className="booking-sitters">{available.sitters.map(sitter => <label key={sitter.id}><input type="radio" name="sitter" checked={selected === sitter.id} value={sitter.id} onChange={() => setSelected(sitter.id)} />{sitter.displayName}</label>)}</div>
          {!available.sitters.length && <p role="status">{available.complete ? 'Chưa có sitter đáp ứng tất cả buổi đã chọn. Bạn có thể đổi lịch hoặc để hệ thống sắp xếp.' : 'Chưa tìm được sitter trong lần kiểm tra này. Hãy thử lại hoặc liên hệ điều phối.'}</p>}</>}
      </>}
      <div className="booking-actions"><button disabled={busy} onClick={() => { setStep(0); setError(''); }}><ArrowLeft size={17} />Quay lại</button><button className="pwc-button pwc-button-primary" disabled={busy || mode === 'DIRECT' && !selected || shortlists?.some(list => !list.candidates.length)} onClick={() => { setStep(2); setError(''); }}>Xem lại đơn<ArrowRight size={17} /></button></div>
    </section>}
    {step === 2 && <form onSubmit={confirm}><h2>Xác nhận đặt dịch vụ</h2><fieldset disabled={busy || uncertain}>
      <dl className="booking-review"><div><dt>Thú cưng</dt><dd>{pets.filter(pet => petIds.includes(pet.id || pet._id)).map(pet => pet.name).join(', ')}</dd></div><div><dt>Cách chọn sitter</dt><dd>{mode === 'DIRECT' ? available?.sitters.find(sitter => sitter.id === selected)?.displayName : shortlists ? 'Hệ thống đề xuất theo lịch' : 'PawWorld sắp xếp'}</dd></div><div><dt>Địa điểm</dt><dd>{locations[location]} · {needsAddress ? addresses.find(address => (address.id || address._id) === addressId)?.label : setup.data.options.facilityAddress}</dd></div></dl>
      <ul>{starts.map((value, index) => <li key={index}>Buổi {index+1}: {new Date(value+'+07:00').toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</li>)}</ul>
      <dl className="booking-review">{[['Dịch vụ', quote.baseVnd], ['Phụ phí', quote.surchargeVnd], ['Giảm combo', -quote.discountVnd], ['Phí bậc giá', quote.orderFeeVnd], ['Tổng thanh toán', quote.totalVnd]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>
      <p>{quote.paymentMode === 'PREPAY' ? 'Đơn nhiều buổi cần thanh toán đủ trong 15 phút trước khi gửi lời mời.' : 'Thanh toán sau khi hoàn tất dịch vụ.'}</p>
      <p>Nhân viên xác nhận kế hoạch chăm sóc trước khi phân công. Sitter được chọn chưa được giữ chỗ.</p>
      {quote.items.map((item, index) => <details key={index}><summary>{item.servicePolicy?.title ?? 'Điều kiện dịch vụ'}</summary><p className="pwc-checkout-policy">{item.servicePolicy?.body}</p></details>)}
      <label className="booking-check"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} />Tôi xác nhận lịch, báo giá và điều kiện dịch vụ.</label>
    </fieldset><div className="booking-actions"><button type="button" disabled={busy || uncertain} onClick={() => { setStep(1); setError(''); }}><ArrowLeft size={17} />Quay lại</button><button className="pwc-button pwc-button-primary" disabled={busy || !consent}><CalendarCheck size={17} />{busy ? 'Đang xác nhận…' : uncertain ? 'Kiểm tra lại đơn' : 'Xác nhận đặt dịch vụ'}</button></div></form>}
    {quote && step > 0 && <p className="booking-expiry">Báo giá đến {new Date(quote.expiresAt).toLocaleTimeString('vi-VN')} · {money(quote.totalVnd)}</p>}
    {error && <p role="alert" className="booking-error">{error}</p>}
  </div>;
}

export function ServiceBookingPage({ loadCatalog = loadPublicCatalog }) {
  const session = useSession(), { serviceId } = useParams(), [params, setParams] = useSearchParams();
  const catalog = useApiResource(loadCatalog), service = catalog.data?.services?.find(row => row.id === serviceId);
  const api = useMemo(() => createServiceBasketApi({ getCsrfToken: session.getCsrfToken }), [session.getCsrfToken]);
  const matching = useMemo(() => createSitterRecommendationApi({ request: createApiClient({ getCsrfToken: session.getCsrfToken }) }), [session.getCsrfToken]);
  if (catalog.status === 'loading') return <main className="pwc-page"><p role="status">Đang tải dịch vụ…</p></main>;
  if (!service) return <main className="pwc-page"><h1>Dịch vụ chưa khả dụng</h1><Link to="/services">Về danh mục</Link><button onClick={catalog.retry}>Tải lại</button></main>;
  const visual = serviceVisual(service);
  return <main className="pwc-page service-booking"><nav aria-label="Đường dẫn"><Link to="/services">Dịch vụ</Link> / <Link to={'/services/'+service.id}>{service.name}</Link> / Đặt lịch</nav>
    <header className="booking-service"><img src={visual.src} alt={visual.alt} /><div><p>Đặt dịch vụ</p><h1>{service.name}</h1><p>{formatCatalogPrice(service.price)}</p></div></header>
    {params.get('booking') ? <BookingConfirmation api={api} /> : session.status === 'authenticated' && session.user.roles.includes('CUSTOMER')
      ? <BookingFlow key={session.user.id+service.id} service={service} api={api} matching={matching} onBooked={booking => { setParams({ booking: booking.id }); globalThis.scrollTo?.({ top: 0, behavior: 'smooth' }); }} />
      : <section><h2>{session.status === 'loading' ? 'Đang kiểm tra phiên…' : 'Đăng nhập để đặt dịch vụ'}</h2><Link className="pwc-button pwc-button-primary" to="/sign-in">Đăng nhập</Link></section>}
  </main>;
}
