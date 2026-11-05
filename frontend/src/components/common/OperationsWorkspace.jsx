import '../../styles/operations-workspace.css';
export function OperationsMetrics({ items, caption }) {
  return (
    <section className="ops-overview" aria-label="Báo cáo tóm tắt">
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value ?? '—'}</dd>
            {item.note && <small>{item.note}</small>}
          </div>
        ))}
      </dl>
      {caption && <p>{caption}</p>}
    </section>
  );
}
export function OperationsTable({
  label,
  columns,
  rows,
  rowKey = (row) => row.id,
  empty = 'Chưa có dữ liệu.',
}) {
  return (
    <div className="ops-table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="ops-table">
        <caption>{label}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="ops-empty">
                <span className="ops-empty-message">{empty}</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function OperationsBadge({ children, tone = 'neutral' }) {
  return <span className={`ops-badge ops-badge--${tone}`}>{children}</span>;
}
