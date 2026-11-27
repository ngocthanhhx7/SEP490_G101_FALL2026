const FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });

const TIME_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit',
  day: '2-digit', month: '2-digit', year: 'numeric', hourCycle: 'h23' });

// A moment as people in Vietnam read it in a message: HH:mm dd/mm/yyyy.
export function vietnamTimeDate(moment) {
  const part = Object.fromEntries(TIME_DATE.formatToParts(moment instanceof Date ? moment : new Date(moment))
    .map(({ type, value }) => [type, value]));
  return `${part.hour}:${part.minute} ${part.day}/${part.month}/${part.year}`;
}

// The calendar day in Vietnam for a moment, as YYYY-MM-DD. A receipt saved at 23:30 UTC is already the next day there.
export function vietnamDate(moment) {
  return FORMAT.format(moment instanceof Date ? moment : new Date(moment));
}
