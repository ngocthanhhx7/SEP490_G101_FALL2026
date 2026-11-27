import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, ClipboardList, Clock3, Images, MapPin, PawPrint, ShieldAlert } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import { formatCatalogPrice, formatPolicyDate } from '../../utils/catalog-format.js';
import { bookingActions, isShopGrooming } from '../../utils/shop-grooming.js';
import { CatalogState } from './PublicCatalog.jsx';
import { ServiceCareWorkflow } from './ServiceCareWorkflow.jsx';
import { serviceVisual } from './service-visuals.js';
import './service-detail.css';

const SPECIES = { DOG: 'Chó', CAT: 'Mèo' };
const LOCATIONS = { FACILITY: 'Tại cơ sở', HOME: 'Tại nhà', OUTDOOR: 'Ngoài trời' };
const SAFETY_SERVICES = new Set(['post-operative-care', 'basic-health-check', 'vet-escort', 'ear-eye-cleaning', 'pet-massage']);
// Recognize the old provisioning copy only. Custom policy text and FAQ answers are published content.
const LEGACY_DETAILS = /^Địa điểm: (?:Tại cơ sở|Tại gia|Ngoài trời)(?: \/ (?:Tại cơ sở|Tại gia|Ngoài trời))*\. Giá cơ bản [\d.,]+ VND\/[^.]+\.(?: Thời lượng tham khảo: \d+ phút\.)?$/;
const LEGACY_CHARGES = /^Phụ phí lấy mức cao nhất trong từng nhóm lông\/da, cân nặng và hành vi\/sức khỏe; các nhóm cộng trên giá cơ bản\. Combo giảm \d+% mỗi lượt, tối đa \d+% tiền dịch vụ trước phụ phí\. Phí bậc giá áp dụng theo chính sách báo giá hiện hành\. (Chăm sóc sức khỏe không thay thế chẩn đoán hoặc điều trị của bác sĩ thú y\.)$/;
const LEGACY_PRICE_ANSWER = 'Tiền dịch vụ theo đơn vị công bố, trừ combo rồi cộng phụ phí theo nhóm và phí bậc giá. Báo giá được xác nhận trước khi đặt.';
const BOOKING_STEPS = [
  ['Chọn thú cưng và lịch', 'Chọn nơi chăm sóc và thời gian phù hợp.'],
  ['Kiểm tra báo giá', 'Xem chi tiết giá và xác nhận điều kiện đặt lịch.'],
  ['Theo dõi lịch hẹn', 'Xem trạng thái trong mục lịch hẹn của bạn.'],
  ['Xem kết quả chăm sóc', 'Xem checklist, ảnh hoặc ghi chú được chia sẻ.']
];
const SHOP_STEPS = [
  ['Chọn thú cưng và khung giờ', 'Chọn lịch còn trống tại cửa hàng.'],
  ['Kiểm tra báo giá', 'Xem báo giá và xác nhận lịch hẹn.'],
  ['Theo dõi lịch hẹn', 'Xem thời gian hẹn để đưa bé tới cửa hàng.']
];

function getPublicCopy(service) {
  const safetyService = SAFETY_SERVICES.has(service.code);
  const policy = [];
  const safety = [];
  for (const value of service.policy.body.trim().split(/\r?\n/)) {
    const line = value.trim();
    if (!line || line === service.description || line === service.scope || LEGACY_DETAILS.test(line)) continue;
    const legacy = line.match(LEGACY_CHARGES);
    if (!legacy) policy.push(line);
    else if (safetyService) safety.push(legacy[1]);
    else policy.push(legacy[1]);
  }
  const exclusions = service.details?.exclusions ?? [];
  if (safetyService) safety.push(...exclusions);
  const faq = service.details?.faq?.filter(item =>
    item.question !== 'Giá cuối cùng được tính như thế nào?' || item.answer !== LEGACY_PRICE_ANSWER
  ) ?? [];
  return { policy, safety, exclusions: safetyService ? [] : exclusions, faq };
}

