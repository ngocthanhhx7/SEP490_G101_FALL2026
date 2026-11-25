import { Link } from 'react-router-dom';
import { dispatchReason } from '../../utils/dispatch-format.js';

// The sitter choice shared by "Giao người" and "Đổi người chăm sóc": one radio per sitter who passes the checks,
// and the sitters who do not pass listed with the reason. The markup is the one the dispatch picker always had.
export function DispatchCandidateOptions({ items, selected, disabled, onSelect, name = 'dispatch-sitter', meta }) {
  return <fieldset className="dispatch-candidate-list"><legend>Chọn một người chăm sóc</legend>{items.map(item =>
    <label key={item.sitterId} className="dispatch-candidate">
      <input type="radio" name={name} value={item.sitterId} checked={selected === item.sitterId} disabled={disabled} onChange={() => onSelect(item.sitterId)} />
      <span><strong>{item.displayName ?? 'Người chăm sóc'}</strong>{selected === item.sitterId && <span className="dispatch-selected-label">Đang chọn</span>}
        <small>{meta(item)}</small></span>
    </label>)}</fieldset>;
}

export function DispatchBlockedSection({ blocked, selected, prefix, radios = false }) {
  return <details className="dispatch-blocked-section"><summary>Chưa đủ điều kiện ({blocked.length})</summary>
    <div className="dispatch-blocked-list">{blocked.map(item => <div key={item.sitterId}>
      {radios && <input type="radio" name="dispatch-sitter-blocked" disabled aria-label={item.displayName ?? 'Người chăm sóc'} />}
      <strong>{item.displayName ?? 'Người chăm sóc'}</strong>{selected === item.sitterId && <span className="dispatch-selected-label">Đang chọn</span>}
      <p>{dispatchReason(item.reason)}</p>
      <Link to={`${prefix}/sitters/${item.sitterId}?tab=${['OUTSIDE_WORKING_HOURS', 'WORK_AREA_MISMATCH', 'DAY_OFF'].includes(item.reason) ? 'schedule' : 'capability'}`}>Mở hồ sơ để xử lý</Link>
    </div>)}</div></details>;
}
