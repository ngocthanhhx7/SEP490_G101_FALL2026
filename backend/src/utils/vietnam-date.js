const FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });

// The calendar day in Vietnam for a moment, as YYYY-MM-DD. A receipt saved at 23:30 UTC is already the next day there.
export function vietnamDate(moment) {
  return FORMAT.format(moment instanceof Date ? moment : new Date(moment));
}