function BookingActions({ actions, fallback }) {
  if (!actions.length) return fallback;
  return actions.map((action, index) => (
    <Link
      className={'pwc-button ' + (index === 0 ? 'pwc-button-primary' : 'pwc-button-light')}
      key={action.kind}
      to={action.to}
    >
      {action.label}
      {index === 0 && <ArrowRight size={18} aria-hidden="true" />}
    </Link>
  ));
}

function ServicePhoto({ visual }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="pwc-detail-media">
      {visual?.src && !failed ? (
        <img
          className="pwc-service-detail-photo"
          src={visual.src}
          alt={visual.alt}
          style={{ objectPosition: visual.position }}
          onError={() => setFailed(true)}
          fetchPriority="high"
        />
      ) : (
        <span className="pwc-detail-placeholder"><PawPrint aria-hidden="true" /> Ảnh dịch vụ chưa có</span>
      )}
    </div>
  );
}

function ServiceHero({ service, actions, price, showAreas }) {
  const visual = serviceVisual(service, { allowGeneric: false });
  const locations = service.details?.locations?.map(code => LOCATIONS[code]).join(' / ');
  const duration = service.details?.durationMinutes;
  const shopClosed = service.groomingBookingEnabled === false && isShopGrooming(service);
  return (
    <section className="pwc-service-detail-hero" aria-labelledby="pwc-service-title">
      <div className="pwc-detail-intro">
        <h1 id="pwc-service-title">{service.name}</h1>
        {service.description && <p className="pwc-detail-description">{service.description}</p>}
        <ul className="pwc-detail-facts" role="list" aria-label="Thông tin dịch vụ">
          <li><PawPrint aria-hidden="true" />{service.species.map(code => SPECIES[code]).join(' và ')}</li>
          {locations && <li><MapPin aria-hidden="true" />{locations}</li>}
          {duration && <li><Clock3 aria-hidden="true" />{duration} phút</li>}
        </ul>
        <div className="pwc-detail-rate">
          <span>Giá cơ bản</span>
          <strong>{price ?? 'Chưa công bố'}</strong>
          <a href="#pricing">Chi tiết giá và phụ phí</a>
        </div>
        {shopClosed && <p className="pwc-detail-availability">Đặt lịch chăm sóc tại cửa hàng chưa mở.</p>}
        <div className="pwc-service-detail-actions">
          <BookingActions actions={actions} fallback={<Link className="pwc-button pwc-button-light" to="/contact">Hỏi về lịch phục vụ</Link>} />
          {showAreas && <Link className="pwc-detail-area-link" to="/service-areas"><MapPin size={17} aria-hidden="true" /> Kiểm tra khu vực phục vụ</Link>}
        </div>
      </div>
      <ServicePhoto key={visual?.src} visual={visual} />
    </section>
  );
}

function ServiceBenefits({ hasWorkflow, actions, shopBooking }) {
  const benefits = [
    hasWorkflow && [ClipboardList, 'Checklist theo từng lượt chăm sóc', '#care-workflow'],
    actions.length > 0 && [CalendarDays, 'Theo dõi lịch hẹn trong tài khoản', '#booking-steps'],
    hasWorkflow && actions.length > 0 && !shopBooking && [Images, 'Ảnh và ghi chú được chia sẻ', '#booking-report']
  ].filter(Boolean);
  if (!benefits.length) return null;
  return (
    <section className="pwc-detail-benefits" aria-labelledby="pwc-detail-benefits-title">
      <h2 id="pwc-detail-benefits-title">Tiện ích của dịch vụ</h2>
      <ul role="list">
        {benefits.map(([Icon, label, href]) => <li key={href}><a href={href}><Icon aria-hidden="true" />{label}</a></li>)}
      </ul>
    </section>
  );
}

function DetailList({ title, items }) {
  if (!items.length) return null;
  return <div><h3>{title}</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
}

