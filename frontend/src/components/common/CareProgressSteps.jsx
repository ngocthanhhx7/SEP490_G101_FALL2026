import './care-progress-steps.css';
export function CareProgressSteps({ steps, current, complete = false }) {
  return <ol className="care-progress-steps" aria-label="Tiến độ chăm sóc">{steps.map((step,index)=><li key={step} className={complete||index<current?'is-complete':index===current?'is-current':''} aria-current={!complete&&index===current?'step':undefined}>
    <span className="care-progress-steps__marker" aria-hidden="true">{complete||index<current?'✓':index+1}</span><span>{step}</span>
  </li>)}</ol>;
}
