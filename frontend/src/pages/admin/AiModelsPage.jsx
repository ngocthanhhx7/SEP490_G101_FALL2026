import { useCallback, useMemo, useRef, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { createApiClient } from '../../services/api-client.js';
import { createAiModelApi } from '../../services/ai-model-api.js';
import { Button, Input, Select } from '../../components/ui/index.js';
import '../../styles/ai-models.css';
import { AiTrainingReadiness } from '../../components/common/AiTrainingReadiness.jsx';

const labels = { fit: 'Phù hợp', travel: 'Di chuyển', quality: 'Chất lượng', reliability: 'Tin cậy', workload: 'Khối lượng việc' };
const message = code => ({ MODEL_EVIDENCE_INVALID: 'Artifact và evidence không khớp hoặc dữ liệu chia tập chưa hợp lệ.',
  MODEL_EVIDENCE_REQUIRED: 'Cần nhập artifact gốc và evidence trước khi duyệt.', MODEL_NOT_IMPROVED: 'Sai số kiểm định chưa tốt hơn bộ quy tắc hiện tại.',
  VERSION_CONFLICT: 'Phiên bản đã thay đổi. Tải lại lịch sử trước khi tiếp tục.', MODEL_REVIEW_REQUIRED: 'Cần review nguồn dữ liệu trước khi kích hoạt.' })[code] ?? 'Chưa thực hiện được. Kiểm tra dữ liệu và tải lại trạng thái.';
export function AiModelsPage({ api: suppliedApi }) {
  const { getCsrfToken } = useSession();
  const api = useMemo(() => suppliedApi ?? createAiModelApi(createApiClient({ getCsrfToken })), [suppliedApi, getCsrfToken]);
  const load = useCallback(({ signal }) => api.status({ signal }), [api]), resource = useApiResource(load);
  const [artifactJson, setArtifact] = useState(''), [evidence, setEvidence] = useState(null), [selected, setSelected] = useState('');
  const [action, setAction] = useState('APPROVE'), [reason, setReason] = useState(''), [reviewReference, setReference] = useState('');
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [notice, setNotice] = useState('');
  const operation = useRef(null), locked = useRef(false), fileVersions = useRef({ artifact: 0, evidence: 0 });
  const data = resource.data, model = data?.models.find(row => row.id === selected), disabled = busy || pending;
  async function readFile(event, kind) {
    const file = event.target.files[0];
    const version = ++fileVersions.current[kind];
    if (kind === 'artifact') setArtifact(''); else setEvidence(null);
    if (!file) return;
    try {
      if (file.size > 32000) throw new Error('Too large');
      const raw = await file.text(); JSON.parse(raw);
      if (fileVersions.current[kind] !== version) return;
      if (kind === 'artifact') setArtifact(raw); else setEvidence(JSON.parse(raw));
      setNotice('');
    } catch { if (fileVersions.current[kind] !== version) return; if (kind === 'artifact') setArtifact(''); else setEvidence(null); setNotice('Chọn file JSON hợp lệ, tối đa 32 KB mỗi file.'); }
  }
  async function execute(work) {
    if (locked.current || work && pending) return;
    if (work) operation.current = { work, key: 'model:' + globalThis.crypto.randomUUID() };
    if (!operation.current) return;
    locked.current = true; setBusy(true); setNotice('');
    try {
      const result = await operation.current.work(operation.current.key);
      if (result.pending || result.status === 202) { setPending(true); setNotice('Đang chờ máy chủ xác nhận.'); return; }
      operation.current = null; setPending(false); setNotice('Đã ghi nhận. Trạng thái bên dưới được đọc lại từ máy chủ.'); resource.retry();
    } catch (error) {
      const uncertain = !error.status || error.status >= 500 || ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'INVALID_RESPONSE'].includes(error.code);
      setPending(uncertain); if (!uncertain) operation.current = null;
      setNotice(uncertain ? 'Chưa nhận được xác nhận. Hãy kiểm tra lại cùng yêu cầu.' : message(error.code));
    } finally { locked.current = false; setBusy(false); }
  }
  return <section className="ai-models">
    <header><div><h1>Điều phối AI</h1><p>Theo dõi model, nguồn dữ liệu và phiên bản đang được sử dụng.</p></div>
      <Button variant="secondary" disabled={disabled} onClick={resource.retry}>Tải lại trạng thái</Button></header>
    {resource.status === 'loading' && <p role="status">Đang đọc trạng thái AI…</p>}
    {['error', 'forbidden'].includes(resource.status) && <p role="alert">Chưa đọc được trạng thái AI. Cần phiên Admin và chức năng AI đã bật.</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && <Button disabled={busy} onClick={() => execute()}>Kiểm tra lại yêu cầu</Button>}
    {data && <>
      <section className="ai-models__status"><h2>Nguồn gợi ý hiện tại</h2>
        <p><strong>{data.activeModel ? `Model ${data.activeModel.version}` : 'Bộ quy tắc giải thích được'}</strong></p>
        {data.fallbackReason === 'MODEL_VALIDATION_FAILED' ? <p>Model được chọn không qua kiểm tra tính toàn vẹn. Hệ thống đang dùng bộ quy tắc dự phòng.</p> :
          !data.activeModel && <p>Chưa có model đã được phê duyệt đang hoạt động. File đã train cần được nhập và review; không tự nạp khi chuyển máy.</p>}
        <dl>{Object.entries(data.activeModel?.weights ?? data.policyWeights ?? {}).map(([key, value]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{Number(value).toFixed(2)}%</dd></div>)}</dl>
        <p>Model chỉ gợi ý người chăm sóc. Điều kiện nhận ca, lời mời và xác nhận nhận việc vẫn được kiểm tra riêng.</p>
      </section>
      <section><h2>Dữ liệu cho lần huấn luyện tiếp theo</h2>
        <p>{data.data.outcomes} kết quả lưu trong môi trường hiện tại · {data.data.verifiedCandidates} đánh giá có nguồn hoàn tất để kiểm tra · {data.data.capturedVisits} ca có đặc trưng tại lúc gợi ý.</p>
        <p>Cần ít nhất {data.data.minimumObservations} quan sát đã xác minh từ {data.data.minimumBookingGroups} booking độc lập. Bộ xuất dữ liệu còn kiểm tra lại nguồn, thời điểm và dữ liệu demo; các số đếm trên chưa chứng minh đủ điều kiện train.</p>
      </section>
      {api.trainingReadiness && <AiTrainingReadiness api={api} disabled={disabled} />}
      <section><h2>Lịch sử model</h2>
        {!data.models.length ? <p>Chưa nhập model nào trong môi trường hiện tại.</p> : <div className="ai-models__table"><table><thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Dòng train</th><th>MAE / baseline</th><th>Evidence</th></tr></thead><tbody>
          {data.models.map(row => <tr key={row.id}><td>{row.version}</td><td>{row.state}</td><td>{row.trainingRows}</td><td>{row.testMae.toFixed(2)} / {row.baselineMae.toFixed(2)}</td><td>{row.evidenceAttached ? 'Đã lưu' : 'Chưa có'}</td></tr>)}
        </tbody></table></div>}
        {data.historyTruncated && <p>Đang hiển thị 20 model mới nhất; các phiên bản cũ vẫn được giữ trong kho.</p>}
      </section>
      <form onSubmit={event => { event.preventDefault(); const body = { artifactJson, evidence }; execute(key => api.importModel(body, key)); }}>
        <h2>Nhập bản đã huấn luyện</h2><p>Nhập file model DRAFT và file evidence do trainer tạo. Thao tác này lưu bản nháp, chưa kích hoạt.</p>
        <Input label="Artifact model JSON" type="file" accept=".json,application/json" required disabled={disabled} onChange={event => readFile(event, 'artifact')} />
        <Input label="Evidence JSON" type="file" accept=".json,application/json" required disabled={disabled} onChange={event => readFile(event, 'evidence')} />
        <Button type="submit" disabled={disabled || !artifactJson || !evidence}>Lưu model nháp</Button>
      </form>
      {data.models.length > 0 && <form onSubmit={event => { event.preventDefault(); const body = { expectedVersion: model.reviewVersion, action, reason, reviewReference }; execute(key => api.reviewModel(model.id, body, key)); }}>
        <h2>Review và chọn phiên bản</h2><p>Kiểm tra nguồn đánh giá, cách chia tập theo thời gian và sai số holdout trước khi duyệt. Có thể duyệt lại phiên bản cũ để rollback sau review.</p>
        <Select label="Model cần review" value={selected} disabled={disabled} required onChange={event => setSelected(event.target.value)}><option value="">Chọn model</option>{data.models.map(row => <option key={row.id} value={row.id}>{row.version} · {row.state}</option>)}</Select>
        <Select label="Quyết định model" value={action} disabled={disabled} onChange={event => setAction(event.target.value)}><option value="APPROVE">Phê duyệt sử dụng</option><option value="RETIRE">Ngừng sử dụng</option></Select>
        <Input label="Tham chiếu review nguồn dữ liệu" required maxLength={500} value={reviewReference} disabled={disabled} onChange={event => setReference(event.target.value)} />
        <Input label="Lý do quyết định" required maxLength={1000} value={reason} disabled={disabled} onChange={event => setReason(event.target.value)} />
        <Button type="submit" disabled={disabled || !model || !reason.trim() || !reviewReference.trim()}>Ghi nhận quyết định</Button>
      </form>}
    </>}
  </section>;
}
