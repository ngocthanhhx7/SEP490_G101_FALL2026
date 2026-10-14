import { ApiError, createApiClient } from '../../src/services/api-client.js';
import { createPetProfileApi, PET_FIELD_STATUSES, PET_ID_PATTERN } from '../../src/services/pet-profile-api.js';

const PET_ID = '64b000000000000000000015';

function petView(overrides = {}) {
  return {
    id: PET_ID,
    state: 'ACTIVE',
    version: 7,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    name: 'Mây',
    species: 'DOG',
    profileVersion: 7,
    careFields: {},
    ...overrides,
  };
}

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test('exposes only P01 care-field states and validates 24-hex resource IDs', () => {
  expect(PET_FIELD_STATUSES).toEqual([
    'KNOWN', 'UNKNOWN', 'NOT_PROVIDED', 'NOT_APPLICABLE', 'NEEDS_CONFIRMATION',
  ]);
  expect(PET_ID_PATTERN.test(PET_ID)).toBe(true);
  expect(PET_ID_PATTERN.test('not-an-id')).toBe(false);
});

test('reads a PetView through the existing same-origin API client', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(200, {
    data: petView({ careFields: { breed: { status: 'UNKNOWN' } } }),
    meta: { schemaVersion: 1, entityVersion: 7 },
  }));
  const client = createApiClient({ fetchImpl });
  const api = createPetProfileApi({ request: client });
  const controller = new AbortController();

  await expect(api.getPet(PET_ID, { signal: controller.signal }))
    .resolves.toMatchObject({ data: { id: PET_ID, state: 'ACTIVE', careFields: { breed: { status: 'UNKNOWN' } } } });
  expect(fetchImpl).toHaveBeenCalledWith(`/api/v1/pets/${PET_ID}`, expect.objectContaining({
    method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: expect.anything(),
  }));
});

test('sends expectedVersion, only changed care fields and customer source through PATCH', async () => {
  const updated = petView({ version: 8, name: 'Mây nhỏ', careFields: {
    breed: { status: 'KNOWN', value: 'Chó lai', source: 'CUSTOMER_REPORTED' },
    customer_reported_health_notes: { status: 'UNKNOWN' },
  } });
  const fetchImpl = jest.fn().mockResolvedValue(response(200, {
    data: updated, meta: { schemaVersion: 1, entityVersion: 8 },
  }));
  const client = createApiClient({ fetchImpl, getCsrfToken: () => 'test-csrf' });
  const api = createPetProfileApi({ request: client });

  await expect(api.updatePet(PET_ID, {
    name: ' Mây nhỏ ', species: 'DOG', careFields: {
      breed: { status: 'KNOWN', value: 'Chó lai', updatedAt: 'untrusted', updatedBy: 'untrusted' },
      customer_reported_health_notes: { status: 'UNKNOWN', value: 'not allowed for this status' },
    },
  }, { expectedVersion: 7 })).resolves.toMatchObject({ data: { version: 8, name: 'Mây nhỏ' } });

  const [path, request] = fetchImpl.mock.calls[0];
  expect(path).toBe(`/api/v1/pets/${PET_ID}`);
  expect(request.method).toBe('PATCH');
  expect(request.headers.get('X-CSRF-Token')).toBe('test-csrf');
  expect(JSON.parse(request.body)).toEqual({
    name: 'Mây nhỏ', species: 'DOG', expectedVersion: 7,
    careFields: {
      breed: { status: 'KNOWN', value: 'Chó lai', source: 'CUSTOMER_REPORTED' },
      customer_reported_health_notes: { status: 'UNKNOWN' },
    },
  });
});

test('strips actor, verification and private file metadata nested in field values', async () => {
  const request = jest.fn().mockResolvedValue({ data: petView({ version: 8 }), status: 200, pending: false });
  const api = createPetProfileApi({ request });
  await api.updatePet(PET_ID, {
    name: 'Mây', species: 'DOG', careFields: {
      vaccination_records: { status: 'KNOWN', source: 'PROFESSIONALLY_VERIFIED', updatedBy: 'actor-secret', value: [
        { name: 'Vaccine A', date: '2026-10-12', source: 'PROFESSIONALLY_VERIFIED', fileRef: 'private-object-key', updatedBy: 'actor-secret' },
      ] },
      emergency_contact: { status: 'KNOWN', value: {
        name: 'Người liên hệ', relationship: 'Bạn', phone: '0900000000', ownerId: 'another-customer', fileRef: 'private-object-key', updatedBy: 'actor-secret',
      } },
    },
  }, { expectedVersion: 7 });

  expect(request.mock.calls[0][1].body).toEqual({
    name: 'Mây', species: 'DOG', careFields: {
      vaccination_records: { status: 'KNOWN', source: 'CUSTOMER_REPORTED', value: [{ name: 'Vaccine A', date: '2026-10-12' }] },
      emergency_contact: { status: 'KNOWN', source: 'CUSTOMER_REPORTED', value: {
        name: 'Người liên hệ', relationship: 'Bạn', phone: '0900000000',
      } },
    },
  });
  expect(JSON.stringify(request.mock.calls[0][1].body)).not.toMatch(/actor-secret|private-object-key|another-customer|PROFESSIONALLY_VERIFIED/);
});

