import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useGroomingBooking } from '../../hooks/useGroomingBooking.js';
import { createGroomingBookingApi } from '../../services/grooming-booking-api.js';
import { GroomingPetsSection } from '../../components/grooming/GroomingPetsSection.jsx';
import { GroomingQuestionsSection } from '../../components/grooming/GroomingQuestionsSection.jsx';
import { GroomingSlotsSection } from '../../components/grooming/GroomingSlotsSection.jsx';
import { GroomingPriceSummary } from '../../components/grooming/GroomingPriceSummary.jsx';
import { GROOMING_TIERS, msg65 } from '../../constants/grooming-messages.js';
import { appointmentLabel } from '../../utils/grooming-booking.js';
import { formatVnd } from '../../utils/product-format.js';
import { hasRole } from '../../utils/role-access.js';
import '../../components/grooming/grooming-booking.css';

function Booked({ appointment, onAnother }) {
  const { slot, shop, pricing } = appointment;
  return <section className="grooming-card grooming-done" aria-labelledby="grooming-done">
    <p role="status" className="grooming-success"><CalendarCheck size={20} aria-hidden="true" />{msg65(slot.localDate, slot.startLocalTime)}</p>
    <h2 id="grooming-done">Lịch hẹn {appointment.code}</h2>
    <dl className="grooming-done-list">
      <div><dt>Giờ hẹn</dt><dd>{appointmentLabel(slot.localDate, slot.startLocalTime)}</dd></div>
      {shop.address && <div><dt>Cửa hàng</dt><dd>{shop.address}</dd></div>}
      {appointment.pets.map(pet => <div key={pet.petId}><dt>{pet.name}</dt><dd>{pet.services.map(service => service.name).join(', ')} · {formatVnd(pet.finalPriceVnd)}</dd></div>)}
      {pricing.tierDiscountVnd > 0 && <div><dt>Ưu đãi hạng {GROOMING_TIERS[appointment.tier?.code] ?? ''}</dt><dd>− {formatVnd(pricing.tierDiscountVnd)}</dd></div>}
      <div className="grooming-grand"><dt>Tổng</dt><dd>{formatVnd(pricing.totalVnd)}</dd></div>
    </dl>
    <div className="grooming-actions">
      <Link className="pwc-button pwc-button-secondary" to="/services">Về danh mục dịch vụ</Link>
      <button type="button" className="pwc-button pwc-button-primary" onClick={onAnother}>Đặt lịch khác</button>
    </div>
  </section>;
}

function GroomingBooking({ api, serviceId, onAnother }) {
  const flow = useGroomingBooking({ api, serviceId });
  const { setup, options } = flow;
  if (setup.status === 'loading') return <p role="status">Đang tải thông tin đặt lịch…</p>;
  if (setup.status !== 'success') {
    return <section className="grooming-card" role="alert">
      <h2>{setup.httpStatus === 404 ? 'Đặt lịch tại cửa hàng chưa mở' : 'Chưa tải được thông tin đặt lịch'}</h2>
      {setup.httpStatus !== 404 && <button type="button" className="pwc-button pwc-button-secondary" onClick={setup.retry}>Thử lại</button>}
    </section>;
  }
  if (flow.booked) return <Booked appointment={flow.booked} onAnother={onAnother} />;
  const hasPets = Object.values(flow.picked).some(choice => choice.answers.biteOrScratch !== 'YES' && choice.serviceIds.length > 0);
  return <div className="grooming-layout">
    <div className="grooming-steps">
      <GroomingPetsSection pets={flow.pets} options={options} picked={flow.picked} onTogglePet={flow.togglePet} onToggleService={flow.toggleService} />
      <GroomingQuestionsSection pets={flow.pets} options={options} picked={flow.picked} hotline={options.shop.hotline} onAnswer={flow.answer} />
      <GroomingSlotsSection options={options} date={flow.date} time={flow.time} slots={flow.slots} hasPets={hasPets}
        onDate={flow.chooseDate} onTime={flow.chooseTime} onRetry={flow.reloadSlots} />
    </div>
    <GroomingPriceSummary quote={flow.quote} priceReady={flow.priceReady} date={flow.date} slot={flow.selectedSlot} address={options.shop.address}
      notice={flow.notice} canConfirm={flow.canConfirm} busy={flow.busy} onConfirm={flow.confirm} onRetry={flow.reloadQuote} />
  </div>;
}

// Customer booking of bathing and grooming at the shop (UC-58). `?serviceId=` preselects that service for each pet chosen.
export function GroomingBookingPage({ createApi = createGroomingBookingApi }) {
  const session = useSession(), [params] = useSearchParams(), [round, setRound] = useState(0);
  const api = useMemo(() => createApi({ getCsrfToken: session.getCsrfToken }), [createApi, session.getCsrfToken]);
  const customer = session.status === 'authenticated' && hasRole(session.user, 'CUSTOMER');
  return <main className="pwc-page grooming-page">
    <nav aria-label="Đường dẫn"><Link to="/services">Dịch vụ</Link> / Đặt lịch tại cửa hàng</nav>
    <h1>Đặt lịch tắm và cắt tỉa tại cửa hàng</h1>
    <p className="grooming-lead">Chọn thú cưng, dịch vụ và giờ hẹn. Bạn xem giá cuối của từng thú trước khi xác nhận.</p>
    {customer ? <GroomingBooking key={`${session.user.id}-${round}`} api={api} serviceId={params.get('serviceId')} onAnother={() => setRound(value => value + 1)} />
      : <section className="grooming-card"><h2>{session.status === 'loading' ? 'Đang kiểm tra phiên…' : 'Đăng nhập để đặt lịch'}</h2>
        <Link className="pwc-button pwc-button-primary" to="/sign-in">Đăng nhập</Link></section>}
  </main>;
}
