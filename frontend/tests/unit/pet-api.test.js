import { ApiError } from '../../src/services/api-client.js';
import { createPetApi } from '../../src/services/pet-api.js';

const pet = {
  id: '507f1f77bcf86cd799439011', name: 'Milo', species: 'DOG',
  state: 'ACTIVE', version: 2,
};

test('lists pets through the collection route and unwraps the cursor page', async () => {
  const request = jest.fn().mockResolvedValue({
    data: { items: [pet], nextCursor: 'cursor+next' },
    meta: { schemaVersion: 1 }, status: 200, pending: false,
  });
  const api = createPetApi({ request });

  await expect(api.listPets({ cursor: 'cursor+next' })).resolves.toMatchObject({
    data: [pet], meta: { nextCursor: 'cursor+next' },
  });
  expect(request).toHaveBeenCalledWith('/pets?limit=20&cursor=cursor%2Bnext', { signal: undefined });
});

test('does not interpret a malformed successful collection response as an empty list', async () => {
  const api = createPetApi({ request: async () => ({ data: { results: [] }, status: 200 }) });
  await expect(api.listPets()).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
});

test('keeps an accepted list request pending without consuming its payload', async () => {
  const api = createPetApi({ request: async () => ({ data: { items: [pet] }, status: 202, pending: true }) });
  await expect(api.listPets()).resolves.toMatchObject({ data: [], pending: true });
});

test('creates with only name and species and requires an idempotency key', async () => {
  const created = { ...pet, name: 'Mèo Mướp', species: 'CAT' };
  const request = jest.fn().mockResolvedValue({ data: created, status: 201, pending: false });
  const api = createPetApi({ request });

  await expect(api.createPet({ name: 'Mèo Mướp', species: 'CAT', idempotencyKey: 'operation-1' }))
    .resolves.toMatchObject({ data: created, status: 201 });
  expect(request).toHaveBeenCalledWith('/pets', {
    method: 'POST', body: { name: 'Mèo Mướp', species: 'CAT' }, idempotencyKey: 'operation-1',
  });
  await expect(api.createPet({ name: 'Mèo Mướp', species: 'CAT' }))
    .rejects.toBeInstanceOf(ApiError);
  expect(request).toHaveBeenCalledTimes(1);
});

test('archives through the archive command with expected version and idempotency key', async () => {
  const request = jest.fn().mockResolvedValue({ data: null, status: 204, pending: false });
  const api = createPetApi({ request });

  await expect(api.archivePet({
    petId: pet.id, expectedVersion: pet.version, idempotencyKey: 'archive-operation',
  })).resolves.toMatchObject({ status: 204 });
  expect(request).toHaveBeenCalledWith(`/pets/${pet.id}/archives`, {
    method: 'POST', body: {}, expectedVersion: pet.version, idempotencyKey: 'archive-operation',
  });
  await expect(api.archivePet({ petId: '../other', expectedVersion: 2, idempotencyKey: 'bad' }))
    .rejects.toMatchObject({ code: 'INVALID_RESOURCE_ID' });
});
