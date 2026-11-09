import { test, expect, jest } from '@jest/globals';
import { createPetRecordImport } from '../../src/services/pet-record-import.service.js';
import { petRecordImportConfig } from '../../src/config/pet-record-import.js';
import sharp from 'sharp';
const config = { enabled: true, key: 'synthetic-key-not-real', model: 'gemini-3.1-flash-lite' };
const input = { bytes: Buffer.from('%PDF-1.7\nsynthetic-test-only\n%%EOF'), contentType: 'application/pdf', consent: true };
const result = { entries: [{ field: 'vaccination', value: 'Mũi tiêm ghi ngày 01/11/2026', sourceText: '01/11/2026', page: 1 }], warnings: ['Đối chiếu với sổ gốc'] };
const json = value => new globalThis.Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const generated = value => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
test('default disabled; explicit enable requires server key and restricts model path', () => {
  expect(petRecordImportConfig({})).toMatchObject({ enabled: false, model: 'gemini-3.1-flash-lite' });
  expect(() => petRecordImportConfig({ PET_RECORD_IMPORT_ENABLED: 'true' })).toThrow();
  expect(() => petRecordImportConfig({ PET_RECORD_IMPORT_ENABLED: 'true', GEMINI_API_KEY: 'synthetic' })).toThrow('GEMINI_PET_RECORD_DATA_TIER');
  expect(petRecordImportConfig({ PET_RECORD_IMPORT_ENABLED: 'true', GEMINI_API_KEY: 'synthetic', GEMINI_PET_RECORD_DATA_TIER: 'paid' }).enabled).toBe(true);
  expect(() => petRecordImportConfig({ GEMINI_PET_RECORD_MODEL: '../secret' })).toThrow();
});
test('bounded PDF transcription counts tokens first, uses fixed Google host and returns only allowed draft fields', async () => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(json({ totalTokens: 123 })).mockResolvedValueOnce(generated(result));
  const service = createPetRecordImport({ config, fetchImpl });
  expect(await service.extract(input)).toEqual({ ...result, model: config.model, requiresReview: true });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:countTokens');
  const options = fetchImpl.mock.calls[1][1]; expect(options.redirect).toBe('error'); expect(options.headers['x-goog-api-key']).toBe(config.key);
  expect(JSON.parse(options.body).generationConfig).toMatchObject({ maxOutputTokens: 6000, responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } });
  expect(JSON.parse(options.body).generationConfig).not.toHaveProperty('responseSchema');
});
test('disabled, consent, file signatures and oversized uploads fail before any provider request', async () => {
  const fetchImpl = jest.fn(), service = createPetRecordImport({ config, fetchImpl });
  await expect(createPetRecordImport({ config: { enabled: false }, fetchImpl }).extract(input)).rejects.toMatchObject({ code: 'PET_RECORD_IMPORT_DISABLED' });
  for (const value of [{ ...input, consent: false }, { ...input, bytes: Buffer.from('not pdf') }, { ...input, bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }, { ...input, contentType: 'text/html' }]) await expect(service.extract(value)).rejects.toMatchObject({ status: 422 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('complex documents stop after counting; quota is surfaced without automatic retries', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(json({ totalTokens: 16001 }));
  await expect(createPetRecordImport({ config, fetchImpl }).extract(input)).rejects.toMatchObject({ code: 'PET_RECORD_TOO_COMPLEX' }); expect(fetchImpl).toHaveBeenCalledTimes(1);
  const quota = jest.fn().mockResolvedValue(new globalThis.Response('', { status: 429 }));
  await expect(createPetRecordImport({ config, fetchImpl: quota }).extract(input)).rejects.toMatchObject({ status: 429, code: 'PET_RECORD_QUOTA_EXCEEDED' });expect(quota).toHaveBeenCalledTimes(1);
});
test('image input is decoded and reduced before Google; spoofed SVG is rejected', async () => {
  const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#ddd' } }).png().toBuffer();
  const fetchImpl = jest.fn().mockResolvedValueOnce(json({ totalTokens: 123 })).mockResolvedValueOnce(generated(result));
  const service = createPetRecordImport({ config, fetchImpl });
  await service.extract({ ...input, bytes: png, contentType: 'image/png' });
  const part = JSON.parse(fetchImpl.mock.calls[0][1].body).contents[0].parts[0].inlineData;
  expect(part.mimeType).toBe('image/jpeg');
  expect(await sharp(Buffer.from(part.data, 'base64')).metadata()).toMatchObject({ format: 'jpeg', width: 1600, height: 800 });
  await expect(service.extract({ ...input, bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), contentType: 'image/png' })).rejects.toMatchObject({ code: 'INVALID_PET_RECORD' });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
test('oversized provider responses are bounded and are not treated as saved facts', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(new globalThis.Response('x'.repeat(96 * 1024 + 1)));
  await expect(createPetRecordImport({ config, fetchImpl }).extract(input)).rejects.toMatchObject({ code: 'INVALID_PET_RECORD_RESULT' });
});
test.each([
  { entries: [{ ...result.entries[0], field: '__proto__' }], warnings: [] },
  { entries: [result.entries[0], result.entries[0]], warnings: [] },
  { entries: [{ ...result.entries[0], value: 'x'.repeat(2001) }], warnings: [] },
  { entries: [{ ...result.entries[0], sourceText: '' }], warnings: [] }
])('rejects malformed or unsafe provider output', async value => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(json({ totalTokens: 100 })).mockResolvedValueOnce(generated(value));
  await expect(createPetRecordImport({ config, fetchImpl }).extract(input)).rejects.toMatchObject({ code: 'INVALID_PET_RECORD_RESULT' });
});