function ServiceScope({ service, exclusions }) {
  const scope = service.scope.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const preparation = service.details?.preparation?.filter(text => text.trim()) ?? [];
  return (
    <section className="pwc-detail-section" aria-labelledby="pwc-detail-scope-title">
      <h2 id="pwc-detail-scope-title">Phạm vi chăm sóc và chuẩn bị</h2>
      <div className="pwc-detail-scope">
        {scope.length > 0 ? <DetailList title="Công việc thực hiện" items={scope} /> : <p>Phạm vi chi tiết chưa được công bố.</p>}
        <DetailList title="Chủ nuôi cần chuẩn bị" items={preparation} />
        <DetailList title="Ngoài phạm vi dịch vụ" items={exclusions} />
      </div>
    </section>
  );
}

function ServicePricing({ price, service, actions }) {
  const generalBooking = actions.some(action => action.kind !== 'SHOP');
  return (
    <section className="pwc-detail-section pwc-detail-pricing" id="pricing" tabIndex={-1} aria-labelledby="pwc-detail-pricing-title">
      <h2 id="pwc-detail-pricing-title">Giá và phụ phí</h2>
      <dl>
        <div><dt>Giá cơ bản</dt><dd>{price ?? 'Chưa công bố'}</dd></div>
        <div>
          <dt>Giá cuối cùng</dt>
          <dd>{actions.length ? 'Xem báo giá theo thông tin đặt lịch trước khi xác nhận.' : 'Hỏi PawWorld để biết giá áp dụng cho nhu cầu của bạn.'}</dd>
        </div>
        {generalBooking && <div>
          <dt>Phụ phí và combo</dt>
          <dd>Thông tin của bé và số buổi có thể ảnh hưởng đến báo giá. Mức phụ phí và ưu đãi (nếu có) được hiển thị trong báo giá.</dd>
        </div>}
        {isShopGrooming(service) && <div>
          <dt>Đặt tại cửa hàng</dt>
          <dd>{service.groomingBookingEnabled === false ? 'Chưa mở đặt lịch trực tuyến.' : 'Xem báo giá theo thú cưng và lịch đã chọn tại cửa hàng.'}</dd>
        </div>}
      </dl>
    </section>
  );
}

