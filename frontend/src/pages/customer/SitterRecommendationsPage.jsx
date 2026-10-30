import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Notice, Select } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { createApiClient } from '../../services/api-client.js';
import { createSitterRecommendationApi } from '../../services/sitter-recommendation-api.js';
import { AddressSearch } from '../../components/common/AddressSearch.jsx';
import { VietmapView } from '../../components/common/VietmapView.jsx';
import { RecommendationCheckout } from './RecommendationCheckout.jsx';
import './sitter-recommendations.css';

function message(error) {
  return ({ ROUTING_UNAVAILABLE: 'Chưa lấy được đường đi. Hãy thử lại sau.',
    RANKING_POLICY_UNAVAILABLE: 'Dịch vụ gợi ý đang chờ cấu hình xếp hạng.',
    CARE_INFORMATION_REQUIRED: 'Cần xác nhận thông tin chăm sóc của thú cưng.',
    RESOURCE_NOT_FOUND: 'Thông tin đã thay đổi hoặc không còn thuộc tài khoản này. Hãy tải lại.',
    CSRF_NOT_READY: 'Phiên bảo mật chưa sẵn sàng. Hãy đăng nhập lại.',
    TIMEOUT: 'Chưa nhận được kết quả. Bạn có thể yêu cầu gợi ý lại.',
    VALIDATION_FAILED: 'Kiểm tra lại dữ liệu và chọn lịch trước ít nhất 24 giờ.' })[error?.code]
    ?? 'Chưa thực hiện được yêu cầu. Vui lòng kiểm tra thông tin hoặc thử lại sau.';
}

