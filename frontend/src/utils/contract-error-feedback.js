import { formatVietnamDate } from './calendar-date.js';

export const CONTRACT_END_AFTER_START_MESSAGE = 'Ngày kết thúc phải sau ngày bắt đầu.';

export function formatContractStartDateConflict(error, fallbackName) {
  if (error?.reasonCode !== 'CONTRACT_EFFECTIVE_DATE_NOT_AFTER_PRIOR') return null;
  const name = error.sitterName || fallbackName || 'Người chăm sóc';
  const dateText = formatVietnamDate(error.effectiveAt);
  return dateText
    ? `${name} đã có hợp đồng từ ngày ${dateText}. Hợp đồng mới phải bắt đầu sau ngày đó.`
    : `${name} đã có hợp đồng trước đó. Hợp đồng mới phải bắt đầu sau ngày bắt đầu của hợp đồng hiện tại.`;
}
