import { useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { Button, Input } from '../ui/index.js';
const providerNames = { GOOGLE: 'Google Maps', GOONG: 'Goong', VIETMAP: 'Vietmap' };

export function AddressSearch({ search, resolve, onSelect, disabled }) {
  const [query, setQuery] = useState(''), [items, setItems] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0);
  const [provider, setProvider] = useState('');
  if (!search) return null;
  const submit = async () => {
    if (busy || query.trim().length < 3) return;
    const ticket = ++generation.current; setBusy(true); setError(''); setItems([]);
    try {
      const result = await search(query);
      if (ticket !== generation.current) return;
      if (!Array.isArray(result.data?.items)) throw new Error('Invalid locations');
      setProvider(result.data.provider || ''); setItems(result.data.items); if (!result.data.items.length) setError('Không tìm thấy địa chỉ phù hợp.');
    } catch { if (ticket === generation.current) setError('Chưa tìm được địa chỉ. Bạn có thể nhập vị trí đã kiểm tra bên dưới.'); }
    finally { if (ticket === generation.current) setBusy(false); }
  };
  const select = async item => {
    const ticket = ++generation.current; setBusy(true); setError('');
    try {
      const selected = item.coordinates ? item : (await resolve({ provider: item.provider, refId: item.refId })).data;
      if (ticket !== generation.current) return;
      onSelect(selected); setItems([]);
    } catch { if (ticket === generation.current) setError('Chưa xác định được vị trí địa chỉ đã chọn.'); }
    finally { if (ticket === generation.current) setBusy(false); }
  };
  return <div className="pwc-address-search">
    <Input label="Tìm địa chỉ" value={query} maxLength={200} disabled={disabled || busy}
      onChange={event => { generation.current++; setQuery(event.target.value); setItems([]); setError(''); setBusy(false); }} />
    <Button type="button" variant="secondary" disabled={disabled || busy || query.trim().length < 3} onClick={submit}><Search size={16} />Tìm địa chỉ</Button>
    {busy && <p role="status">Đang tìm địa chỉ…</p>}{error && <p role="status">{error}</p>}
    {items.length > 0 && <><ul>{items.map((item, index) => <li key={index}><Button type="button" variant="ghost" disabled={disabled || busy}
      onClick={() => select(item)}><MapPin size={16} />{item.label}</Button></li>)}</ul><p>{providerNames[provider] || provider}</p></>}
  </div>;
}
