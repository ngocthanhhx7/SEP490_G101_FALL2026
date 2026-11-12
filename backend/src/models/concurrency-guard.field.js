// Optional: legacy documents acquire a guard only when their first guarded
// transaction runs. No eager default/backfill or extra index is necessary.
export const concurrencyGuardField = () => ({
  type: Number, min: 0, max: Number.MAX_SAFE_INTEGER,
  validate: Number.isSafeInteger, select: false
});
