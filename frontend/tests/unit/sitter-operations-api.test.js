import { createSitterOperationsApi } from '../../src/services/sitter-operations-api.js';

const offer = { id: 'offer-1', visitId: 'visit-1', sitterId: 'sitter-1', state: 'PENDING', version: 1,
  offeredAt: '2026-10-14T23:00:00Z', deadline: '2026-10-15T01:00:00Z', startAt: '2026-10-16T02:00:00Z', endAt: '2026-10-16T03:00:00Z',
  serviceName: 'Chăm sóc chó', areaCode: 'Q1', pets: [{ id: 'pet-1', name: 'Milo', species: 'DOG' }], canRespond: true };
const assignment = { id: 'visit-1', visitId: 'visit-1', state: 'ASSIGNED', version: 2,
  startAt: '2026-10-16T02:00:00Z', endAt: '2026-10-16T03:00:00Z', serviceName: 'Chăm sóc chó', areaCode: 'Q1', pets: [] };

test('validates bounded offer and assignment pages and forwards filters', async () => {
  const request = jest.fn(async path => path.startsWith('/offers') ? { data: { items: [offer], nextCursor: null, limit: 20 } } : { data: { items: [assignment], nextCursor: null, limit: 20 } });
  const api = createSitterOperationsApi({ request });
  await expect(api.listOffers({ state: 'PENDING', cursor: 'offer-0' })).resolves.toMatchObject({ data: { items: [offer] } });
  await api.listAssignments({ limit: 20 });
  expect(request.mock.calls[0][0]).toContain('state=PENDING');
  expect(request.mock.calls[0][0]).toContain('cursor=offer-0');
  expect(request.mock.calls[1][0]).toContain('limit=20');
});

test('rejects malformed responses and preserves pending state', async () => {
  const api = createSitterOperationsApi({ request: async () => ({ data: { items: [{ id: 'bad' }], nextCursor: null, limit: 20 } }) });
  await expect(api.listOffers()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const pending = createSitterOperationsApi({ request: async () => ({ pending: true, status: 202 }) });
  await expect(pending.listOffers()).resolves.toEqual({ pending: true, status: 202 });
});

test('accept/decline and withdrawal use server version plus idempotency key', async () => {
  const request = jest.fn(async () => ({ data: { offerId: 'offer-1', visitId: 'visit-1', state: 'ASSIGNED' } }));
  const api = createSitterOperationsApi({ request });
  await api.acceptOffer('offer-1', 1, 'accept-offer-1');
  await api.declineOffer('offer-1', 1, 'decline-offer-1');
  await api.withdrawVisit('visit-1', { expectedVersion: 2, reason: 'Conflict' }, 'withdraw-visit-1');
  expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST', body: { expectedVersion: 1 }, idempotencyKey: 'accept-offer-1' });
  expect(request.mock.calls[2][0]).toBe('/visits/visit-1/withdrawals');
  await expect(api.getVisit('../private')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});

test('private access note projection rejects missing or malformed fields', async () => {
  const api = createSitterOperationsApi({ request: async () => ({ data: { visitId: 'visit-1' } }) });
  await expect(api.getAccessNotes('visit-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('rejects private fields added to otherwise valid sitter projections', async () => {
  const offerApi = createSitterOperationsApi({ request: async () => ({ data: { ...offer, address: 'private' } }) });
  await expect(offerApi.getOffer('offer-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const visitApi = createSitterOperationsApi({ request: async () => ({ data: { visitId: 'visit-1', version: 1, state: 'ASSIGNED',
    startAt: assignment.startAt, endAt: assignment.endAt, serviceName: 'Chăm sóc', areaCode: 'Q1', pets: [],
    handoverRequired: false, handoverAccepted: false, canCheckIn: true, canCheckOut: false, customerContact: 'private' } }) });
  await expect(visitApi.getVisit('visit-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
