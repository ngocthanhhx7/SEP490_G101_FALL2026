import { useEffect, useState } from 'react';
import { Button, Dialog, Notice } from '../../components/ui/index.js';
import './service-areas.css';

export function ServiceAreasPage({ api }) {
  const [provinces, setProvinces] = useState([]), [parent, setParent] = useState('PROVINCE_01');
  const [data, setData] = useState(null), [selected, setSelected] = useState([]), [search, setSearch] = useState('');
  const [cursor, setCursor] = useState(''), [reload, setReload] = useState(0), [loading, setLoading] = useState(true);
  const [provinceError, setProvinceError] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    const abort = new AbortController(); setProvinceError(''); api.list({ level: 'PROVINCE' }, abort.signal).then(value => { if (!abort.signal.aborted) setProvinces(value.items); }).catch(() => { if (!abort.signal.aborted) setProvinceError('Chưa tải được danh mục tỉnh, thành phố. Bấm Tải lại để thử lại.'); });
    return () => abort.abort();
  }, [api, reload]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(''); setSelected([]); setData(null);
    api.list({ ...(parent === 'LEGACY_CITIES' ? { level: 'CITY' } : { parentCode: parent }), ...(cursor ? { after: cursor } : {}) }, abort.signal).then(value => { if (!abort.signal.aborted) setData(value); })
      .catch(() => { if (!abort.signal.aborted) setError('Chưa tải được khu vực. Hãy thử tải lại.'); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [api, parent, cursor, reload]);
  function start(enabled) {
    if (!selected.length || !data || !globalThis.crypto?.randomUUID) return;
    setConfirm({ codes: [...selected].sort(), enabled, expectedVersion: data.expectedVersion, key: globalThis.crypto.randomUUID() }); setReason(''); setError('');
  }
  async function save() {
    if (busy || !confirm || reason.trim().length < 5) return;
    setBusy(true); setError('');
    try {
      await api.change({ codes: confirm.codes, enabled: confirm.enabled, expectedVersion: confirm.expectedVersion, reason: reason.trim() }, confirm.key);
      setConfirm(null); setUncertain(false); setNotice('Đã cập nhật phạm vi phục vụ. Các buổi đã xác nhận vẫn được giữ.'); setReload(value => value + 1);
    } catch (failure) {
      if (failure.code === 'VERSION_CONFLICT') { setError('Phạm vi đã thay đổi ở nơi khác. Đóng hộp này và tải lại trước khi sửa tiếp.'); }
      else if (!failure.status || failure.status >= 500 || failure.code === 'INVALID_RESPONSE') { setUncertain(true); setError('Chưa xác định kết quả. Thử lại cùng yêu cầu để đối chiếu; không sửa lựa chọn.'); }
      else setError('Chưa cập nhật được khu vực. Kiểm tra quyền và thử lại.');
    } finally { setBusy(false); }
  }
  const visible = (data?.items ?? []).filter(row => row.label.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  return <section className="service-area-admin"><header><h1>Phạm vi phục vụ</h1><p>Chọn xã, phường khả thi cho dịch vụ chăm sóc tại nhà. Sitter đăng ký trong các khu vực đã mở.</p></header>
    <p className="service-area-source">Danh mục địa giới từ Cục Thống kê · phiên bản nguồn 01/07/2025. Các khu vực vận hành cũ được giữ riêng để tương thích lịch đã đặt.</p>
    {provinceError && <Notice state="error" title={provinceError} />}
    {notice && <Notice state="success" title={notice} />}
    <div className="service-area-filters"><label>Tỉnh, thành phố<select disabled={busy || uncertain} value={parent} onChange={event => { setParent(event.target.value); setCursor(''); setSearch(''); }}>
      {provinces.map(row => <option key={row.code} value={row.code}>{row.label}</option>)}<option value="CITY_HANOI">Khu vực vận hành cũ tại Hà Nội</option><option value="LEGACY_CITIES">Phạm vi toàn thành phố (mã cũ)</option></select></label>
      <label>Tìm trong trang hiện tại<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên xã, phường" /></label>
      <Button variant="secondary" disabled={busy || uncertain} onClick={() => setReload(value => value + 1)}>Tải lại</Button></div>
    {loading && <p role="status">Đang tải khu vực…</p>}
    {error && !confirm && <Notice state="error" title={error} />}
    {data && <><div className="service-area-actions"><span>Đã chọn {selected.length} khu vực trên trang này</span><Button disabled={!selected.length || busy} onClick={() => start(true)}>Mở phục vụ</Button><Button variant="secondary" disabled={!selected.length || busy} onClick={() => start(false)}>Tạm dừng</Button></div>
      <div className="service-area-list">{visible.map(row => <label key={row.code}><input type="checkbox" checked={selected.includes(row.code)} onChange={event => setSelected(value => event.target.checked ? [...value, row.code] : value.filter(code => code !== row.code))} /><span>{row.label}<small>{row.level === 'DISTRICT' ? 'Khu vực vận hành cũ' : 'Xã / phường / đặc khu'}</small></span><strong className={row.enabled ? 'is-open' : ''}>{row.enabled ? 'Đang phục vụ' : 'Chưa mở / tạm dừng'}</strong></label>)}</div>
      {!visible.length && <p>Không có khu vực phù hợp trên trang này.</p>}
      <nav className="service-area-pages" aria-label="Trang khu vực"><Button variant="secondary" disabled={!cursor} onClick={() => setCursor('')}>Về đầu danh sách</Button><Button variant="secondary" disabled={!data.nextCursor} onClick={() => setCursor(data.nextCursor)}>Trang tiếp</Button></nav></>}
    <Dialog open={Boolean(confirm)} title={confirm?.enabled ? 'Mở khu vực phục vụ?' : 'Tạm dừng khu vực phục vụ?'} dismissible={!busy && !uncertain} onClose={() => { setConfirm(null); setError(''); }}>
      {confirm && <><p>Cập nhật {confirm.codes.length} khu vực. Không tự hủy buổi đã xác nhận. Các yêu cầu nhận việc mới sẽ được kiểm tra lại phạm vi.</p><label className="service-area-reason">Lý do thay đổi<textarea minLength={5} maxLength={500} value={reason} disabled={busy || uncertain} onChange={event => setReason(event.target.value)} /></label>
        {error && <Notice state="error" title={error} />}<Button disabled={busy || reason.trim().length < 5} onClick={save}>{busy ? 'Đang cập nhật…' : uncertain ? 'Thử lại cùng yêu cầu' : 'Xác nhận cập nhật'}</Button></>}
    </Dialog>
  </section>;
}
