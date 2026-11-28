import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AddressSearch } from '../../components/common/AddressSearch.jsx';
import { VietmapView } from '../../components/common/VietmapView.jsx';

const emptyAddress = () => ({
  label: '', location: '', areaCode: '', coordinates: ['', ''],
  pointConfirmed: false, privateAccessNotes: ''
});

export function CounterAddressDialog({ api, customerId, onSaved, onClose }) {
  const [draft, setDraft] = useState(emptyAddress);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const operationKey = useRef(null);
  useEffect(() => {
    let active = true;
    api.petCatalog().then(result => { if (active) setAreas(result?.workAreas ?? []); })
      .catch(() => { if (active) setError('Chưa tải được khu vực phục vụ. Vui lòng thử lại.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);
  function change(values) {
    setDraft(old => ({ ...old, ...values, pointConfirmed: values.pointConfirmed ?? (values.coordinates || values.location !== undefined || values.areaCode !== undefined ? false : old.pointConfirmed) }));
    operationKey.current = null;
    setError('');
  }
  const point = draft.coordinates.every(value => value !== '' && Number.isFinite(Number(value)))
    ? draft.coordinates.map(Number) : null;
  async function save(event) {
    event.preventDefault();
    if (saving || !point || !draft.pointConfirmed || !draft.areaCode) return;
    operationKey.current ??= globalThis.crypto.randomUUID();
    setSaving(true); setError('');
    try {
      const created = await api.createAddress(customerId, {
        ...draft, coordinates: point
      }, operationKey.current);
      onSaved(created);
    } catch {
      setError('Chưa xác nhận được kết quả lưu địa chỉ. Vui lòng thử lại với thông tin hiện tại.');
    } finally { setSaving(false); }
  }
  return <div className="counter-booking-dialog-backdrop" onMouseDown={saving ? undefined : onClose}>
    <section className="counter-booking-dialog cb-address-dialog" role="dialog" aria-modal="true" aria-labelledby="cb-address-title"
      onMouseDown={event => event.stopPropagation()}>
      <div className="cb-dialog-title"><h2 id="cb-address-title">Nhập địa chỉ mới</h2>
        <button type="button" className="cb-icon-button" aria-label="Đóng" disabled={saving} onClick={onClose}><X size={19} /></button></div>
      <p>Địa chỉ này chỉ dùng cho lịch đặt tại quầy và không thêm vào hồ sơ địa chỉ của khách.</p>
      <form onSubmit={save}>
        <AddressSearch search={api.searchAddress} resolve={api.resolveAddress} disabled={saving}
          onSelect={item => change({ location: item.label, coordinates: item.coordinates })} />
        <VietmapView coordinates={point} disabled={saving} onSelect={coordinates => change({ coordinates })} />
        <label>Tên gợi nhớ<input required maxLength={100} disabled={saving} value={draft.label}
          onChange={event => change({ label: event.target.value })} /></label>
        <label>Khu vực phục vụ<select required disabled={saving || loading} value={draft.areaCode}
          onChange={event => change({ areaCode: event.target.value })}>
          <option value="">Chọn khu vực</option>{areas.map(row => <option key={row.code} value={row.code}>{row.label}</option>)}
        </select></label>
        <label>Địa chỉ đầy đủ<input required maxLength={500} disabled={saving} value={draft.location}
          onChange={event => change({ location: event.target.value })} /></label>
        <label>Kinh độ<input type="number" min="-180" max="180" step="any" required disabled={saving}
          value={draft.coordinates[0]} onChange={event => change({ coordinates: [event.target.value, draft.coordinates[1]] })} /></label>
        <label>Vĩ độ<input type="number" min="-90" max="90" step="any" required disabled={saving}
          value={draft.coordinates[1]} onChange={event => change({ coordinates: [draft.coordinates[0], event.target.value] })} /></label>
        <label>Ghi chú ra vào riêng<input maxLength={1000} disabled={saving} value={draft.privateAccessNotes}
          onChange={event => change({ privateAccessNotes: event.target.value })} /></label>
        <label className="cb-address-confirm"><input type="checkbox" required disabled={saving || !point}
          checked={draft.pointConfirmed} onChange={event => change({ pointConfirmed: event.target.checked })} />
          Tôi xác nhận địa chỉ, khu vực và vị trí ghim chính xác.</label>
        {error && <p role="alert" className="cb-feedback cb-feedback-error">{error}</p>}
        <div className="cb-dialog-actions"><button type="button" disabled={saving} onClick={onClose}>Hủy</button>
          <button type="submit" className="cb-button-primary" disabled={saving || loading || !areas.length || !point || !draft.pointConfirmed}>
            {saving ? 'Đang lưu…' : 'Lưu địa chỉ cho lịch đặt'}</button></div>
      </form>
    </section>
  </div>;
}
