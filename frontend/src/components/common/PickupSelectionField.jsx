import { useEffect, useRef, useState } from 'react';
import { formatVnd } from '../../utils/product-format.js';

export const PICKUP_UNAVAILABLE = 'Hiện chưa tính được khoảng cách nên chưa đón được. Vui lòng mang thú cưng đến cửa hàng hoặc thử lại sau.';
export const pickupReady = value => !value || value.status === 'ready';
export const pickupInput = value => value?.status === 'ready' ? {
  addressId: value.addressId, policyVersion: value.quote.policyVersion, expectedFeeVnd: value.quote.feeVnd
} : undefined;
export const pickupPrice = value => value?.status === 'ready' ? value.quote.feeVnd : 0;

export function PickupSelectionField({ addresses = [], api, value, onChange, disabled }) {
  const request = useRef(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => request.current?.abort(), []);
  const changeAddress = async addressId => {
    request.current?.abort();
    if (!addressId) { onChange({ addressId: '', status: 'idle' }); setLoading(false); return; }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); onChange({ addressId, status: 'loading' });
    try {
      const quote = await api.pickupQuote({ addressId }, { signal: controller.signal });
      if (!controller.signal.aborted) onChange({ addressId, status: quote?.allowed ? 'ready' : 'exceeded', quote });
    } catch {
      if (!controller.signal.aborted) onChange({ addressId, status: 'error' });
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  return <fieldset disabled={disabled}>
    <label><input type="checkbox" checked={Boolean(value)} onChange={event => {
      request.current?.abort(); setLoading(false); onChange(event.target.checked ? { addressId: '', status: 'idle' } : null);
    }} /> Đón và trả tận nhà</label>
    <p>Cửa hàng đến nhà đón và đưa thú cưng về</p>
    {value && <>
      <label>Địa chỉ đón<select required value={value.addressId} onChange={event => void changeAddress(event.target.value)}>
        <option value="">Chọn địa chỉ đón</option>
        {addresses.filter(address => address.pointConfirmedAt).map(address => <option key={address.id ?? address._id} value={address.id ?? address._id}>{address.label}</option>)}
      </select></label>
      {loading && <p role="status">Đang tính khoảng cách…</p>}
      {value.status === 'ready' && <dl>
        <div><dt>Khoảng cách</dt><dd>{value.quote.distanceKm.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km</dd></div>
        <div><dt>Phí đón (cả hai chiều)</dt><dd>{formatVnd(value.quote.feeVnd)}</dd></div>
      </dl>}
      {value.status === 'exceeded' && <p role="alert">Địa chỉ này cách cửa hàng {value.quote.distanceKm.toFixed(1)} km, quá {value.quote.maxKm} km. Không đón được; vui lòng mang thú cưng đến cửa hàng.</p>}
      {value.status === 'error' && <p role="alert">{PICKUP_UNAVAILABLE} <button type="button" onClick={() => void changeAddress(value.addressId)}>Thử lại</button></p>}
    </>}
  </fieldset>;
}
