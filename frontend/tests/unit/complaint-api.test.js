import { expect, jest, test } from '@jest/globals';
import { createComplaintApi } from '../../src/services/complaint-api.js';

const complaint = { id: 'case-1', kind: 'COMPLAINT', visitId: 'visit-1', state: 'OPEN', version: 0, evidenceRefs: [{ mediaId: 'media-1' }] };
const envelope = { data: { complaint }, meta: { schemaVersion: 1 } };

test('UC-53 sends management search and uses the R3 resolution and decision DTOs', async () => {
  const request = jest.fn()
    .mockResolvedValueOnce({ data: { items: [complaint], counts: { OPEN: 1, ESCALATED: 0, RESOLVED: 0 } } })
    .mockResolvedValue(envelope);
  const api = createComplaintApi({ request, createIdempotencyKey: () => 'complaint-key-1' });
  await api.list({ state: 'OPEN', q: 'BK-0042', sort: 'oldest', cursor: 'page-2' });
  const [url, query] = request.mock.calls[0][0].split('?');
  expect(url).toBe('/complaints');
  expect(Object.fromEntries(new globalThis.URLSearchParams(query))).toEqual({
    state: 'OPEN', q: 'BK-0042', sort: 'oldest', cursor: 'page-2'
  });
  const proposal = { amountVnd: 45000, reason: 'Synthetic evidence', evidenceRefs: ['a'.repeat(64)] };
  await api.resolve({ complaintId: 'case-1', expectedVersion: 1, handlingNotes: 'Notes',
    customerResult: 'Result', proposal, idempotencyKey: 'complaint-resolution' });
  expect(request.mock.calls[1]).toEqual(['/complaints/case-1/resolution', { method: 'POST',
    body: { expectedVersion: 1, handlingNotes: 'Notes', customerResult: 'Result', proposal }, idempotencyKey: 'complaint-resolution' }]);
  await api.decide({ complaintId: 'case-1', expectedVersion: 2, customerResult: 'Final', amountVnd: 0 });
  expect(request.mock.calls[2]).toEqual(['/complaints/case-1/decision', { method: 'POST',
    body: { expectedVersion: 2, customerResult: 'Final', amountVnd: 0 }, idempotencyKey: 'complaint-key-1' }]);
});

test('submits complaint through the scoped endpoint and rejects public media links', async () => {
  const request = jest.fn().mockResolvedValue(envelope); const api = createComplaintApi({ request, createIdempotencyKey: () => 'complaint-key-1' });
  await expect(api.submit({ visitId: 'visit-1', expectedVersion: 4, category: 'PET_SAFETY', summary: 'An toàn', description: 'Nội dung' })).resolves.toEqual(envelope);
  expect(request).toHaveBeenCalledWith('/complaints/visits/visit-1', { method: 'POST', body: { expectedVersion: 4, category: 'PET_SAFETY', summary: 'An toàn', description: 'Nội dung' }, idempotencyKey: 'complaint-key-1' });
  const leaked = jest.fn().mockResolvedValue({ data: { complaint: { ...complaint, evidenceRefs: [{ mediaId: 'media-1', readUrl: 'https://public.invalid/file' }] } }, meta: { schemaVersion: 1 } });
  await expect(createComplaintApi({ request: leaked, createIdempotencyKey: () => 'complaint-key-2' }).submit({ visitId: 'visit-1', summary: 'x', description: 'y' })).rejects.toMatchObject({ code: 'PRIVATE_MEDIA_LEAK' });
});

test('validates complaint filters and command versions before network access', async () => {
  const request = jest.fn(); const api = createComplaintApi({ request, createIdempotencyKey: () => 'complaint-key-3' });
  await expect(api.list({ state: 'UNKNOWN' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  await expect(api.resolve({ complaintId: 'case-1', expectedVersion: -1, summary: 'x' })).rejects.toMatchObject({ code: 'INVALID_EXPECTED_VERSION' });
  expect(request).not.toHaveBeenCalled();
});

test('returns server pending without claiming a complaint was saved', async () => {
  const request = jest.fn().mockResolvedValue({ pending: true, status: 202 }); const api = createComplaintApi({ request, createIdempotencyKey: () => 'complaint-key-4' });
  await expect(api.submit({ visitId: 'visit-1', summary: 'x', description: 'y' })).resolves.toMatchObject({ pending: true });
});
