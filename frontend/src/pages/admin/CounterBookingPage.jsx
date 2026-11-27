import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import {
  buildCounterBookingInput, counterBookingCurrency, counterBookingDateLabel,
  counterBookingLocalDate, counterBookingTierLabel, COUNTER_BOOKING_LOCATION_LABELS,
  isCounterBookingReady, normalizeCounterBookingService
} from '../../utils/counter-booking.js';
import './counter-booking.css';

const asText = value => typeof value === 'string' ? value.trim() : '';
const petDescription = pet => [pet.species === 'DOG' ? 'Chó' : pet.species === 'CAT' ? 'Mèo' : pet.species,
  pet.breedName ?? pet.breed ?? pet.breedCode, Number.isFinite(pet.weightKg) ? pet.weightKg + ' kg' : ''].filter(Boolean).join(' · ');
const errorMessage = error => {
  if (error?.status === 404 || error?.status === 503) return 'Chức năng đặt dịch vụ tại quầy chưa được kích hoạt trên máy chủ.';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') return 'Không kết nối được máy chủ. Vui lòng thử lại.';
  return 'Chưa thực hiện được thao tác. Vui lòng kiểm tra và thử lại.';
};
const petSelectionKey = (serviceId, ids) => serviceId + ':' + [...ids].sort().join(',');

function PetDialog({ onCancel, onSave, busy, api }) {
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('DOG');
  const [breedCode, setBreedCode] = useState('');
  const [breeds, setBreeds] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [careNeedsConfirmed, setCareNeedsConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!api.petCatalog) return undefined;
    api.petCatalog().then(data => {
      if (active) setBreeds(data?.breeds ?? []);
    }).catch(() => { if (active) setCatalogError('Chưa tải được danh mục giống. Vui lòng thử lại sau.'); });
    return () => { active = false; };
  }, [api]);
  const availableBreeds = breeds.filter(breed => breed.species === species);
  return <div className="counter-booking-dialog-backdrop" onMouseDown={onCancel}>
    <section className="counter-booking-dialog" role="dialog" aria-modal="true" aria-labelledby="cb-pet-modal-title"
      onMouseDown={event => event.stopPropagation()}>
      <div className="cb-dialog-title"><h2 id="cb-pet-modal-title">Thêm thú cưng</h2>
        <button type="button" className="cb-icon-button" aria-label="Đóng" onClick={onCancel}><X size={19} /></button></div>
      <form onSubmit={event => { event.preventDefault(); onSave({ name: name.trim(), species, breedCode, weightKg: Number(weightKg),
        traits: [], careNeedsConfirmed }); }}>
        <label>Tên thú cưng<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Loài<select value={species} onChange={event => { setSpecies(event.target.value); setBreedCode(''); }}>
          <option value="DOG">Chó</option><option value="CAT">Mèo</option></select></label>
        <label>Giống<select required value={breedCode} onChange={event => setBreedCode(event.target.value)}>
          <option value="">Chọn giống</option>
          {availableBreeds.map(breed => <option key={breed.code} value={breed.code}>{breed.name}</option>)}
        </select></label>
        <label>Cân nặng (kg)<input required type="number" min="0.1" max="200" step="0.1" value={weightKg}
          onChange={event => setWeightKg(event.target.value)} /></label>
        <label><input type="checkbox" checked={careNeedsConfirmed}
          onChange={event => setCareNeedsConfirmed(event.target.checked)} /> Đã xác nhận nhu cầu chăm sóc</label>
        {catalogError && <p role="alert">{catalogError}</p>}
        <div className="cb-dialog-actions"><button type="button" onClick={onCancel}>Hủy</button>
          <button type="submit" className="cb-button-primary" disabled={busy || !asText(name) || !breedCode || !careNeedsConfirmed
            || Number(weightKg) <= 0 || Number(weightKg) > 150}>
            {busy ? 'Đang lưu…' : 'Lưu thú cưng'}</button></div>
      </form>
    </section>
  </div>;
}

