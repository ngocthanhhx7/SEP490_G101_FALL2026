export function catalogVersionRecord(record) {
  const value = record.toObject ? record.toObject() : record;
  const result = { ...value };
  delete result.changeAudit;
  return result;
}
