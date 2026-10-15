import { ApiError } from '../../src/services/api-client.js';
import { createCareInstructionsApi } from '../../src/services/care-instructions-api.js';

const visitId = '507f1f77bcf86cd799439011';
const sitterId = '507f1f77bcf86cd799439012';

test('reads and versions care instructions through scoped API paths', async () => {
  const request = jest.fn()
    .mockResolvedValueOnce({ data: { visitId, version: 2, instructions: { allergies: 'No fish' }, accessWindow: { open: false } }, status: 200 })
    .mockResolvedValueOnce({ data: { visitId, version: 3, instructions: { summary: 'Updated' } }, status: 200 });
  const api = createCareInstructionsApi({ request, createIdempotencyKey: () => 'care-key-1' });
  await api.getInstructions({ visitId });
  await api.updateInstructions({ visitId, expectedVersion: 2, instructions: { summary: 'Updated' } });
  expect(request.mock.calls[0][0]).toBe(`/visits/${visitId}/care-instructions`);
  expect(request.mock.calls[1]).toEqual([`/visits/${visitId}/care-instructions`, expect.objectContaining({
    method: 'PATCH', expectedVersion: 2, idempotencyKey: 'care-key-1'
  })]);
});

test('acknowledges a version and confirms handover with the same server contract', async () => {
  const request = jest.fn()
    .mockResolvedValueOnce({ data: { visitId, version: 3, acknowledged: true }, status: 200 })
    .mockResolvedValueOnce({ data: { visitId, state: 'CONFIRMED', replacementSitterId: sitterId, accessGranted: true }, status: 200 });
  const api = createCareInstructionsApi({ request, createIdempotencyKey: () => 'command-key' });
  await api.acknowledgeInstructions({ visitId, instructionVersion: 3 });
  await api.confirmHandover({ visitId, replacementSitterId: sitterId, expectedVersion: 7, instructionVersion: 3 });
  expect(request.mock.calls.map(call => call[0])).toEqual([
    `/visits/${visitId}/care-instructions/acknowledgements`, `/visits/${visitId}/handovers`
  ]);
  expect(request.mock.calls[1][1].body).toMatchObject({ replacementSitterId: sitterId, instructionVersion: 3 });
});

test('fails closed for another resource, malformed responses and pending acknowledgements', async () => {
  const api = createCareInstructionsApi({ request: jest.fn().mockResolvedValue({ data: { visitId: sitterId, version: 1, instructions: {} }, status: 200 }) });
  await expect(api.getInstructions('../other')).rejects.toBeInstanceOf(ApiError);
  await expect(api.getInstructions({ visitId })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  const pending = createCareInstructionsApi({ request: jest.fn().mockResolvedValue({ data: null, status: 202, pending: true }) });
  await expect(pending.getInstructions({ visitId })).resolves.toMatchObject({ pending: true });
});