function CartLine({ line, addresses, onRemove, onUpdate, disabled }) {
  const hasMoreSettings = !line.spa || line.location !== 'FACILITY';
  return <article className="cb-cart-line" data-testid="counter-booking-cart-line">
    <div className="cb-cart-line-head"><div><strong>{line.name}</strong><span>{line.petNames.join(', ')} · {line.petDescriptions.join(', ')}</span></div>
      <b>{counterBookingCurrency(line.priceVnd)}</b></div>
    <div className="cb-cart-line-controls"><label className="cb-select-wrap"><span className="cb-visually-hidden">Nơi làm {line.name}</span>
      <select value={line.location} disabled={disabled} onChange={event => onUpdate(line.key, { location: event.target.value })}>
        {line.locations.map(location => <option value={location} key={location}>{COUNTER_BOOKING_LOCATION_LABELS[location]}</option>)}
      </select><ChevronDown size={13} aria-hidden="true" /></label>
      <small>{line.spa && line.location === 'FACILITY' ? 'Theo khung giờ cửa hàng' : line.visitCount + ' buổi'}</small></div>
    {hasMoreSettings && <div className="cb-cart-line-detail">
      <label>Các buổi<input type="number" min="1" max="60" value={line.visitCount} disabled={disabled}
        onChange={event => onUpdate(line.key, { visitCount: Math.max(1, Math.min(60, Number(event.target.value) || 1)) })} /></label>
      {Array.from({ length: line.visitCount }, (_, index) => <label key={index}>Buổi {index + 1}<input type="datetime-local" required
        value={line.starts?.[index] ?? ''} disabled={disabled} onChange={event => onUpdate(line.key, {
          starts: Array.from({ length: line.visitCount }, (_, i) => i === index ? event.target.value : line.starts?.[i] ?? '')
        })} /></label>)}
      {line.unitLabel === 'ngày' && <label>Số ngày<input type="number" min="1" max="60" value={line.dayCount ?? 1}
        disabled={disabled} onChange={event => onUpdate(line.key, { dayCount: Number(event.target.value) })} /></label>}
      {line.location !== 'FACILITY' && <label>Địa chỉ<select value={line.addressId || ''} disabled={disabled}
        onChange={event => onUpdate(line.key, { addressId: event.target.value })}>
        <option value="">Chọn địa chỉ</option>{addresses.map(address => <option value={address.id} key={address.id}>{address.label || address.address || address.fullAddress}</option>)}
      </select></label>}
    </div>}
    <button className="cb-cart-remove" type="button" disabled={disabled} aria-label={'Bỏ ' + line.name + ' khỏi giỏ'}
      onClick={() => onRemove(line.key)}><X size={16} /></button>
  </article>;
}

