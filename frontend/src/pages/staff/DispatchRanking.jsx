const factorLabel = {
  fit: 'Phù hợp dịch vụ',
  travel: 'Di chuyển',
  quality: 'Chất lượng',
  reliability: 'Độ tin cậy',
  workload: 'Khối lượng công việc',
};

const offerLabel = {
  PENDING: 'Chờ phản hồi',
  ACCEPTED: 'Đã nhận',
  DECLINED: 'Đã từ chối',
  EXPIRED: 'Hết hạn',
  REVOKED: 'Đã thu hồi',
};

const points = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });

export function DispatchRanking({ ranking, latestOffers = [], loading, failed, onRetry }) {
  const invited = new Set(ranking?.candidates.filter(candidate => candidate.invited).map(candidate => candidate.sitterId));
  const automatic = new Map(latestOffers.filter(offer => offer.offeredAt === ranking?.at && invited.has(offer.sitterId))
    .map(offer => [offer.sitterId, offer.state]));
  const additional = [...new Map(latestOffers.filter(offer => !automatic.has(offer.sitterId)).map(offer => [offer.sitterId, offer])).values()];
  return <section className="dispatch-ranking" aria-label="Điểm và lời mời điều phối">
    {ranking && <>
      <h3>Xếp hạng tự động gần nhất</h3>
      <p>{ranking.eligibleCount} người phù hợp · {ranking.invitedCount} lời mời đã gửi</p>
      <p className="ops-muted">{dateTime.format(new Date(ranking.at))} · Tối thiểu {ranking.minimumRequested} người mỗi đợt</p>
      {ranking.invitedCount === 0 && <p>Chưa đủ người phù hợp để gửi đợt mời tự động.</p>}
      <ol className="dispatch-ranking-list">
        {ranking.candidates.map(candidate => <li key={candidate.sitterId}>
          <div className="dispatch-ranking-row">
            <span><strong>{candidate.displayName ?? 'Người chăm sóc'}</strong><small>
              {offerLabel[automatic.get(candidate.sitterId)] ?? (candidate.invited ? 'Đã gửi lời mời' : 'Chưa mời trong đợt này')}
            </small></span>
            <strong>{candidate.score === null ? 'Chưa có điểm' : `${points.format(candidate.score)} / 100`}</strong>
          </div>
          {candidate.breakdown?.length > 0 && <details>
            <summary>Chi tiết điểm</summary>
            <dl>{candidate.breakdown.map(factor => <div key={factor.key}>
              <dt>{factorLabel[factor.key]}</dt>
              <dd>{points.format(factor.points)} / {points.format(factor.maximum)}</dd>
            </div>)}</dl>
          </details>}
        </li>)}
      </ol>
    </>}
    {additional.length > 0 && <>
      <h3>{ranking ? 'Lời mời ngoài đợt xếp hạng' : 'Lời mời gần nhất'}</h3>
      {!ranking && <p>Đợt này chưa có điểm được lưu.</p>}
      <ul className="dispatch-ranking-list">
        {additional.map(offer => <li key={offer.sitterId} className="dispatch-ranking-row">
          <strong>{offer.displayName ?? 'Người chăm sóc'}</strong><span>{offerLabel[offer.state] ?? 'Chưa rõ trạng thái'}</span>
        </li>)}
      </ul>
    </>}
    {!ranking && !latestOffers.length && !failed && <p>{loading ? 'Đang tải điểm điều phối…' : 'Chưa có kết quả xếp hạng được lưu cho ca này.'}</p>}
    {failed && <p role="alert">Chưa tải được điểm và lời mời. <button type="button" onClick={onRetry}>Thử lại</button></p>}
  </section>;
}
