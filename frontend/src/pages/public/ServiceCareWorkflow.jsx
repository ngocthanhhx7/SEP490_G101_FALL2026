const PHASES = [
  ['CHECK_IN', 'Tiếp nhận'],
  ['EXECUTION', 'Chăm sóc'],
  ['CHECK_OUT', 'Bàn giao']
];
const LABELS = {
  DOG: 'Chó', CAT: 'Mèo', HOME: 'Tại nhà', FACILITY: 'Tại cơ sở',
  OUTDOOR: 'Ngoài trời', SHOP: 'Tại cửa hàng', TRANSPORT: 'Khi vận chuyển'
};

function isHttpsSource(value) {
  if (!/^https:\/\/[^\s]+$/.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname && !url.username && !url.password);
  } catch {
    return false;
  }
}

function Step({ step }) {
  const separator = ' Nguồn: ';
  const [instructions, refs] = step.instructions.split(separator, 2);
  const candidates = refs?.split(' ; ') ?? [];
  const sources = candidates.length && candidates.every(isHttpsSource)
    ? [...new Set(candidates)] : [];
  const applicability = [...step.species, ...step.locations].map(code => LABELS[code]).filter(Boolean);
  return (
    <li>
      <details>
        <summary>{step.title}</summary>
        {applicability.length > 0 && <p>{applicability.join(' · ')}</p>}
        <p>{sources.length ? instructions : step.instructions}</p>
        {sources.length > 0 && <ul aria-label="Nguồn tham chiếu">
          {sources.map(source => (
            <li key={source}><a href={source} target="_blank" rel="noopener noreferrer">{new URL(source).hostname}</a></li>
          ))}
        </ul>}
      </details>
    </li>
  );
}

export function ServiceCareWorkflow({ workflow }) {
  return (
    <section className="pwc-detail-section pwc-service-care-workflow" id="care-workflow" tabIndex={-1} aria-labelledby="pwc-service-care-title">
      <h2 id="pwc-service-care-title">Quy trình chăm sóc của dịch vụ</h2>
      <div className="pwc-detail-care-phases">
        {PHASES.map(([phase, label]) => {
          const steps = workflow.steps.filter(step => step.phase === phase);
          return steps.length > 0 && (
            <article key={phase}>
              <h3>{label}</h3>
              <ol>{steps.map((step, index) => <Step key={index} step={step} />)}</ol>
            </article>
          );
        })}
      </div>
    </section>
  );
}
