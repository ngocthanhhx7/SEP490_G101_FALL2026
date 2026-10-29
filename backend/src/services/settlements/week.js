// Request week is the local Monday date, never an earning-period identifier.
export function vietnamRequestWeek(value) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new TypeError('Invalid settlement clock');
  const offset = 7 * 60 * 60 * 1000;
  const local = new Date(instant.getTime() + offset);
  const day = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - day);
  local.setUTCHours(0, 0, 0, 0);
  const start = local.getTime() - offset;
  return Object.freeze({ requestWeekKey: local.toISOString().slice(0, 10),
    startsAt: new Date(start).toISOString(), endsAt: new Date(start + 7 * 86400000).toISOString() });
}