function CareSetup({ api, breeds, workAreas = [{ code: 'HN', label: 'Hà Nội' }], onSaved }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const addressForm = useRef(null);
  const [addressPoint, setAddressPoint] = useState(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const selectPoint = point => {
    setAddressPoint(point);
    const fields = addressForm.current.elements;
    fields.longitude.value = point[0]; fields.latitude.value = point[1]; fields.confirmed.checked = false;
  };
  async function save(event, kind) {
    event.preventDefault();
    if (pending || uncertain) return;
    const form = event.currentTarget;
    const fields = new globalThis.FormData(form);
    setPending(true); setFeedback('');
    try {
      const result = kind === 'pet' ? await api.createPet({ name: fields.get('name'),
        species: fields.get('species'), breedCode: fields.get('breedCode'), weightKg: Number(fields.get('weightKg')),
        traits: [], careNeedsConfirmed: fields.get('confirmed') === 'on' })
        : await api.createAddress({ label: fields.get('label'), location: fields.get('location'),
          areaCode: fields.get('areaCode'), coordinates: [Number(fields.get('longitude')), Number(fields.get('latitude'))],
          pointConfirmed: fields.get('confirmed') === 'on' });
      if (result.pending) { setUncertain(true); setFeedback('Máy chủ đang xử lý. Tải lại dữ liệu để đối chiếu trước khi tạo lại.'); return; }
      form.reset(); if (kind === 'address') setAddressPoint(null); setFeedback(''); onSaved('Đã lưu thông tin.');
    } catch (error) {
      if (['TIMEOUT', 'NETWORK_ERROR', 'ABORTED'].includes(error?.code)) {
        setUncertain(true);
        setFeedback('Chưa xác định đã lưu hay chưa. Tải lại danh sách để đối chiếu trước khi tạo lại.');
      } else setFeedback(message(error));
    }
    finally { setPending(false); }
  }
  return <section className="sitter-recommendations__setup" aria-label="Bổ sung thông tin chăm sóc">
    <details><summary>Thêm thú cưng để tìm sitter</summary>
      <p>Biểu mẫu này dành cho nhu cầu chăm sóc thông thường. Nếu thú cưng có yêu cầu đặc biệt, cần bổ sung và xác nhận đầy đủ trước khi đặt lịch.</p>
      <form onSubmit={event => save(event, 'pet')}>
        <Input label="Tên thú cưng" name="name" required maxLength={100} />
        <Select label="Loài" name="species" required><option value="DOG">Chó</option><option value="CAT">Mèo</option></Select>
        <Select label="Giống" name="breedCode" required><option value="">Chọn giống đúng với loài</option>{breeds.map(breed => <option key={breed.code} value={breed.code}>{breed.name} ({breed.species === 'DOG' ? 'Chó' : 'Mèo'})</option>)}</Select>
        <Input label="Cân nặng (kg)" name="weightKg" type="number" min="0.1" max="150" step="0.1" required />
        <label><input type="checkbox" name="confirmed" required /> Tôi xác nhận thông tin và nhu cầu chăm sóc thông thường trên là đầy đủ.</label>
        <Button type="submit" disabled={pending || uncertain}>Lưu thú cưng</Button>
      </form>
    </details>
    <details onToggle={event => setAddressOpen(event.currentTarget.open)}><summary>Thêm địa chỉ có tọa độ tại Hà Nội</summary>
      <p>Lấy tọa độ ghim chính xác từ bản đồ. Chỉ nhập địa chỉ bạn có quyền sử dụng; thông tin này không hiển thị trong danh sách gợi ý.</p>
      <form ref={addressForm} onSubmit={event => save(event, 'address')}>
        <AddressSearch search={api.searchAddress} resolve={api.resolveAddress} disabled={pending || uncertain} onSelect={item => {
          const fields = addressForm.current.elements;
          fields.location.value = item.label; selectPoint(item.coordinates);
        }} />
        {addressOpen && <VietmapView coordinates={addressPoint} onSelect={selectPoint} disabled={pending || uncertain} />}
        <Input label="Tên địa chỉ" name="label" required maxLength={100} />
        <Input label="Địa chỉ chăm sóc" name="location" required maxLength={500} />
        <Select label="Khu vực phục vụ" name="areaCode" required>{workAreas.map(area => <option key={area.code} value={area.code}>{area.label}</option>)}</Select>
        <Input label="Kinh độ" name="longitude" type="number" min="-180" max="180" step="any" required onChange={event => {
          selectPoint([Number(event.target.value), Number(addressForm.current.elements.latitude.value)]);
        }} />
        <Input label="Vĩ độ" name="latitude" type="number" min="-90" max="90" step="any" required onChange={event => {
          selectPoint([Number(addressForm.current.elements.longitude.value), Number(event.target.value)]);
        }} />
        <label><input type="checkbox" name="confirmed" required /> Tôi đã kiểm tra đúng vị trí ghim của địa chỉ này.</label>
        <Button type="submit" disabled={pending || uncertain}>Lưu địa chỉ</Button>
      </form>
    </details>
    {feedback && <Notice title="Thông tin chăm sóc">{feedback}</Notice>}
    {uncertain && <Button onClick={onSaved}>Đối chiếu dữ liệu đã lưu</Button>}
  </section>;
}

export function SitterRecommendationsForm({ api }) {
  const load = useCallback(async ({ signal }) => ({ data: await api.setup({ signal }) }), [api]);
  const resource = useApiResource(load);
  const data = resource.data;
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [expired, setExpired] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const active = useRef(null);
  const generation = useRef(0);
  const vet = data?.services.find(service => service.id === serviceId)?.code === 'vet-escort';
  useEffect(() => () => { generation.current += 1; active.current?.abort(); }, []);
  useEffect(() => {
    setExpired(false);
    if (!result) return undefined;
    const remaining = Date.parse(result.expiresAt) - Date.now();
    if (remaining <= 0) { setExpired(true); return undefined; }
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [result]);
  function invalidate() {
    generation.current += 1; active.current?.abort(); setPending(false); setResult(null); setError('');
  }
  async function recommend(event) {
    event.preventDefault();
    if (pending) return;
    const fields = new globalThis.FormData(event.currentTarget);
    const body = { serviceId, petIds: fields.getAll('petId'), addressId: fields.get('addressId'),
      startAt: fields.get('startAt') + ':00+07:00', endAt: fields.get('endAt') + ':00+07:00', limit: 5 };
    if (vet) Object.assign(body, { clinicAddressId: fields.get('clinicAddressId'),
      appointmentAt: fields.get('appointmentAt') + ':00+07:00', waitingMinutes: Number(fields.get('waitingMinutes')),
      returnToHome: fields.get('returnToHome') === 'on' });
    const ticket = ++generation.current;
    active.current?.abort(); active.current = new AbortController();
    setPending(true); setResult(null); setError('');
    try { const next = await api.recommend(body, { signal: active.current.signal }); if (ticket === generation.current) setResult({ ...next, selection: body }); }
    catch (failure) { if (ticket === generation.current) setError(message(failure)); }
    finally { if (ticket === generation.current) setPending(false); }
  }
  return <main className="sitter-recommendations">
    <h1>Tìm pet sitter phù hợp</h1>
    <p>Chọn dịch vụ, thú cưng và lịch chăm sóc tại Hà Nội. Gợi ý xét năng lực, lịch làm việc và thời gian di chuyển.</p>
    {savedMessage && <Notice title="Thông tin chăm sóc">{savedMessage}</Notice>}
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải thông tin" />}
    {['error', 'forbidden'].includes(resource.status) && <Notice state="error" title="Chưa tải được thông tin" action={<Button onClick={resource.retry}>Tải lại</Button>}>Kiểm tra phiên đăng nhập hoặc thử lại sau.</Notice>}
    {data && <>
      <CareSetup api={api} breeds={data.breeds} workAreas={data.workAreas} onSaved={message => {
        if (typeof message === 'string') setSavedMessage(message);
        invalidate(); resource.retry();
      }} />
      <form onSubmit={recommend} onChange={invalidate}>
        <Select label="Dịch vụ" required value={serviceId} onChange={event => setServiceId(event.target.value)}>
          <option value="">Chọn dịch vụ</option>{data.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
        </Select>
        <fieldset><legend>Thú cưng cần chăm sóc</legend>{data.pets.map(pet => <label key={pet.id}><input type="checkbox" name="petId" value={pet.id} disabled={!pet.confirmed} /> {pet.name}{!pet.confirmed && ' — cần xác nhận thông tin'}</label>)}</fieldset>
        <Select label="Địa chỉ chăm sóc" name="addressId" required><option value="">Chọn địa chỉ</option>{data.addresses.filter(address => address.confirmed).map(address => <option key={address.id} value={address.id}>{address.label}</option>)}</Select>
        <Input label="Bắt đầu (giờ Việt Nam)" name="startAt" type="datetime-local" required step="60" />
        <Input label="Kết thúc (giờ Việt Nam)" name="endAt" type="datetime-local" required step="60" hint="Đặt trước ít nhất 24 giờ. Giờ kết thúc phải sau giờ bắt đầu." />
        {vet && <>
          <Select label="Địa chỉ phòng khám đã xác nhận" name="clinicAddressId" required><option value="">Chọn phòng khám</option>{data.addresses.filter(address => address.confirmed).map(address => <option key={address.id} value={address.id}>{address.label}</option>)}</Select>
          <Input label="Giờ hẹn phòng khám (giờ Việt Nam)" name="appointmentAt" type="datetime-local" required />
          <Input label="Thời gian chờ dự kiến (phút)" name="waitingMinutes" type="number" min="15" max="240" step="1" hint="Từ 15 đến 240 phút." required />
          <label><input type="checkbox" name="returnToHome" /> Đưa thú cưng về nhà sau buổi khám</label>
        </>}
        <Button type="submit" loading={pending} disabled={pending || !data.pets.some(pet => pet.confirmed) || !data.addresses.some(address => address.confirmed)}>Tìm sitter</Button>
      </form>
    </>}
    {error && <Notice state="error" title="Chưa có kết quả">{error}</Notice>}
    {result && <section aria-label="Kết quả gợi ý">
      <h2>Sitter phù hợp với lịch bạn chọn</h2>
      {expired && <Notice state="warning" title="Gợi ý đã hết hạn">Hãy tìm lại để kiểm tra lịch mới nhất.</Notice>}
      {result.shortfall > 0 && <Notice state="info" title="Chưa đủ 5 sitter phù hợp">{result.status === 'ROUTING_UNAVAILABLE' ? 'Một số ứng viên chưa xác minh được đường đi. ' : ''}Hiện có {result.candidates.length} sitter trong kết quả đã kiểm tra.</Notice>}
      {result.searchTruncated && <Notice state="warning" title="Phạm vi tìm kiếm có giới hạn">Danh sách chưa bao gồm toàn bộ sitter trong khu vực.</Notice>}
      <p>{result.rankingSource === 'APPROVED_ADDITIVE_MODEL' ? 'Xếp hạng theo mô hình đã được duyệt.' : 'Xếp hạng theo tiêu chí đã được duyệt.'} Thời gian di chuyển là ước tính, chưa gồm giao thông trực tiếp.</p>
      <ol>{result.candidates.map(sitter => <li key={sitter.sitterId}>
        <h3>{sitter.displayName}</h3><p>Điểm phù hợp: {sitter.score}/100 · Di chuyển tăng thêm: {Math.ceil(sitter.plan.extraTravelMinutes)} phút</p>
        {sitter.confidence === 'LIMITED_HISTORY' && <p>Lịch sử chăm sóc còn ít; điểm không phải cam kết chất lượng.</p>}
        <details><summary>Vì sao sitter này phù hợp?</summary><ul>{sitter.breakdown.map((line, index) => <li key={index}>{line.explanation} ({line.points.toFixed(1)} điểm)</li>)}</ul></details>
        {!expired && <RecommendationCheckout selection={result.selection} sitter={sitter} matchId={result.matchId}
          expiresAt={result.expiresAt} service={data.services.find(service => service.id === result.selection.serviceId)} />}
      </li>)}</ol>
      <p>Danh sách gợi ý chưa gửi lời mời hoặc xác nhận đặt lịch. Sitter chỉ nhận việc sau quy trình xác nhận và kiểm tra lịch hiện tại.</p>
    </section>}
  </main>;
}

export function SitterRecommendationsPage() {
  const { getCsrfToken } = useSession();
  const api = useMemo(() => createSitterRecommendationApi({ request: createApiClient({ getCsrfToken }) }), [getCsrfToken]);
  return <SitterRecommendationsForm api={api} />;
}
