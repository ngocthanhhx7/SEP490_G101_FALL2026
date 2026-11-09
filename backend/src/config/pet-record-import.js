export function petRecordImportConfig(env = process.env) {
  const enabled = env.PET_RECORD_IMPORT_ENABLED === 'true';
  if (env.PET_RECORD_IMPORT_ENABLED && !['true', 'false'].includes(env.PET_RECORD_IMPORT_ENABLED)) throw new TypeError('Invalid PET_RECORD_IMPORT_ENABLED');
  const model = env.GEMINI_PET_RECORD_MODEL || 'gemini-3.1-flash-lite';
  if (!/^gemini-[a-z0-9.-]{1,80}$/.test(model)) throw new TypeError('Invalid GEMINI_PET_RECORD_MODEL');
  if (enabled && !env.GEMINI_API_KEY?.trim()) throw new TypeError('GEMINI_API_KEY required for pet record import');
  return { enabled, model, key: env.GEMINI_API_KEY?.trim() };
}
