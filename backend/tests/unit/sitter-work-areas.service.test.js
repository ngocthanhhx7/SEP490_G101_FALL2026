import { expect, jest, test } from '@jest/globals';
import { AppError } from '../../src/utils/app-error.js';
import { createSitterWorkAreasService, MAX_SITTER_WORK_AREA_CODES } from '../../src/services/sitter-work-areas.service.js';

const sitter = Object.freeze({ userId: 'sitter-1', roles: ['PET_SITTER'], state: 'ACTIVE' });
const catalog = [
  { code: 'CITY_HCM', label: 'Thành phố Hồ Chí Minh', level: 'CITY', coordinates: [10.7, 106.6] },
  { code: 'DISTRICT_Q1', label: 'Quận 1', level: 'DISTRICT', customerAddress: 'private address' },
];

function makeService(overrides = {}) {
  const ports = {
    listCoverageAreas: jest.fn(async () => catalog),
    getSitterAvailability: jest.fn(async () => ({ areas: ['CITY_HCM'], version: 3 })),
    replaceSitterAreas: jest.fn(async ({ areas, expectedVersion }) => ({
      areas, version: expectedVersion + 1,
    })),
    ...overrides,
  };
  return { service: createSitterWorkAreasService(ports), ports };
}

test('requires the catalog and persistence ports', () => {
  expect(() => createSitterWorkAreasService({})).toThrow(TypeError);
});

test('returns a safe catalog projection and only the caller sitter coverage', async () => {
  const { service, ports } = makeService();
  await expect(service.getMine({ actor: sitter })).resolves.toEqual({
    options: [
      { code: 'CITY_HCM', label: 'Thành phố Hồ Chí Minh', level: 'CITY' },
      { code: 'DISTRICT_Q1', label: 'Quận 1', level: 'DISTRICT' },
    ],
    selectedCodes: ['CITY_HCM'],
    expectedVersion: 3,
  });
  expect(ports.getSitterAvailability).toHaveBeenCalledWith('sitter-1');
  expect(JSON.stringify(await service.getMine({ actor: sitter }))).not.toMatch(/coordinates|customerAddress|private address/);
});

test.each([
  [null, 401],
  [{ ...sitter, state: 'LOCKED' }, 401],
  [{ ...sitter, roles: ['CUSTOMER'] }, 403],
  [{ ...sitter, roles: ['ADMIN'] }, 403],
])('rejects actor %j with status %i without reading private availability', async (actor, status) => {
  const { service, ports } = makeService();
  await expect(service.getMine({ actor })).rejects.toMatchObject({ status });
  expect(ports.getSitterAvailability).not.toHaveBeenCalled();
});

test('normalizes case/space, removes duplicate selections and uses a bounded allowlist', async () => {
  const { service, ports } = makeService({
    replaceSitterAreas: jest.fn(async ({ areas, expectedVersion }) => ({ areas, version: expectedVersion + 1 })),
  });
  await expect(service.replaceMine({ actor: sitter, areas: [' district_q1 ', 'DISTRICT_Q1'], expectedVersion: 3, idempotencyKey: 'areas-key-0001' }))
    .resolves.toMatchObject({ selectedCodes: ['DISTRICT_Q1'], expectedVersion: 4 });
  expect(ports.replaceSitterAreas).toHaveBeenCalledWith({
    sitterId: 'sitter-1', actorRef: 'sitter-1', authEpoch: undefined, areas: ['DISTRICT_Q1'], expectedVersion: 3, idempotencyKey: 'areas-key-0001',
  });
});

test.each([
  ['not-an-array', 3],
  [Array.from({ length: MAX_SITTER_WORK_AREA_CODES + 1 }, () => 'CITY_HCM'), 3],
  [['10.7,106.6'], 3],
  [['12 Example Street'], 3],
  [['CITY_UNKNOWN'], 3],
  [['CITY_HCM'], -1],
  [['CITY_HCM'], 1.5],
])('rejects unsafe/unbounded selection or version (%j, %j)', async (areaCodes, expectedVersion) => {
  const { service, ports } = makeService();
  await expect(service.replaceMine({ actor: sitter, areas: areaCodes, expectedVersion, idempotencyKey: 'areas-key-0001' }))
    .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(ports.replaceSitterAreas).not.toHaveBeenCalled();
});

test('allows an explicit empty selection to stop coverage of new requests', async () => {
  const { service, ports } = makeService();
  await expect(service.replaceMine({ actor: sitter, areas: [], expectedVersion: 3, idempotencyKey: 'areas-key-0001' }))
    .resolves.toMatchObject({ selectedCodes: [], expectedVersion: 4 });
  expect(ports.replaceSitterAreas).toHaveBeenCalledWith({
    sitterId: 'sitter-1', actorRef: 'sitter-1', authEpoch: undefined, areas: [], expectedVersion: 3, idempotencyKey: 'areas-key-0001',
  });
});

test('fails closed on stale versions, unsafe catalog rows and corrupted stored areas', async () => {
  const stale = makeService({ replaceSitterAreas: async () => null });
  await expect(stale.service.replaceMine({ actor: sitter, areas: [], expectedVersion: 3, idempotencyKey: 'areas-key-0001' }))
    .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });

  const unsafeCatalog = makeService({ listCoverageAreas: async () => [
    { code: '10.7769,106.7009', label: 'Private coordinate', level: 'CITY' },
  ] });
  await expect(unsafeCatalog.service.getMine({ actor: sitter })).rejects.toMatchObject({
    status: 503, code: 'WORK_AREA_CATALOG_UNAVAILABLE',
  });
  expect(unsafeCatalog.ports.getSitterAvailability).not.toHaveBeenCalled();

  const corrupted = makeService({ getSitterAvailability: async () => ({ areas: ['CITY_NOT_LISTED'], version: 3 }) });
  await expect(corrupted.service.getMine({ actor: sitter })).rejects.toMatchObject({
    status: 503, code: 'AVAILABILITY_UNAVAILABLE',
  });
});

test('rejects duplicate catalog codes and an unconfirmed persistence response', async () => {
  const duplicateCatalog = makeService({ listCoverageAreas: async () => [catalog[0], catalog[0]] });
  await expect(duplicateCatalog.service.getMine({ actor: sitter })).rejects.toBeInstanceOf(AppError);

  const unconfirmed = makeService({
    replaceSitterAreas: async ({ expectedVersion }) => ({ areas: [], version: expectedVersion }),
  });
  await expect(unconfirmed.service.replaceMine({ actor: sitter, areas: [], expectedVersion: 3, idempotencyKey: 'areas-key-0001' }))
    .rejects.toMatchObject({ status: 503, code: 'AVAILABILITY_UNAVAILABLE' });
});

test('maps persistence outages to safe service-unavailable errors', async () => {
  const readUnavailable = makeService({ getSitterAvailability: async () => { throw new Error('database URI details'); } });
  await expect(readUnavailable.service.getMine({ actor: sitter })).rejects.toMatchObject({
    status: 503, code: 'AVAILABILITY_UNAVAILABLE', message: 'Availability is unavailable',
  });

  const writeUnavailable = makeService({ replaceSitterAreas: async () => { throw new Error('private storage details'); } });
  await expect(writeUnavailable.service.replaceMine({ actor: sitter, areas: [], expectedVersion: 3, idempotencyKey: 'areas-key-0001' })).rejects.toMatchObject({
    status: 503, code: 'AVAILABILITY_UNAVAILABLE', message: 'Availability could not be saved',
  });
});
