const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const tiers = { MEMBER: 'Member', SILVER: 'Silver', GOLD: 'Gold' };

// Price lines of a booking quote. Every amount comes from the quote; a range is
// shown when the visits of one service cannot share its subtotal equally.
export function QuotePriceSummary({ quote, services, className }) {
  return <dl className={className}>
    {quote.items.map((item, index) => <div key={index}>
      <dt>{services.find(service => service.id === item.serviceId)?.name ?? `Dịch vụ ${index + 1}`} · {item.visitCount} buổi · Giá một buổi</dt>
      <dd>{item.subtotalVnd % item.visitCount === 0 ? money(item.subtotalVnd / item.visitCount)
        : `${money(Math.floor(item.subtotalVnd / item.visitCount))} – ${money(Math.ceil(item.subtotalVnd / item.visitCount))}`}</dd>
    </div>)}
    <div><dt>Tạm tính</dt><dd>{money(quote.baseVnd + quote.surchargeVnd)}</dd></div>
    <div><dt>Giảm nhiều buổi</dt><dd>− {money(quote.discountVnd)}</dd></div>
    <div><dt>Giảm giá hạng {tiers[quote.tier?.code] ?? ''}</dt><dd>− {money(quote.tierDiscountVnd ?? 0)}</dd></div>
    <div><dt>Tổng thanh toán</dt><dd><strong>{money(quote.totalVnd)}</strong></dd></div>
  </dl>;
}
