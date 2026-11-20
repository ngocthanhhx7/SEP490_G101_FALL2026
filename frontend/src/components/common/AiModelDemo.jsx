import { useState } from 'react';
import { Button } from '../ui/index.js';

const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const featureLabels = { fit: 'Phù hợp', travel: 'Di chuyển', quality: 'Chất lượng', reliability: 'Tin cậy', workload: 'Khối lượng việc' };

export function AiModelDemo({ api, disabled }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle');
  async function run() {
    setStatus('loading');
    setResult(null);
    try {
      const { data } = await api.runDemo();
      setResult(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }
  return <section aria-labelledby="ai-demo-title">
    <h2 id="ai-demo-title">Thử model gợi ý sitter</h2>
    <p>Chạy hai hồ sơ mô phỏng trên máy chủ để so sánh điểm và thứ hạng. Kết quả chỉ phục vụ thử nghiệm.</p>
    <Button variant="secondary" disabled={disabled || status === 'loading'} onClick={run}>Chạy model thử nghiệm</Button>
    {status === 'loading' && <p role="status">Đang tính điểm…</p>}
    {status === 'error' && <p role="alert">Chưa chạy được model thử nghiệm. Hãy kiểm tra chính sách xếp hạng và thử lại.</p>}
    {result && <>
      <p role="status">Đã chạy {result.model.version}. Huấn luyện trên {result.model.trainingRows} mẫu mô phỏng, kiểm thử trên {result.model.testRows} mẫu.</p>
      <div className="ai-models__table">
        <table><caption>Điểm và thứ hạng theo từng bộ trọng số</caption>
          <thead><tr><th scope="col">Sitter mẫu</th><th scope="col">Điểm model</th><th scope="col">Hạng model</th>
            <th scope="col">Điểm theo chính sách v{result.baseline.policyVersion}</th><th scope="col">Hạng theo chính sách</th></tr></thead>
          <tbody>{result.candidates.map(row => {
            const baseline = result.baseline.candidates.find(item => item.id === row.id);
            return <tr key={row.id}><th scope="row">{row.id}</th><td>{decimal.format(row.score)}</td><td>{row.rank}</td>
              <td>{decimal.format(baseline.score)}</td><td>{baseline.rank}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <p>MAE trên {result.model.testRows} mẫu kiểm thử. Model {decimal.format(result.model.testMae)}, bộ quy tắc đối chứng {decimal.format(result.model.trainingBaselineMae)}, dự đoán cố định 4 sao {decimal.format(result.model.constantMae)}.</p>
      <dl>{Object.entries(result.model.weights).map(([key, value]) =>
        <div key={key}><dt>{featureLabels[key]}</dt><dd>{decimal.format(value)}%</dd></div>)}</dl>
    </>}
  </section>;
}
