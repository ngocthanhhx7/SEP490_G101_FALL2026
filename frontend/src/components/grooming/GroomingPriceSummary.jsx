import { Info } from 'lucide-react';
import { GROOMING_TIERS, NO_DEPOSIT } from '../../constants/grooming-messages.js';
import { appointmentLabel } from '../../utils/grooming-booking.js';
import { formatVnd } from '../../utils/product-format.js';

// "Giá cuối": the price of each service by pet size, of each pet, the tier discount and the total, the chosen time and the shop.
export function GroomingPriceSummary({ quote, priceReady, date, slot, address, notice, canConfirm, busy, onConfirm, onRetry }) {
  const data = priceReady ? quote.data : null;
  const tierName = data ? GROOMING_TIERS[data.tier.code] ?? '' : '';
  const held = data && data.tier.discountVnd === 0 && data.tier.code && ['OVERDUE', 'PREPAID_ONLY'].includes(data.tier.blockedReason);
  return <aside className="grooming-card grooming-summary" aria-labelledby="grooming-price">
    <h2 id="grooming-price">Giá cuối</h2>
    {!data && quote.status !== 'error' && <p className="grooming-hint">{quote.status === 'loading' ? 'Đang tính giá…' : 'Chọn dịch vụ và trả lời câu hỏi để xem giá cuối.'}</p>}
    {quote.status === 'error' && <p role="alert" className="grooming-inline">Chưa tính được giá. <button type="button" onClick={onRetry}>Thử lại</button></p>}
    {data && <>
      {data.pets.map(row => <section key={row.petId} className="grooming-pet-price" aria-label={`Giá của ${row.name}`}>
        <h3>{row.name}</h3>
        <dl>{row.lines.map(line => <div key={line.serviceId}><dt>{line.label}{line.sizeLabel ? ` (${line.sizeLabel})` : ''}</dt><dd>{formatVnd(line.amountVnd)}</dd></div>)}
          <div className="grooming-line-total"><dt>Giá của {row.name}</dt><dd>{formatVnd(row.priceVnd)}</dd></div></dl>
      </section>)}
      <dl className="grooming-totals">
        {data.tier.discountVnd > 0 && <div><dt>Ưu đãi hạng {tierName}</dt><dd>− {formatVnd(data.tier.discountVnd)}</dd></div>}
        {held && <div><dt>Ưu đãi hạng {tierName}</dt><dd>chưa áp dụng</dd></div>}
        <div className="grooming-grand"><dt>Tổng</dt><dd>{formatVnd(data.totalVnd)}</dd></div>
      </dl>
    </>}
    {slot && <div className="grooming-when"><strong>{appointmentLabel(date, slot.time)}</strong>{address && <span>{address}</span>}</div>}
    <p className="grooming-note"><Info size={16} aria-hidden="true" />{NO_DEPOSIT}</p>
    {notice && <p role="alert" className="grooming-inline">{notice}</p>}
    <button type="button" className="pwc-button pwc-button-primary" disabled={!canConfirm} onClick={onConfirm}>{busy ? 'Đang đặt lịch…' : 'Xác nhận đặt lịch'}</button>
  </aside>;
}
