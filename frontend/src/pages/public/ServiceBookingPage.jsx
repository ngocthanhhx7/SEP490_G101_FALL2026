import { PolicyContextLinks } from './policies/PolicyLinks.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarCheck, Check, RefreshCw } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { hasRole } from '../../utils/role-access.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createServiceBasketApi } from '../../services/service-basket-api.js';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import { formatCatalogPrice } from '../../utils/catalog-format.js';
import { apiErrorFeedback } from '../../utils/api-error-feedback.js';
import { groomingPath, homeLocations, isShopOnly } from '../../utils/shop-grooming.js';
import { Button, Dialog } from '../../components/ui/index.js';
import { serviceVisual } from './service-visuals.js';
import { RecurringSchedule } from '../../components/calendar/RecurringSchedule.jsx';
import { BookingDateTime } from '../../components/calendar/BookingDateTime.jsx';
import { vietnamDate, vietnamDateTime } from '../../utils/calendar-date.js';
import { BookingConfirmation } from './BookingCheckout.jsx';
import './service-booking.css';

const homeNoticeMs = 2 * 60 * 60 * 1000;
const scheduleLabel = value => new Date(value + '+07:00').toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short'
});
const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const locations = { HOME: 'Tại nhà', FACILITY: 'Tại cơ sở', OUTDOOR: 'Ngoài trời' };
const uncertainResponse = error => ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'COMMAND_PENDING', 'INVALID_RESPONSE', 'ABORTED'].includes(error.code) || error.status >= 500;

function unavailableText(code) {
  return ({ OUTSIDE_WORKING_HOURS: 'Không có ca làm việc trong lịch đã chọn.', SLOT_UNAVAILABLE: 'Đã có lịch khác trong khung giờ này.',
    WORK_AREA_MISMATCH: 'Không đăng ký khu vực của địa chỉ đã chọn.', PET_CAPABILITY_MISMATCH: 'Chưa đáp ứng hồ sơ thú cưng.',
    CONTRACT_REQUIRED: 'Hợp đồng chưa bao phủ lịch đã chọn.', DAY_OFF: 'Nghỉ trong ngày đã chọn.',
    TRAVEL_TIME_CONFLICT: 'Không đủ thời gian di chuyển.', ROUTING_UNAVAILABLE: 'Chưa xác minh được thời gian di chuyển.' })[code]
    ?? 'Không rảnh ở buổi này.';
}

function errorText(error) {
  if (error.code === 'PRICING_REVIEW_REQUIRED' && typeof error.fieldErrors?.petTraits === 'string' && error.fieldErrors.petTraits.length <= 1000) return error.fieldErrors.petTraits;
  return ({ QUOTE_CHANGED: 'Hồ sơ, giá hoặc điều kiện đã thay đổi. Vui lòng lấy báo giá mới.',
    PRICING_REVIEW_REQUIRED: 'Một đặc điểm chăm sóc của thú cưng chưa có quy tắc giá được duyệt. Vui lòng liên hệ PawWorld để rà soát giá trước khi đặt dịch vụ.',
    PRICING_POLICY_UNAVAILABLE: 'Dịch vụ chưa có chính sách giá có hiệu lực. Vui lòng liên hệ PawWorld hoặc thử lại sau.',
    HOME_BOOKING_NOTICE_REQUIRED: 'Đặt lịch chăm sóc tại nhà trước ít nhất 2 giờ.',
    SLOT_INVALID: 'Lịch chăm sóc cần đặt trước ít nhất 2 giờ. Vui lòng kiểm tra lại thời gian.',
    PREFERRED_SITTER_HISTORY_REQUIRED: 'Bạn chỉ có thể chọn người chăm sóc đã từng chăm thú cưng này trước đó.',
    RESOURCE_NOT_FOUND: 'Báo giá, địa chỉ hoặc dịch vụ không còn khả dụng.',
    QUOTE_ALREADY_USED: 'Báo giá này đã được dùng để đặt dịch vụ.',
    SITTER_NOT_ELIGIBLE: 'Người chăm sóc này không còn khả dụng. Vui lòng chọn lại hoặc để PawWorld sắp xếp.',
    SLOT_UNAVAILABLE: 'Người chăm sóc đã có lịch khác trong khung giờ này.',
    OUTSIDE_WORKING_HOURS: 'Lịch này nằm ngoài ca đăng ký của người chăm sóc.',
    WORK_AREA_MISMATCH: 'Địa chỉ nằm ngoài khu vực người chăm sóc đã đăng ký.',
    CONTRACT_REQUIRED: 'Người chăm sóc chưa có hợp đồng bao phủ lịch này.',
    MATCH_EXPIRED: 'Lựa chọn đã hết hạn. Vui lòng kiểm tra lại trước khi xác nhận.',
    MATCH_CHANGED: 'Hồ sơ hoặc lịch đã thay đổi. Vui lòng kiểm tra lại.',
    MATCH_ALREADY_USED: 'Yêu cầu này đã tạo đơn. Vui lòng kiểm tra đơn của bạn.',
    VISIT_SCHEDULE_OVERLAP: 'Các buổi của cùng thú cưng bị trùng giờ.',
    VALIDATION_FAILED: 'Kiểm tra thời lượng, ngày giờ, địa chỉ và số buổi trước khi tiếp tục.' })[error.code]
    || apiErrorFeedback(error, 'Chưa hoàn tất được thao tác. Vui lòng thử lại.');
}

