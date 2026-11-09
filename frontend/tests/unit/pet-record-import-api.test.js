import { createPetRecordImportApi } from '../../src/services/pet-record-import-api.js';
const entry = { field: 'allergies', status: 'UNKNOWN', value: '', sourceText: 'Allergies unknown', page: 1 };
const file = () => new globalThis.File(['synthetic'], 'book.pdf', { type: 'application/pdf' });
const response = data => ({ ok: true, status: 200, json: async () => ({ meta: { schemaVersion: 1 }, data }) });
test('record transport uses current CSRF and explicit Google consent without putting keys in browser requests', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ requiresReview: true, entries: [entry], warnings: [] }));
  const api = createPetRecordImportApi({ getCsrfToken: () => 'synthetic-csrf', fetchImpl });
  expect((await api.extract(file())).entries[0].status).toBe('UNKNOWN');
  expect(fetchImpl).toHaveBeenCalledWith('/api/v1/pet-record-import', expect.objectContaining({ credentials: 'same-origin', redirect: 'error', headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic-csrf', 'X-Pet-Record-Consent': 'google-gemini' }) }));
});
test.each([
  { requiresReview: true, entries: [{ ...entry, status: undefined }], warnings: [] },
  { requiresReview: true, entries: [{ ...entry, value: 'not an unknown' }], warnings: [] },
  { requiresReview: true, entries: [entry, entry], warnings: [] },
  { requiresReview: true, entries: [entry], warnings: 'not an array' }
])('HTTP200 with malformed record data fails cleanly before a draft can be applied', async data => {
  const api = createPetRecordImportApi({ getCsrfToken: () => 'synthetic-csrf', fetchImpl: jest.fn().mockResolvedValue(response(data)) });
  await expect(api.extract(file())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
