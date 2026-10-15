import { expect, jest, test } from '@jest/globals';
import { createSitterComplaintApi } from '../../src/services/sitter-complaint-api.js';

const complaint = { id: 'case-1', kind: 'COMPLAINT', visitId: 'visit-1', state: 'UNDER_REVIEW', category: 'PET_SAFETY', evidenceRefs: [{ mediaId: 'media-1' }] };
test('reads only safe related complaint projections', async () => {
  const request = jest.fn().mockResolvedValue({ data: { items: [complaint] }, meta: { schemaVersion: 1 } });
  const api = createSitterComplaintApi({ request });
  await expect(api.list({ visitId: 'visit-1' })).resolves.toMatchObject({ data: { items: [complaint] } });
  expect(request).toHaveBeenCalledWith('/complaints?visitId=visit-1', { signal: undefined });
});
test('normalizes the detail envelope for the Sitter page', async () => {
  const request = jest.fn().mockResolvedValue({ data: { complaint }, meta: { schemaVersion: 1 } });
  await expect(createSitterComplaintApi({ request }).get('case-1')).resolves.toMatchObject({ data: complaint });
});
test('does not expose write methods and rejects Staff notes or public evidence URLs', async () => {
  const request = jest.fn().mockResolvedValue({ data: { complaint: { ...complaint, staffNotes: 'private' } }, meta: { schemaVersion: 1 } });
  const api = createSitterComplaintApi({ request });
  expect(api.submit).toBeUndefined(); expect(api.resolve).toBeUndefined();
  await expect(api.get('case-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const leaked = jest.fn().mockResolvedValue({ data: { complaint: { ...complaint, evidenceRefs: [{ mediaId: 'media-1', url: 'https://public.invalid' }] } }, meta: { schemaVersion: 1 } });
  await expect(createSitterComplaintApi({ request: leaked }).get('case-1')).rejects.toMatchObject({ code: 'PRIVATE_MEDIA_LEAK' });
  const privateProjection = jest.fn().mockResolvedValue({ data: { complaint: { ...complaint, settlement: { state: 'ON_HOLD' } } }, meta: { schemaVersion: 1 } });
  await expect(createSitterComplaintApi({ request: privateProjection }).get('case-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