export function BookingFlow({ service, api, onBooked }) {
  const unit = service.price?.unitLabel ?? 'lượt', boarding = unit === 'ngày';
  const load = useCallback(async ({ signal }) => {
    const [pets, addresses, options] = await Promise.all([api.pets({ signal }), api.addresses({ signal }), api.checkoutOptions({ signal })]);
    if (pets.pending || addresses.pending || options.pending) return { pending: true, data: null };
    return { data: { pets: pets.data ?? [], addresses: addresses.data ?? [], options: options.data ?? {} } };
  }, [api]);
  const setup = useApiResource(load);
  const pets = useMemo(() => (setup.data?.pets ?? []).filter(pet => service.species.includes(pet.species)), [setup.data, service.species]);
  const addresses = useMemo(() => setup.data?.addresses ?? [], [setup.data]);
  const [petIds, setPetIds] = useState([]), [location, setLocation] = useState(() => homeLocations(service)[0] || 'HOME');
  const [addressId, setAddressId] = useState(''), [units, setUnits] = useState('1'), [count, setCount] = useState('1');
  const [starts, setStarts] = useState(['']), [activeVisit, setActiveVisit] = useState(0), [editingRepeat, setEditingRepeat] = useState(false);
  const [step, setStep] = useState(0), [quote, setQuote] = useState(null);
  const [available, setAvailable] = useState(null), [selected, setSelected] = useState(''), [consent, setConsent] = useState(false);
  const [msg162Dialog, setMsg162Dialog] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const generation = useRef(0), command = useRef(null), locked = useRef(false);
  const durationMinutes = unit === 'tiếng' ? Number(units) * 60 : unit === '30 phút' ? Number(units) * 30 : service.details?.durationMinutes ?? 60;
  const quoteAlive = quote && Date.parse(quote.expiresAt) > Date.now();
  useEffect(() => () => { generation.current++; }, []);

  function invalidate() {
    generation.current++;
    setQuote(null);
    setAvailable(null);
    setSelected('');
    setConsent(false);
    setMsg162Dialog(null);
    setError('');
  }

  function schedule() {
    return starts.map(start => ({
      itemIndex: 0,
      startAt: new Date(start + '+07:00').toISOString(),
      location,
      ...(location !== 'FACILITY' ? { addressId } : {})
    }));
  }

  const prepayNotice = Number(count) > 1 || boarding && Number(units) > 1 ? 15 * 60000 : 0;
  const leadMs = location === 'HOME' ? homeNoticeMs : prepayNotice;
  const minimum = vietnamDateTime(new Date(Math.ceil((Date.now() + Math.max(leadMs, 1)) / 60000) * 60000));

  async function loadPreviousSitters(activeQuote) {
    const targetQuote = activeQuote ?? quote;
    if (!targetQuote || boarding) return;
    const ticket = ++generation.current;
    locked.current = true;
    setBusy(true);
    setError('');
    setAvailable(null);
    setSelected('');
    try {
      const currentSchedule = schedule();
      const values = [];
      for (const visit of currentSchedule) {
        values.push(await api.availability({ quoteId: targetQuote.quoteId, visit }));
      }
      if (ticket !== generation.current) return;
      const byId = new Map();
      values.forEach((value, visitIndex) => {
        for (const sitter of value.sitters ?? []) {
          const entry = byId.get(sitter.id) ?? {
            id: sitter.id,
            displayName: sitter.displayName,
            eligible: true,
            unavailableVisits: []
          };
          if (sitter.eligible === false) {
            entry.eligible = false;
            entry.unavailableVisits.push({
              index: visitIndex,
              start: starts[visitIndex],
              reason: sitter.unavailableReason ?? null
            });
          }
          byId.set(sitter.id, entry);
        }
      });
      setAvailable({ sitters: [...byId.values()], complete: values.every(value => value.complete !== false) });
    } catch (failure) {
      if (ticket === generation.current) setError(errorText(failure));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function price(event) {
    event.preventDefault();
    if (locked.current || editingRepeat) return;
    if (!petIds.length) { setError('Chọn ít nhất một thú cưng.'); return; }
    const now = Date.now();
    const invalid = starts.findIndex(start => !start || Date.parse(start + '+07:00') <= now + prepayNotice
      || location === 'HOME' && Date.parse(start + '+07:00') < now + homeNoticeMs);
    if (invalid !== -1) {
      setActiveVisit(invalid);
      const instruction = !starts[invalid] ? 'Chọn ngày và giờ bắt đầu.'
        : location === 'HOME' ? 'Đặt lịch chăm sóc tại nhà trước ít nhất 2 giờ.'
          : 'Chọn giờ trong tương lai, sau hạn thanh toán nếu đơn cần trả trước.';
      setError(`Buổi ${invalid + 1}. ${instruction}`);
      return;
    }
    const ordered = starts.map((value, index) => ({ at: Date.parse(value + '+07:00'), index })).sort((a, b) => a.at - b.at);
    const overlap = ordered.find((slot, i) => i > 0 && slot.at < ordered[i - 1].at + durationMinutes * 60000);
    if (overlap) { setActiveVisit(overlap.index); setError(`Buổi ${overlap.index + 1} trùng giờ chăm sóc với một buổi khác. Hãy đổi giờ.`); return; }
    const ticket = ++generation.current;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await api.quote([{
        serviceId: service.id,
        petIds,
        durationMinutes,
        visitCount: Number(count),
        ...(boarding ? { dayCount: Number(units) } : {}),
        ...(unit === 'km' ? { distanceMeters: Math.round(Number(units) * 1000) } : {})
      }]);
      if (ticket === generation.current) {
        setQuote(value);
        setStep(1);
        setAvailable(null);
        setSelected('');
        locked.current = false;
        setBusy(false);
        if (!boarding) void loadPreviousSitters(value);
        return;
      }
    } catch (failure) {
      if (ticket === generation.current) setError(errorText(failure));
    }
    locked.current = false;
    setBusy(false);
  }

  const selectedSitter = useMemo(
    () => (available?.sitters ?? []).find(sitter => sitter.id === selected) ?? null,
    [available, selected]
  );

  async function executeConfirm(acceptedVisits = []) {
    if (locked.current) return;
    if (!uncertain) {
      if (!quoteAlive) { setError('Báo giá đã hết hạn. Vui lòng lấy báo giá mới.'); return; }
      const bookingMode = selected ? 'DIRECT' : 'SYSTEM';
      command.current = {
        key: 'checkout:' + globalThis.crypto.randomUUID(),
        body: {
          quoteId: quote.quoteId,
          acceptServicePolicies: consent,
          visits: schedule().map((visit, index) => ({
            ...visit,
            bookingMode,
            ...(selected ? { requestedSitterId: selected } : {}),
            ...(selected && acceptedVisits.includes(index) ? { acceptUnavailableSitter: true } : {})
          }))
        }
      };
    }
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await api.confirm(command.current.body, command.current.key);
      onBooked(value);
    } catch (failure) {
      if (failure.status === 409 && failure.code === 'SITTER_AVAILABILITY_CONSENT_REQUIRED' && selectedSitter) {
        const visits = Object.entries(failure.lineFields ?? {}).flatMap(([key, fields]) => {
          const index = Number(key);
          return Number.isInteger(index) && starts[index] && fields?.acceptUnavailableSitter
            ? [{ index, start: starts[index] }] : [];
        });
        if (visits.length) {
          const accepted = command.current.body.visits.flatMap((row, index) => row.acceptUnavailableSitter ? [index] : []);
          setUncertain(false);
          setMsg162Dialog({ sitterName: selectedSitter.displayName, visits, accepted });
          return;
        }
      }
      const pending = uncertainResponse(failure);
      setUncertain(pending);
      setError(pending ? 'Chưa xác định đơn đã được tạo hay chưa. Kiểm tra lại bằng cùng yêu cầu trước khi đặt mới.' : errorText(failure));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function confirm(event) {
    event.preventDefault();
    if (locked.current) return;
    if (!uncertain && !quoteAlive) {
      setError('Báo giá đã hết hạn. Vui lòng lấy báo giá mới.');
      return;
    }
    if (!uncertain && selectedSitter && selectedSitter.unavailableVisits.length > 0) {
      setMsg162Dialog({
        sitterName: selectedSitter.displayName,
        visits: selectedSitter.unavailableVisits
      });
      return;
    }
    await executeConfirm();
  }

  if (setup.status === 'loading') return <p role="status">Đang tải thông tin đặt lịch…</p>;
  if (setup.status !== 'success') return <div role="alert"><p>Chưa tải được thông tin đặt lịch.</p><button onClick={setup.retry}><RefreshCw size={16} />Tải lại</button></div>;
  const needsAddress = location !== 'FACILITY';
  const previousSitters = available?.sitters ?? [];

  return <div className="booking-flow">
    <ol className="booking-steps" aria-label="Tiến trình đặt dịch vụ">{['Thú cưng và lịch', 'Người chăm sóc', 'Xác nhận'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{index < step ? <Check size={16} /> : index + 1}</span>{label}</li>)}</ol>
    {step === 0 && <form onSubmit={price}>
      <h2>Thú cưng và lịch chăm sóc</h2>
      <div className="booking-compose">
        <fieldset className="booking-compose__schedule" disabled={busy}>
          <legend>Lịch chăm sóc</legend>
          <p className="booking-schedule-hint">{location === 'HOME' ? 'Giờ Việt Nam · Đặt trước ít nhất 2 giờ.' : 'Giờ Việt Nam'}</p>
          {location === 'HOME' && !boarding && <>
            <button type="button" className="booking-repeat-trigger" aria-haspopup="dialog" onClick={() => setEditingRepeat(true)}>
              <RefreshCw size={16} aria-hidden="true" /> Tạo lịch lặp theo tuần hoặc tháng
            </button>
            {editingRepeat && <RecurringSchedule replacing={starts.some(Boolean)} initial={starts[activeVisit]} minimum={minimum} onCancel={() => setEditingRepeat(false)}
              onApply={values => { invalidate(); setStarts(values); setCount(values.length); setActiveVisit(0); setEditingRepeat(false); }} />}
          </>}
          {starts.length > 1 && <label className="booking-visit-select">Buổi cần chỉnh
            <select value={activeVisit} onChange={event => { setActiveVisit(Number(event.target.value)); setError(''); }}>
              {starts.map((start, index) => <option key={index} value={index}>
                {start ? `Buổi ${index + 1} · ${scheduleLabel(start)}` : `Buổi ${index + 1} · Chưa chọn giờ`}
              </option>)}
            </select>
          </label>}
          <BookingDateTime key={activeVisit} label={`Buổi ${activeVisit + 1} (giờ Việt Nam)`}
            value={starts[activeVisit]} minimum={minimum} today={vietnamDate()} visits={starts} activeVisit={activeVisit}
            durationMinutes={boarding || !Number.isFinite(durationMinutes) ? undefined : durationMinutes}
            markedDays={new Set(starts.filter(Boolean).map(value => value.slice(0, 10)))}
            onChange={value => { invalidate(); setStarts(current => current.map((start, index) => index === activeVisit ? value : start)); }}
          />
          {starts.length > 1 && <div className="booking-schedule-footer">
            <span>{starts.filter(Boolean).length}/{starts.length} buổi đã chọn giờ</span>
            <button type="button" className="booking-schedule-next" onClick={() => {
              invalidate(); setStarts(starts.filter((_, index) => index !== activeVisit)); setCount(starts.length - 1);
              setActiveVisit(Math.min(activeVisit, starts.length - 2));
            }}>Bỏ buổi này</button>
            {activeVisit < starts.length - 1 && <button type="button" className="booking-schedule-next"
              onClick={() => { setActiveVisit(activeVisit + 1); setError(''); }}>Chỉnh buổi tiếp theo</button>}
          </div>}
        </fieldset>
        <div className="booking-compose__details">
          <fieldset disabled={busy}><legend>Thú cưng của bạn</legend>
            {pets.map(pet => <label className="booking-check" key={pet.id || pet._id}><input type="checkbox" checked={petIds.includes(pet.id || pet._id)} onChange={event => { invalidate(); const id = pet.id || pet._id; setPetIds(current => event.target.checked ? [...current, id] : current.filter(value => value !== id)); }} />{pet.name} · {pet.weightKg} kg</label>)}
            {!pets.length && <p>Chưa có hồ sơ {service.species.map(value => value === 'DOG' ? 'chó' : 'mèo').join(' / ')} phù hợp. <Link to="/account/pets" target="_blank">Thêm thú cưng</Link></p>}
            {pets.some(pet => petIds.includes(pet.id || pet._id) && pet.traits?.includes('extended-play')) && <p role="status">Chơi cùng bé nằm trong thời lượng dịch vụ đã chọn; hệ thống không tự cộng thêm phút. Chọn thời lượng phù hợp trước khi lấy báo giá.</p>}
            <Link to="/account/pets" target="_blank">Cập nhật hồ sơ chăm sóc</Link>
            <button type="button" className="booking-refresh" onClick={setup.retry}><RefreshCw size={16} />Tải lại hồ sơ</button>
          </fieldset>
          <fieldset className="booking-fields" disabled={busy || editingRepeat}>
            {['tiếng', '30 phút', 'ngày', 'km'].includes(unit) && <label>{unit === 'ngày' ? 'Số ngày mỗi lượt' : unit === 'km' ? 'Khoảng cách mỗi lượt (km)' : 'Số đơn vị mỗi lượt (' + unit + ')'}<input type="number" required min={unit === 'km' ? .001 : 1} max={boarding ? 60 : unit === 'km' ? 1000 : unit === 'tiếng' ? 24 : 48} step={unit === 'km' ? .001 : 1} value={units} onChange={event => { invalidate(); setUnits(event.target.value); }} /></label>}
            <label>Số buổi<input type="number" min="1" max="60" required value={count} onChange={event => {
              invalidate();
              const value = Number(event.target.value);
              setCount(event.target.value);
              if (Number.isInteger(value) && value >= 1 && value <= 60) {
                setStarts(current => Array.from({ length: value }, (_, index) => current[index] ?? ''));
                setActiveVisit(current => Math.min(current, value - 1));
              }
            }} /></label>
            <label>Địa điểm<select value={location} onChange={event => { invalidate(); setLocation(event.target.value); }}>{homeLocations(service).map(value => <option key={value} value={value}>{locations[value]}</option>)}</select></label>
            {needsAddress ? <label>Địa chỉ đã xác nhận<select value={addressId} required onChange={event => { invalidate(); setAddressId(event.target.value); }}><option value="">Chọn địa chỉ</option>{addresses.map(address => <option key={address.id || address._id} value={address.id || address._id}>{address.label}</option>)}</select></label> : <p>{setup.data.options.facilityAddress ?? 'Địa chỉ cơ sở chưa được cấu hình.'}</p>}
          </fieldset>
          {needsAddress && <p><Link to="/account/addresses" target="_blank">Thêm hoặc sửa địa chỉ trên bản đồ</Link><button type="button" className="booking-refresh" onClick={setup.retry}><RefreshCw size={16} />Tải lại địa chỉ</button></p>}
        </div>
      </div>
      <div className="booking-actions"><button className="pwc-button pwc-button-primary" disabled={busy || editingRepeat || !pets.length || needsAddress && !addresses.length || !needsAddress && !setup.data.options.facilityAddress}>{busy ? 'Đang lấy báo giá…' : 'Xem báo giá'}<ArrowRight size={17} /></button></div>
    </form>}
    {step === 1 && <section><h2>Sắp xếp người chăm sóc</h2>
      <section className="booking-schedule-review" aria-label="Lịch đã chọn">
        <span>{starts.length} buổi · {locations[location]} · Giờ Việt Nam</span>
        <strong>{scheduleLabel(starts[0])}{starts.length > 1 ? ` · thêm ${starts.length - 1} buổi` : ''}</strong>
      </section>
      {boarding ? (
        <p>PawWorld sẽ chia ca và sắp xếp người chăm sóc phù hợp cho lịch lưu trú của bạn.</p>
      ) : busy && !available ? (
        <p role="status">Đang kiểm tra người chăm sóc từng chăm thú cưng của bạn…</p>
      ) : previousSitters.length > 0 ? (
        <fieldset className="booking-preferred-sitter" disabled={busy}>
          <legend>Người chăm sóc mong muốn</legend>
          <p>Không bắt buộc. Chỉ liệt kê người chăm sóc đã từng chăm một trong các thú cưng bạn chọn.</p>
          <div className="booking-sitters">
            <label>
              <input type="radio" name="preferred-sitter" value="" checked={selected === ''} onChange={() => { setSelected(''); setError(''); }} />
              <span><strong>PawWorld sắp xếp</strong></span>
            </label>
            {previousSitters.map(sitter => (
              <label key={sitter.id}>
                <input type="radio" name="preferred-sitter" value={sitter.id} checked={selected === sitter.id}
                  disabled={sitter.unavailableVisits.some(v => !['DAY_OFF', 'OUTSIDE_WORKING_HOURS', 'SLOT_UNAVAILABLE'].includes(v.reason))}
                  onChange={() => { setSelected(sitter.id); setError(''); }} />
                <span>
                  <strong>{sitter.displayName}</strong>
                  {!sitter.eligible && (
                    <span className="booking-sitter-unavailable">
                      Không rảnh ở {sitter.unavailableVisits.map(v => `Buổi ${v.index + 1} (${scheduleLabel(v.start)})`).join(', ')}
                      {sitter.unavailableVisits[0]?.reason ? ` · ${unavailableText(sitter.unavailableVisits[0].reason)}` : ''}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p>PawWorld sẽ tự sắp xếp người chăm sóc phù hợp cho lịch đặt này.</p>
      )}
      <div className="booking-actions">
        <button type="button" disabled={busy} onClick={() => { setStep(0); setError(''); }}><ArrowLeft size={17} />Quay lại</button>
        <button type="button" className="pwc-button pwc-button-primary" disabled={busy} onClick={() => { setStep(2); setError(''); }}>Xem lại đơn<ArrowRight size={17} /></button>
      </div>
    </section>}
    {step === 2 && <form onSubmit={confirm}><h2>Xác nhận đặt dịch vụ</h2><fieldset disabled={busy || uncertain}>
      <dl className="booking-review">
        <div><dt>Thú cưng</dt><dd>{pets.filter(pet => petIds.includes(pet.id || pet._id)).map(pet => pet.name).join(', ')}</dd></div>
        <div><dt>Người chăm sóc mong muốn</dt><dd>{selectedSitter ? selectedSitter.displayName : 'PawWorld sắp xếp'}</dd></div>
        <div><dt>Địa điểm</dt><dd>{locations[location]} · {needsAddress ? addresses.find(address => (address.id || address._id) === addressId)?.label : setup.data.options.facilityAddress}</dd></div>
      </dl>
      <ul>{starts.map((value, index) => <li key={index}>Buổi {index + 1}: {scheduleLabel(value)}</li>)}</ul>
      <dl className="booking-review">{[['Dịch vụ', quote.baseVnd], ['Phụ phí', quote.surchargeVnd], ['Giảm combo', -quote.discountVnd], ['Phí bậc giá', quote.orderFeeVnd], ['Tổng thanh toán', quote.totalVnd]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>
      <p>{quote.paymentMode === 'PREPAY' ? 'Đơn nhiều buổi cần thanh toán đủ trong 15 phút trước khi gửi lời mời.' : 'Thanh toán sau khi hoàn tất dịch vụ.'}</p>
      <p>Hệ thống tìm người chăm sóc sau khi đơn đủ điều kiện. Ca được xác nhận khi người chăm sóc nhận lời mời.</p>
      {quote.items.map((item, index) => <details key={index}><summary>{item.servicePolicy?.title ?? 'Điều kiện dịch vụ'}</summary><p className="pwc-checkout-policy">{item.servicePolicy?.body}</p></details>)}
      <label className="booking-check"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} />Tôi xác nhận lịch, báo giá và điều kiện dịch vụ.</label>
    </fieldset><PolicyContextLinks context="booking" /><div className="booking-actions"><button type="button" disabled={busy || uncertain} onClick={() => { setStep(1); setError(''); }}><ArrowLeft size={17} />Quay lại</button><button className="pwc-button pwc-button-primary" disabled={busy || !consent}><CalendarCheck size={17} />{busy ? 'Đang xác nhận…' : uncertain ? 'Kiểm tra lại đơn' : 'Xác nhận đặt dịch vụ'}</button></div></form>}
    {quote && step > 0 && <p className="booking-expiry">Báo giá đến {new Date(quote.expiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })} (giờ Việt Nam) · {money(quote.totalVnd)}</p>}
    {error && <p role="alert" className="booking-error">{error}</p>}
    <Dialog
      open={Boolean(msg162Dialog)}
      onClose={() => setMsg162Dialog(null)}
      title="Người chăm sóc mong muốn không rảnh"
      description={
        msg162Dialog
          ? `${msg162Dialog.sitterName} không rảnh vào ${msg162Dialog.visits.map(v => `Buổi ${v.index + 1} (${scheduleLabel(v.start)})`).join(', ')}. Bạn có thể đổi ngày hoặc vẫn đặt lịch.`
          : ''
      }
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setMsg162Dialog(null);
              setStep(0);
              setError('');
            }}
          >
            Đổi ngày
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              setMsg162Dialog(null);
              void executeConfirm([...(msg162Dialog.accepted ?? []), ...msg162Dialog.visits.map(visit => visit.index)]);
            }}
          >
            Vẫn đặt lịch
          </Button>
        </>
      }
    />
  </div>;
}

export function ServiceBookingPage({ loadCatalog = loadPublicCatalog }) {
  const session = useSession(), { serviceId } = useParams(), [params, setParams] = useSearchParams();
  const catalog = useApiResource(loadCatalog), service = catalog.data?.services?.find(row => row.id === serviceId);
  const api = useMemo(() => createServiceBasketApi({ getCsrfToken: session.getCsrfToken }), [session.getCsrfToken]);
  if (catalog.status === 'loading') return <main className="pwc-page"><p role="status">Đang tải dịch vụ…</p></main>;
  if (!service) return <main className="pwc-page"><h1>Dịch vụ chưa khả dụng</h1><Link data-page-back to="/services">Về danh mục</Link><button onClick={catalog.retry}>Tải lại</button></main>;
  // After every hook. A shop-only service has no home visit to book here; `?booking=` is the confirmation of a booking just made.
  if (isShopOnly(service) && !params.get('booking')) return service.groomingBookingEnabled === false
    ? <main className="pwc-page"><h1>Đặt lịch tại cửa hàng chưa mở</h1><Link to={'/services/' + service.id}>Xem dịch vụ</Link></main>
    : <Navigate to={groomingPath(service)} replace />;
  const visual = serviceVisual(service);
  return <main className="pwc-page service-booking"><Link className="pwc-service-page-back" data-page-back to={'/services/' + service.id}>← Chi tiết dịch vụ</Link>
    <header className="booking-service"><img src={visual.src} alt={visual.alt} /><div><p>Đặt dịch vụ</p><h1>{service.name}</h1><p>{formatCatalogPrice(service.price)}</p></div></header>
    {session.status === 'authenticated' && hasRole(session.user, 'CUSTOMER') ? params.get('booking') ? <BookingConfirmation api={api} />
      : <BookingFlow key={session.user.id + service.id} service={service} api={api} onBooked={booking => { setParams({ booking: booking.id }); globalThis.scrollTo?.({ top: 0, behavior: 'smooth' }); }} />
      : <section><h2>{session.status === 'loading' ? 'Đang kiểm tra phiên…' : 'Đăng nhập để đặt dịch vụ'}</h2><Link className="pwc-button pwc-button-primary" to="/sign-in">Đăng nhập</Link></section>}
  </main>;
}
