export const CONTRACT_END_AFTER_START_MESSAGE = 'Ngày kết thúc phải sau ngày bắt đầu.';

function formatVietnamDate(value) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(timestamp));
}

export function formatContractStartDateConflict(error, fallbackName) {
  if (error?.reasonCode !== 'CONTRACT_EFFECTIVE_DATE_NOT_AFTER_PRIOR') return null;
  const name = error.sitterName || fallbackName || 'Người chăm sóc';
  const dateText = formatVietnamDate(error.effectiveAt);
  return dateText
    ? `${name} đã có hợp đồng từ ngày ${dateText}. Hợp đồng mới phải bắt đầu sau ngày đó.`
    : `${name} đã có hợp đồng trước đó. Hợp đồng mới phải bắt đầu sau ngày bắt đầu của hợp đồng hiện tại.`;
}
