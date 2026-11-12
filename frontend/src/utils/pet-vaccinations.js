// Presentation adapter only: the existing owner-declared care note remains canonical.
export function vaccinationRows(value = '') {
  return value.split('\n').filter(line => line.trim()).map(line => {
    const match = /^(.*?) — (\d{4}-\d{2}-\d{2}|Chưa rõ ngày tiêm)$/.exec(line);
    return match ? { name: match[1], date: match[2] === 'Chưa rõ ngày tiêm' ? '' : match[2] } : { name: line, date: '' };
  });
}
export function vaccinationNote(rows) {
  return rows.filter(row => row.name.trim()).map(row => `${row.name.trim()} — ${row.date || 'Chưa rõ ngày tiêm'}`).join('\n');
}