function BookingSteps({ shopBooking, hasWorkflow }) {
  const steps = shopBooking ? SHOP_STEPS : hasWorkflow ? BOOKING_STEPS : BOOKING_STEPS.slice(0, 3);
  return (
    <section className="pwc-detail-section" id="booking-steps" tabIndex={-1} aria-labelledby="pwc-detail-steps-title">
      <h2 id="pwc-detail-steps-title">Các bước đặt lịch và theo dõi</h2>
      <ol className="pwc-detail-booking-steps" role="list">
        {steps.map(([title, description], index) => (
          <li key={title} id={index === 3 ? 'booking-report' : undefined} tabIndex={index === 3 ? -1 : undefined}>
            <span aria-hidden="true">{index + 1}</span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ServiceDetails({ service }) {
  const { hash } = useLocation();
  useEffect(() => {
    const target = document.getElementById(hash.slice(1));
    if (target?.closest('.pwc-service-details-page')) target.scrollIntoView?.({ block: 'start' });
  }, [hash]);
  const { policy, safety, exclusions, faq } = getPublicCopy(service);
  const actions = bookingActions(service);
  const price = formatCatalogPrice(service.price);
  const hasWorkflow = Boolean(service.careWorkflow?.steps.length);
  const shopBooking = actions[0]?.kind === 'SHOP' && actions.length === 1;
  const showAreas = !service.details?.locations || service.details.locations.some(location => location !== 'FACILITY');
  const effectiveDate = formatPolicyDate(service.policy.effectiveAt);
  return (
    <div className="pwc-page pwc-service-details-page">
      <ServiceHero service={service} actions={actions} price={price} showAreas={showAreas} />
      <ServiceBenefits hasWorkflow={hasWorkflow} actions={actions} shopBooking={shopBooking} />
      <ServiceScope service={service} exclusions={exclusions} />
      {safety.length > 0 && (
        <section className="pwc-detail-section pwc-detail-safety" aria-labelledby="pwc-detail-safety-title">
          <ShieldAlert size={25} aria-hidden="true" />
          <div>
            <h2 id="pwc-detail-safety-title">Lưu ý an toàn và giới hạn chăm sóc</h2>
            <ul>{safety.map((item, index) => <li key={index}>{item}</li>)}</ul>
            {hasWorkflow && <a href="#care-workflow">Xem hướng dẫn trong quy trình chăm sóc</a>}
          </div>
        </section>
      )}
      {hasWorkflow && <ServiceCareWorkflow workflow={service.careWorkflow} />}
      <ServicePricing price={price} service={service} actions={actions} />
      {actions.length > 0 && <BookingSteps shopBooking={shopBooking} hasWorkflow={hasWorkflow} />}
      {faq.length > 0 && (
        <section className="pwc-detail-section pwc-service-faq" aria-labelledby="pwc-detail-faq-title">
          <h2 id="pwc-detail-faq-title">Câu hỏi thường gặp</h2>
          {faq.map(({ question, answer }, index) => (
            <details key={index}><summary>{question}</summary><p>{answer}</p></details>
          ))}
        </section>
      )}
      <section className="pwc-detail-section pwc-detail-policy" id="policy" tabIndex={-1} aria-labelledby="pwc-detail-policy-title">
        <h2 id="pwc-detail-policy-title">Chính sách dịch vụ</h2>
        <h3>{service.policy.title}</h3>
        <p className="pwc-detail-meta">
          Phiên bản {service.policy.version}{effectiveDate && <> · Hiệu lực từ <time dateTime={service.policy.effectiveAt}>{effectiveDate}</time></>}
        </p>
        {policy.map((line, index) => <p key={index}>{line}</p>)}
        <Link to="/policies">Xem các chính sách của PawWorld</Link>
      </section>
      <section className="pwc-detail-section pwc-detail-next" aria-labelledby="pwc-detail-next-title">
        <div>
          <h2 id="pwc-detail-next-title">{actions.length ? 'Đặt lịch cho bé' : 'Bạn cần tìm lịch phù hợp?'}</h2>
          <p>{actions.length ? 'Chọn thú cưng và thời gian để bắt đầu.' : 'Hỏi PawWorld về lịch phục vụ của dịch vụ này.'}</p>
        </div>
        <div className="pwc-service-detail-actions">
          <BookingActions actions={actions} fallback={<Link className="pwc-button pwc-button-primary" to="/contact">Liên hệ PawWorld</Link>} />
          {actions.length > 0 && <Link className="pwc-button pwc-button-light" to="/contact">Hỏi về dịch vụ</Link>}
        </div>
      </section>
    </div>
  );
}

function ServiceDetailsResource({ serviceId, loadCatalog }) {
  const loadDetails = useCallback(({ signal }) => loadCatalog({ signal, workflowFor: serviceId }), [loadCatalog, serviceId]);
  const catalog = useApiResource(loadDetails);
  const service = catalog.data?.services?.find(item => item.id === serviceId);
  if (catalog.status === 'success' && service) return <ServiceDetails service={service} />;
  return (
    <div className="pwc-page pwc-service-details-page">
      {catalog.status !== 'success' ? (
        <CatalogState resource={catalog} emptyTitle="Dịch vụ chưa sẵn sàng"
          emptyBody="Hãy quay lại danh mục để xem dịch vụ đang được công bố." />
      ) : (
        <div className="pwc-state-card" role="status">
          <h1>{catalog.data?.available ? 'Không tìm thấy dịch vụ' : 'Danh mục đang được cập nhật'}</h1>
          <p>{catalog.data?.available ? 'Dịch vụ này không nằm trong danh mục đang được công bố.' : 'Thông tin dịch vụ hiện chưa sẵn sàng.'}</p>
        </div>
      )}
      <p><Link data-page-back to="/services">Xem danh mục dịch vụ</Link></p>
    </div>
  );
}

export function ServiceDetailsPage({ loadCatalog = loadPublicCatalog }) {
  const { serviceId } = useParams();
  return <ServiceDetailsResource key={serviceId} serviceId={serviceId} loadCatalog={loadCatalog} />;
}
