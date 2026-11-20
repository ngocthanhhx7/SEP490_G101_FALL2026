import { useCallback, useMemo } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { createApiClient } from '../../services/api-client.js';
import { createSitterRankingPolicyApi } from '../../services/sitter-ranking-policy-api.js';
import { Button } from '../../components/ui/index.js';
import '../../styles/ai-models.css';

const labels = { fit: 'Phù hợp', travel: 'Di chuyển', quality: 'Chất lượng', reliability: 'Tin cậy', workload: 'Khối lượng việc' };
const format = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function SitterRankingPolicyPage({ api: suppliedApi }) {
  const { getCsrfToken } = useSession();
  const api = useMemo(() => suppliedApi ?? createSitterRankingPolicyApi(createApiClient({ getCsrfToken })), [suppliedApi, getCsrfToken]);
  const load = useCallback(({ signal }) => api.status({ signal }), [api]);
  const resource = useApiResource(load);
  return <section className="ai-models">
    <header>
      <h1>Trọng số gợi ý sitter</h1>
      <Button variant="secondary" disabled={resource.status === 'loading'} onClick={resource.retry}>Tải lại trạng thái</Button>
    </header>
    {resource.status === 'loading' && <p role="status">Đang đọc bộ trọng số…</p>}
    {['error', 'forbidden'].includes(resource.status) && <p role="alert">Chưa đọc được bộ trọng số hiện hành.</p>}
    {resource.data && <section className="ai-models__status">
      <h2>Chính sách xếp hạng phiên bản {resource.data.policyVersion}</h2>
      <dl>{Object.entries(labels).map(([key, label]) =>
        <div key={key}><dt>{label}</dt><dd>{format.format(resource.data.policyWeights[key])}%</dd></div>)}</dl>
      <p>Hệ thống kiểm tra điều kiện nhận ca trước khi tính điểm và sắp xếp sitter theo bộ trọng số này.</p>
    </section>}
  </section>;
}