export function CounterBookingPage({ api, initialDate = counterBookingLocalDate(), initialPhone = '' }) {
  const [phone, setPhone] = useState(initialPhone);
  const [customer, setCustomer] = useState(null);
  const [customerMissing, setCustomerMissing] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const [petDialogOpen, setPetDialogOpen] = useState(false);
  const [petSaving, setPetSaving] = useState(false);
  const [petError, setPetError] = useState('');
  const [chosenPets, setChosenPets] = useState([]);
  const [services, setServices] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState('09:00');
  const [slots, setSlots] = useState([]);
  const [slotVerified, setSlotVerified] = useState(false);
  const [pickup, setPickup] = useState(false);
  const [pickupAddressId, setPickupAddressId] = useState('');
  const [pickupQuote, setPickupQuote] = useState(null);
  const [pickupError, setPickupError] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('COUNTER_CASH');
  const [busy, setBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [vietQrUrl, setVietQrUrl] = useState('');
  const [pendingReceipt, setPendingReceipt] = useState(null);
  const [groomingAnswers, setGroomingAnswers] = useState({});
  const requestKey = useRef(null);

  const pets = customer?.pets ?? [], addresses = customer?.addresses ?? [];
  const selectedPets = pets.filter(pet => chosenPets.includes(pet.id));
  const hasFacility = cart.some(line => line.location === 'FACILITY');
  const basketLines = cart.map(line => ({ ...line,
    petNames: line.petIds.map(id => pets.find(pet => pet.id === id)?.name || 'Thú cưng'),
    petDescriptions: line.petIds.map(id => {
      const pet = pets.find(item => item.id === id);
      return pet ? petDescription(pet) : '';
    })
  }));
  const pickupEnabled = pickup && hasFacility;
  const spaPets = useMemo(() => {
    const grouped = new Map();
    for (const line of cart.filter(row => row.spa && row.location === 'FACILITY')) for (const petId of line.petIds)
      grouped.set(petId, [...new Set([...(grouped.get(petId) ?? []), line.serviceId])]);
    return [...grouped].map(([petId, serviceIds]) => ({ petId, serviceIds }));
  }, [cart]);
  const spaKey = JSON.stringify(spaPets);
  const answersReady = spaPets.every(row => groomingAnswers[row.petId]?.biteOrScratch && groomingAnswers[row.petId]?.skinCondition);
  const scheduleReady = cart.every(line => line.spa && line.location === 'FACILITY' ||
    (Array.from({ length: line.visitCount }, (_, i) => line.starts?.[i]).every(Boolean) &&
      (line.location === 'FACILITY' || Boolean(line.addressId))));
  const currentInput = useMemo(() => customer && buildCounterBookingInput({
    customer, petIds: chosenPets, lines: cart, pickup: pickupEnabled, addressId: pickupAddressId,
    date, time: time || '00:00', paymentMethod,
    answers: spaPets.filter(row => groomingAnswers[row.petId]?.biteOrScratch && groomingAnswers[row.petId]?.skinCondition)
      .map(row => ({ petId: row.petId, ...groomingAnswers[row.petId] }))
  }), [customer, chosenPets, cart, pickupEnabled, pickupAddressId, date, time, paymentMethod, spaPets, groomingAnswers]);
  const ready = isCounterBookingReady({ customer, petIds: chosenPets, lines: cart, date, time: spaPets.length ? time : '00:00',
    quote, pickup: pickupEnabled, pickupQuote }) && Boolean(quote?.previewId) && (spaPets.length ? slotVerified : true) && answersReady && scheduleReady && !busy && !pendingReceipt;

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true); setCatalogError('');
    try {
      const records = await api.catalog();
      setServices((Array.isArray(records) ? records : []).map(normalizeCounterBookingService)
        .filter(service => service.id && service.locations.length));
    } catch (error) { setCatalogError(errorMessage(error)); }
    finally { setCatalogLoading(false); }
  }, [api]);
  useEffect(() => { refreshCatalog(); }, [refreshCatalog]);
  useEffect(() => {
    let active = true;
    setSlotVerified(false);
    setSlots([]);
    if (!customer?.id || !JSON.parse(spaKey).length) return () => { active = false; };
    api.slots(date, { customerId: customer.id, pets: JSON.parse(spaKey) }).then(value => {
      if (!active) return;
      const times = Array.isArray(value) ? value : value?.slots ?? [];
      const valid = times.filter(row => typeof row === 'string' || row.state === 'AVAILABLE').map(row => typeof row === 'string' ? row : row.time).filter(Boolean);
      setSlots(valid); setSlotVerified(true);
      setTime(old => valid.includes(old) ? old : valid[0] ?? '');
    }).catch(() => { if (active) setSlotVerified(false); });
    return () => { active = false; };
  }, [api, date, customer?.id, spaKey]);
  useEffect(() => {
    let active = true;
    setPickupQuote(null); setPickupError('');
    if (!pickupEnabled || !pickupAddressId || !customer?.id) return () => { active = false; };
    api.pickupQuote({ customerId: customer.id, addressId: pickupAddressId }).then(result => {
      if (!active) return;
      setPickupQuote(result);
      if (result.allowed === false) setPickupError(Number.isFinite(result.distanceKm) && Number.isFinite(result.maxKm)
        ? `Địa chỉ này cách cửa hàng ${result.distanceKm} km, quá ${result.maxKm} km. Không đón được; vui lòng mang thú cưng đến cửa hàng.`
        : 'Hiện chưa tính được khoảng cách nên chưa đón được. Vui lòng mang thú cưng đến cửa hàng hoặc thử lại sau.');
    }).catch(() => {
      if (active) setPickupError('Hiện chưa tính được khoảng cách nên chưa đón được. Vui lòng mang thú cưng đến cửa hàng hoặc thử lại sau.');
    });
    return () => { active = false; };
  }, [api, customer?.id, pickupEnabled, pickupAddressId]);
  useEffect(() => {
    let active = true;
    setQuote(null); setQuoteError('');
    if (!currentInput || !cart.length || !chosenPets.length || (spaPets.length && (!time || !slotVerified)) || !answersReady || !scheduleReady || (pickupEnabled && !pickupQuote?.allowed))
      return () => { active = false; };
    api.preview(currentInput).then(result => { if (active) setQuote(result); })
      .catch(error => { if (active) setQuoteError(errorMessage(error)); });
    return () => { active = false; };
  }, [api, currentInput, cart.length, chosenPets.length, pickupEnabled, pickupQuote?.allowed, slotVerified, time, spaPets.length, answersReady, scheduleReady]);

  async function lookupCustomer(event) {
    event.preventDefault(); setCustomerError(''); setCustomerMissing(false);
    if (!/^0\d{9}$/.test(phone.replace(/\s/g, ''))) {
      setCustomerError('Vui lòng nhập số điện thoại gồm 10 chữ số.'); return;
    }
    setCustomerLoading(true); setCustomer(null); setChosenPets([]); setCart([]); setPickup(false); setGroomingAnswers({});
    setPickupAddressId(''); setPickupQuote(null); setVietQrUrl('');
    try {
      const result = await api.lookup(phone.replace(/\s/g, ''));
      const found = result?.customer ?? result;
      if (!found?.id) { setCustomerMissing(true); return; }
      setCustomer({ ...found, pets: found.pets ?? result.pets ?? [], addresses: found.addresses ?? result.addresses ?? [] });
    } catch (error) { setCustomerError(errorMessage(error)); }
    finally { setCustomerLoading(false); }
  }
  async function createCustomer(event) {
    event.preventDefault(); setCustomerLoading(true); setCustomerError('');
    try {
      const value = await api.createCustomer({ phone: phone.replace(/\s/g, ''), displayName: newCustomerName.trim() });
      setCustomer({ ...value, pets: value.pets ?? [], addresses: value.addresses ?? [] }); setCustomerMissing(false);
    } catch (error) { setCustomerError(errorMessage(error)); }
    finally { setCustomerLoading(false); }
  }
  async function savePet(input) {
    setPetError(''); setPetSaving(true);
    try {
      const value = await api.createPet(customer.id, input);
      setCustomer(previous => ({ ...previous, pets: [...previous.pets, value] }));
      setChosenPets(previous => [...previous, value.id]); setPetDialogOpen(false);
    } catch (error) { setPetError(errorMessage(error)); }
    finally { setPetSaving(false); }
  }
  function addService(service) {
    if (!chosenPets.length || cart.length >= 20 || !service.locations.length) return;
    const key = petSelectionKey(service.id, chosenPets);
    if (cart.some(line => line.key === key)) return;
    setCart(old => [...old, {
      key, serviceId: service.id, name: service.name, priceVnd: service.priceVnd,
      locations: service.locations, spa: service.spa, unitLabel: service.unitLabel, petIds: [...chosenPets],
      location: service.locations[0], visitCount: 1, addressId: ''
    }]);
    requestKey.current = null; setCheckoutMessage('');
  }
  function updateLine(key, changes) {
    setCart(old => old.map(line => line.key === key ? { ...line, ...changes } : line));
    requestKey.current = null;
  }
  async function checkout() {
    if (!ready) return;
    setBusy(true); setCheckoutMessage(''); setVietQrUrl('');
    requestKey.current ??= globalThis.crypto.randomUUID();
    try {
      const result = await api.checkout({ previewId: quote.previewId }, requestKey.current);
      if (result?.status === 'PAID' || result?.paid === true) {
        setCheckoutMessage(`Đã đặt lịch và thu tiền. Khách đăng nhập bằng số ${phone.replace(/\s/g, '')} để xem lịch.`);
        setCart([]); setPickup(false); setPickupQuote(null); requestKey.current = null;
      } else if (paymentMethod === 'COUNTER_VIETQR' && result?.receiptId && result.status === 'PENDING') {
        setPendingReceipt(result.receiptId);
        if (/^https:\/\/pay\.payos\.vn\/web\//u.test(result.checkoutUrl ?? '')) setVietQrUrl(result.checkoutUrl);
        setCheckoutMessage('Đã giữ chỗ trong 15 phút. Đang chờ payOS xác nhận thanh toán.');
      } else setCheckoutMessage('Yêu cầu đang được xử lý. Kiểm tra trạng thái trước khi thao tác tiếp.');
    } catch (error) { setCheckoutMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function checkPayment() {
    if (!pendingReceipt || busy) return;
    setBusy(true);
    try {
      const result = await api.paymentStatus(pendingReceipt);
      if (result.status === 'PAID') {
        setCheckoutMessage('Đã đặt lịch và thu tiền.');
        setCart([]); setPickup(false); setPickupQuote(null); requestKey.current = null;
        setPendingReceipt(null); setVietQrUrl('');
      } else if (result.status === 'EXPIRED') {
        setCheckoutMessage('Mã VietQR đã hết hạn. Giỏ dịch vụ được giữ nguyên; vui lòng làm mới báo giá.');
        setPendingReceipt(null); setVietQrUrl(''); requestKey.current = null;
        setQuote(await api.preview(currentInput));
      } else if (result.status === 'RECONCILIATION_REQUIRED') {
        setVietQrUrl('');
        setCheckoutMessage('Thanh toán cần đối soát. Không thu tiền lần nữa; vui lòng liên hệ quản trị.');
      } else {
        setVietQrUrl(/^https:\/\/pay\.payos\.vn\/web\//u.test(result.checkoutUrl ?? '') ? result.checkoutUrl : '');
        setCheckoutMessage('Chưa nhận xác nhận thanh toán từ payOS.');
      }
    } catch (error) { setCheckoutMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function cancelPayment() {
    if (!pendingReceipt || busy) return;
    setBusy(true);
    try {
      const result = await api.cancelPayment(pendingReceipt);
      if (result.status === 'CANCELLED' || result.status === 'EXPIRED') {
        setCheckoutMessage('Đã huỷ mã VietQR và nhả chỗ. Giỏ dịch vụ được giữ nguyên.');
        setPendingReceipt(null); setVietQrUrl(''); requestKey.current = null;
        setQuote(null);
      } else {
        setCheckoutMessage('Chưa thể huỷ vì giao dịch đang được xác minh. Vui lòng kiểm tra thanh toán.');
      }
    } catch (error) { setCheckoutMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  const filteredServices = services.filter(service => service.name.toLocaleLowerCase('vi')
    .includes(search.toLocaleLowerCase('vi')));
  const subtotal = quote?.subtotalVnd ?? quote?.subtotal ?? null;
  const discount = quote?.tierDiscountVnd ?? quote?.tierDiscount ?? null;
  const pickupFee = quote?.pickupFeeVnd ?? (pickupEnabled ? pickupQuote?.feeVnd : 0);
  const total = quote?.totalVnd;
  return <section className="counter-booking-page" aria-labelledby="counter-booking-title">
    <header className="cb-page-heading">
      <h1 id="counter-booking-title">Đặt dịch vụ tại quầy</h1>
      <p>Tìm khách theo số điện thoại, đặt dịch vụ tại nhà hoặc tại cửa hàng và thu tiền.</p>
    </header>
    <div className="cb-main-grid">
      <section className="cb-panel cb-customer-panel" aria-labelledby="cb-customer-heading">
        <h2 id="cb-customer-heading">Khách hàng</h2>
        <form className="cb-customer-search" onSubmit={lookupCustomer}>
          <label htmlFor="cb-phone">Số điện thoại</label>
          <div><input id="cb-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="Nhập số điện thoại"
            value={phone} onChange={event => setPhone(event.target.value)} required />
            <button type="submit" disabled={customerLoading}>{customerLoading ? 'Đang tìm…' : 'Tìm khách'}</button></div>
        </form>
        {customer && <div className="cb-customer-found" role="status"><Check size={18} />
          {customer.displayName ?? customer.fullName} · hạng {counterBookingTierLabel(customer.tier?.code ?? customer.tierCode)}
        </div>}
        {customerMissing && <form className="cb-new-customer" onSubmit={createCustomer}>
          <p role="status">Chưa có khách hàng dùng số này. Nhập họ tên để tạo hồ sơ khách.</p>
          <label htmlFor="cb-new-customer-name">Họ tên</label>
          <div><input id="cb-new-customer-name" required minLength={2} value={newCustomerName}
            onChange={event => setNewCustomerName(event.target.value)} placeholder="Nhập họ tên" />
            <button type="submit" disabled={customerLoading || !newCustomerName.trim()}>Tạo hồ sơ khách</button></div>
        </form>}
        {customerError && <p className="cb-feedback cb-feedback-error" role="alert">{customerError}</p>}
        <div className="cb-divider" />
        <div className="cb-section-heading"><h3>Thú cưng</h3>
          <button type="button" className="cb-text-action" disabled={!customer} onClick={() => setPetDialogOpen(true)}>
            <Plus size={14} /> Thêm thú cưng</button></div>
        <div className="cb-pet-list">
          {pets.map(pet => <label key={pet.id} className={'cb-pet-option' + (chosenPets.includes(pet.id) ? ' is-selected' : '')}>
            <input type="checkbox" checked={chosenPets.includes(pet.id)}
              onChange={event => { setChosenPets(current => event.target.checked
                ? [...current, pet.id] : current.filter(id => id !== pet.id)); requestKey.current = null; }} />
            <span className="cb-checkbox-icon"><Check size={15} /></span>
            <span><strong>{pet.name}</strong><small>{petDescription(pet)}</small></span></label>)}
          {!customer && <p className="cb-empty-small">Tìm khách theo số điện thoại để chọn thú cưng.</p>}
          {customer && pets.length === 0 && <p className="cb-empty-small">Khách chưa có thú cưng. Chọn “Thêm thú cưng” để tạo hồ sơ.</p>}
        </div>
        <div className="cb-divider" />
        <div className="cb-section-heading"><h3>Tìm dịch vụ</h3></div>
        <label className="cb-service-search"><Search size={19} aria-hidden="true" />
          <span className="cb-visually-hidden">Nhập tên dịch vụ</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nhập tên dịch vụ" /></label>
        <div className="cb-service-table">
          <div className="cb-service-table-head"><span>Dịch vụ</span><span>Giá từ</span><span /></div>
          {filteredServices.map(service => {
            const key = petSelectionKey(service.id, chosenPets);
            const included = cart.some(line => line.key === key);
            return <div className="cb-service-row" key={service.id}>
              <div><strong>{service.name}</strong><div className="cb-service-tags">{service.locations.map(location =>
                <span className="cb-chip" key={location}>{COUNTER_BOOKING_LOCATION_LABELS[location]}</span>)}</div></div>
              <b>{counterBookingCurrency(service.priceVnd)}</b>
              <button className={included ? 'cb-added-button' : 'cb-add-button'} type="button"
                disabled={included || !chosenPets.length || cart.length >= 20}
                onClick={() => addService(service)}>{included ? 'Đã thêm' : '+ Thêm'}</button>
            </div>;
          })}
          {catalogLoading && <p className="cb-table-message">Đang tải dịch vụ…</p>}
          {catalogError && <p className="cb-feedback cb-feedback-error" role="alert">{catalogError}
            <button type="button" onClick={refreshCatalog}>Thử lại</button></p>}
          {!catalogLoading && !catalogError && !filteredServices.length && <p className="cb-table-message">Không tìm thấy dịch vụ phù hợp.</p>}
        </div>
        <div className="cb-slot-section">
          <div className="cb-slot-title"><h3>Khung giờ tại cửa hàng · {counterBookingDateLabel(date)}</h3>
            <label><span className="cb-visually-hidden">Chọn ngày làm dịch vụ</span><input type="date" min={counterBookingLocalDate(0)}
              max={counterBookingLocalDate(30)} value={date} disabled={busy} onChange={event => { setDate(event.target.value); requestKey.current = null; }} /></label></div>
          <div className="cb-slot-list" role="group" aria-label="Khung giờ tại cửa hàng">
            {slots.map(slot => <button key={slot} type="button" className={time === slot ? 'is-selected' : ''}
              aria-pressed={time === slot} onClick={() => { setTime(slot); requestKey.current = null; }}>{slot}</button>)}
            {!slots.length && <p className="cb-empty-small">Chưa có khung giờ khả dụng.</p>}
          </div>
          {spaPets.length > 0 && !slotVerified && <p className="cb-slot-unverified">Chưa xác minh được khung giờ với máy chủ, chưa thể đặt lịch.</p>}
          {spaPets.map(row => <fieldset key={row.petId} disabled={busy} className="cb-cart-line-detail">
            <legend>Câu hỏi spa · {pets.find(pet => pet.id === row.petId)?.name}</legend>
            <label>Có cắn hoặc cào khi bị giữ không?
              <select value={groomingAnswers[row.petId]?.biteOrScratch ?? ''} onChange={event => {
                const value = event.target.value;
                setGroomingAnswers(old => ({ ...old, [row.petId]: { ...old[row.petId], biteOrScratch: value } })); requestKey.current = null;
              }}><option value="">Chọn câu trả lời</option><option value="NO">Không</option><option value="SOMETIMES">Đôi khi</option><option value="YES">Có</option></select>
            </label>
            <label>Có bệnh da hoặc vết thương không?
              <select value={groomingAnswers[row.petId]?.skinCondition ?? ''} onChange={event => {
                const value = event.target.value;
                setGroomingAnswers(old => ({ ...old, [row.petId]: { ...old[row.petId], skinCondition: value } })); requestKey.current = null;
              }}><option value="">Chọn câu trả lời</option><option value="NO">Không</option><option value="YES">Có</option></select>
            </label>
          </fieldset>)}
        </div>
      </section>
      <aside className="cb-panel cb-cart-panel" aria-labelledby="cb-cart-heading">
        <div className="cb-cart-heading"><h2 id="cb-cart-heading">Giỏ dịch vụ</h2><span className="cb-count-chip">{cart.length} dịch vụ</span></div>
        <div className="cb-cart-lines">
          {basketLines.map(line => <CartLine key={line.key} line={line} addresses={addresses}
            onRemove={key => { setCart(old => old.filter(item => item.key !== key)); requestKey.current = null; }}
            onUpdate={updateLine} disabled={busy} />)}
          {!cart.length && <p className="cb-cart-empty">Chọn thú cưng và thêm dịch vụ để bắt đầu.</p>}
        </div>
        {hasFacility && <div className="cb-pickup">
          <label className={'cb-pickup-toggle' + (pickupEnabled ? ' is-selected' : '')}>
            <input type="checkbox" checked={pickupEnabled} onChange={event => { setPickup(event.target.checked); requestKey.current = null; }} />
            <span className="cb-checkbox-icon"><Check size={15} /></span>
            <span><strong>Đón và trả tận nhà</strong><small>Cửa hàng đến nhà đón và đưa thú cưng về</small></span></label>
          {pickupEnabled && <><label className="cb-pickup-address"><span className="cb-visually-hidden">Địa chỉ đón</span>
            <select value={pickupAddressId} onChange={event => { setPickupAddressId(event.target.value); requestKey.current = null; }}>
              <option value="">Chọn địa chỉ đón</option>
              {addresses.map(address => <option key={address.id} value={address.id}>
                {address.label ?? address.fullAddress ?? address.address}</option>)}
            </select><ChevronDown size={15} aria-hidden="true" /></label>
            {pickupQuote?.allowed && <div className="cb-pickup-distance"><span>Khoảng cách</span><b>
              {Number(pickupQuote.distanceKm).toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km</b></div>}
            {pickupError && <p className="cb-feedback cb-feedback-error" role="alert">{pickupError}</p>}
          </>}
        </div>}
        <div className="cb-checkout-summary">
          <div><span>Tạm tính</span><b>{counterBookingCurrency(subtotal)}</b></div>
          <div><span>Giảm giá hạng {counterBookingTierLabel(customer?.tier?.code ?? customer?.tierCode)}</span>
            <b>{discount === null ? '—' : '− ' + counterBookingCurrency(discount)}</b></div>
          {pickupEnabled && <div><span>Phí đón (cả hai chiều)</span><b>{counterBookingCurrency(pickupFee)}</b></div>}
          <div className="cb-total"><span>Tổng tiền</span><strong>{counterBookingCurrency(total)}</strong></div>
        </div>
        {quoteError && <p role="alert" className="cb-feedback cb-feedback-error">{quoteError}</p>}
        <fieldset className="cb-payment-method"><legend>Cách thanh toán</legend>
          {[['COUNTER_CASH', 'Tiền mặt'], ['COUNTER_VIETQR', 'VietQR']].map(([value, label]) =>
            <label className={paymentMethod === value ? 'is-selected' : ''} key={value}>
              <input type="radio" name="counter-booking-payment" value={value} checked={paymentMethod === value}
                onChange={() => { setPaymentMethod(value); requestKey.current = null; }} />
              <span className="cb-radio-icon" />{label}</label>)}
        </fieldset>
        <button type="button" className="cb-checkout-button" disabled={!ready} onClick={checkout}>
          {busy ? 'Đang xử lý…' : paymentMethod === 'COUNTER_CASH' ? 'Đã nhận đủ tiền mặt · Đặt lịch' : 'Tạo mã VietQR'}
        </button>
        <p className="cb-checkout-footnote">Phụ thu phát sinh khi nhận thú (nếu có) trả khi nhận lại thú cưng.</p>
        {checkoutMessage && <p className="cb-feedback cb-checkout-feedback" role="status">{checkoutMessage}</p>}
        {vietQrUrl && <a className="cb-vietqr-link" href={vietQrUrl} target="_blank" rel="noopener noreferrer">
          Mở trang thanh toán VietQR
        </a>}
        {pendingReceipt && <button type="button" disabled={busy} onClick={checkPayment}>Kiểm tra thanh toán VietQR</button>}
        {pendingReceipt && <button type="button" disabled={busy} onClick={cancelPayment}>Huỷ VietQR</button>}
        {!quote && cart.length > 0 && <p className="cb-quote-note">Chỉ có thể thu tiền sau khi máy chủ xác nhận giá và lịch.</p>}
      </aside>
    </div>
    {petDialogOpen && <PetDialog api={api} onCancel={() => setPetDialogOpen(false)} onSave={savePet} busy={petSaving} />}
    {petError && <p className="cb-feedback cb-feedback-error" role="alert">{petError}</p>}
  </section>;
}