test('accepts CSRF/session hooks from the future app adapter without storing a browser token', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(200, {
    data: petView({ name: 'Mây cập nhật', version: 8 }), meta: { schemaVersion: 1 },
  }));
  const onUnauthorized = jest.fn();
  const api = createPetProfileApi({ fetchImpl, getCsrfToken: () => 'ephemeral-csrf', onUnauthorized });

  await api.updatePet(PET_ID, { name: 'Mây cập nhật', species: 'DOG' }, { expectedVersion: 7 });
  const [, request] = fetchImpl.mock.calls[0];
  expect(request.headers.get('X-CSRF-Token')).toBe('ephemeral-csrf');
  expect(request.body).not.toMatch(/ephemeral-csrf/);
  expect(onUnauthorized).not.toHaveBeenCalled();
});

test('forwards unauthorized API responses to the injected session invalidation hook', async () => {
  const onUnauthorized = jest.fn();
  const api = createPetProfileApi({
    fetchImpl: async () => response(401, { error: { code: 'UNAUTHENTICATED' } }),
    onUnauthorized,
  });
  await expect(api.getPet(PET_ID)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});

test('keeps a 202 mutation explicitly pending instead of requiring a PetView', async () => {
  const request = jest.fn().mockResolvedValue({
    data: { operationId: 'opaque-operation', state: 'PROCESSING' }, status: 202, pending: true,
  });
  const api = createPetProfileApi({ request });

  await expect(api.updatePet(PET_ID, { name: 'Mây', species: 'DOG' }, { expectedVersion: 7 }))
    .resolves.toMatchObject({ status: 202, pending: true, data: { state: 'PROCESSING' } });
});

test('treats a successful 204 write as pending until a fresh PetView can be read', async () => {
  const request = jest.fn().mockResolvedValue({ data: null, status: 204, pending: false });
  const api = createPetProfileApi({ request });

  await expect(api.archivePet(PET_ID, { expectedVersion: 7 }))
    .resolves.toMatchObject({ data: null, status: 204, pending: true });
});

test('passes version conflicts through without retrying or claiming a write', async () => {
  const request = jest.fn().mockRejectedValue(new ApiError('VERSION_CONFLICT', 409));
  const api = createPetProfileApi({ request });

  await expect(api.updatePet(PET_ID, { name: 'Mây', species: 'DOG' }, { expectedVersion: 7 }))
    .rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  expect(request).toHaveBeenCalledTimes(1);
});

test('archives through the P01 command and accepts only an archived PetView acknowledgement', async () => {
  const archived = petView({ state: 'ARCHIVED', version: 8 });
  const request = jest.fn().mockResolvedValue({ data: archived, status: 200, pending: false });
  const api = createPetProfileApi({ request });

  await expect(api.archivePet(PET_ID, { expectedVersion: 7 })).resolves.toMatchObject({
    data: { state: 'ARCHIVED', version: 8 },
  });
  expect(request).toHaveBeenCalledWith(`/pets/${PET_ID}/archives`, {
    method: 'POST', body: {}, expectedVersion: 7,
  });

  const notArchived = createPetProfileApi({ request: jest.fn().mockResolvedValue({
    data: petView({ version: 8 }), status: 200, pending: false,
  }) });
  await expect(notArchived.archivePet(PET_ID, { expectedVersion: 7 }))
    .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

  const noRepresentation = createPetProfileApi({ request: jest.fn().mockResolvedValue({
    data: null, status: 204, pending: false,
  }) });
  await expect(noRepresentation.archivePet(PET_ID, { expectedVersion: 7 }))
    .resolves.toMatchObject({ status: 204, pending: true });
});

test.each([
  ['invalid resource id', () => createPetProfileApi({ request: jest.fn() }).getPet('bad-id')],
  ['missing version', () => createPetProfileApi({ request: jest.fn() }).updatePet(PET_ID, { name: 'Mây', species: 'DOG' })],
  ['unsupported species', () => createPetProfileApi({ request: jest.fn() }).updatePet(PET_ID, { name: 'Mây', species: 'RABBIT' }, { expectedVersion: 0 })],
  ['unknown status', () => createPetProfileApi({ request: jest.fn() }).updatePet(PET_ID, {
    name: 'Mây', species: 'DOG', careFields: { breed: { status: 'SAFE' } },
  }, { expectedVersion: 0 })],
  ['known without a value', () => createPetProfileApi({ request: jest.fn() }).updatePet(PET_ID, {
    name: 'Mây', species: 'DOG', careFields: { breed: { status: 'KNOWN' } },
  }, { expectedVersion: 0 })],
])('rejects %s before a request is sent', async (_name, action) => {
  await expect(action()).rejects.toBeInstanceOf(ApiError);
});

test('rejects a response whose resource ID does not match the requested pet', async () => {
  const api = createPetProfileApi({ request: async () => ({
    data: petView({ id: '64b000000000000000000099' }), status: 200, pending: false,
  }) });
  await expect(api.getPet(PET_ID)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test.each([
  [{ breed: { status: 'SAFE' } }],
  [{ breed: { status: 'KNOWN' } }],
  [{ breed: { status: 'UNKNOWN', value: 'Có thể có rủi ro' } }],
  [{ breed: { status: 'KNOWN', value: 'Chó lai', source: 'SYSTEM_VERIFIED' } }],
  [{ microchip_number: { status: 'NOT_PROVIDED' } }],
])('rejects a PetView with an invalid dynamic care field projection %j', async (careFields) => {
  const api = createPetProfileApi({ request: jest.fn().mockResolvedValue({
    data: petView({ careFields }), status: 200, pending: false,
  }) });
  await expect(api.getPet(PET_ID)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
