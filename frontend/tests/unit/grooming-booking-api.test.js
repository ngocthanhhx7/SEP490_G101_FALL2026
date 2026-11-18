import { ApiError, SESSION_INVALIDATED_EVENT } from '../../src/services/api-client.js';
import { createGroomingBookingApi } from '../../src/services/grooming-booking-api.js';

const meta = { schemaVersion: 1 };
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: new Headers(), json: async () => body });
const apiWith = (fetchImpl, getCsrfToken = () => 'csrf') => createGroomingBookingApi({ fetchImpl, getCsrfToken });
const appointment = { id: 'a1', code: 'GR-0001', slot: { startAt: '2026-11-05T03:00:00.000Z', localDate: '2026-11-05' }, pricing: { totalVnd: 475000 } };

test('reads options, slots and prices through the grooming routes', async () => {
  const calls = [];
  const fetchImpl = jest.fn(async (url, init) => {
    calls.push([init.method, url]);
    if (url.endsWith('/options')) return reply(200, { data: { services: [{ id: 's', name: 'Tắm', species: ['DOG'], bookable: true }], questions: [], window: { firstDate: '2026-11-05', lastDate: '2026-11-11' } }, meta });
    if (url.endsWith('/slots')) return reply(200, { data: { date: '2026-11-05', slots: [{ startAt: '2026-11-05T03:00:00.000Z', time: '10:00', state: 'AVAILABLE' }] }, meta });
    if (url.endsWith('/pets')) return reply(200, { data: [{ _id: 'p1', name: 'Milo', species: 'DOG' }], meta });
    if (url.endsWith('/pet-care/catalog')) return reply(200, { data: { breeds: [] }, meta });
    return reply(200, { data: { pets: [{ petId: 'p1', priceVnd: 110000, lines: [] }], subtotalVnd: 110000, totalVnd: 104500, tier: { discountVnd: 5500 } }, meta });
  });
  const api = apiWith(fetchImpl);
  expect((await api.options()).services).toHaveLength(1);
  expect((await api.pets())[0]).toMatchObject({ id: 'p1', name: 'Milo' });
  expect((await api.slots({ date: '2026-11-05', pets: [] })).slots[0].time).toBe('10:00');
  expect((await api.quote({ pets: [] })).totalVnd).toBe(104500);
  expect(calls).toEqual([['GET', '/api/v1/grooming/options'], ['GET', '/api/v1/pet-care/pets'], ['GET', '/api/v1/pet-care/catalog'], ['POST', '/api/v1/grooming/slots'], ['POST', '/api/v1/grooming/quotes']]);
});

const milo = { _id: 'p1', name: 'Milo', species: 'DOG', breedCode: 'dog-corgi', weightKg: 12 };
const corgi = { code: 'dog-corgi', name: 'Corgi', species: 'DOG' };

test('UC-58 loads pets and the breed catalog concurrently and adds the matching breed name', async () => {
  let resolvePets;
  const petResponse = new Promise(resolve => { resolvePets = resolve; });
  const fetchImpl = jest.fn(url => url.endsWith('/pets') ? petResponse : Promise.resolve(reply(200, { data: { breeds: [corgi] }, meta })));
  const result = apiWith(fetchImpl).pets();
  const requestsBeforePetsResolved = fetchImpl.mock.calls.map(([url]) => url);

  resolvePets(reply(200, { data: [milo], meta }));
  await expect(result).resolves.toEqual([{ ...milo, id: 'p1', breedName: 'Corgi' }]);
  expect(requestsBeforePetsResolved).toEqual(['/api/v1/pet-care/pets', '/api/v1/pet-care/catalog']);
});

test.each([
  ['breed code missing', 200, []],
  ['breed belongs to another species', 200, [{ ...corgi, species: 'CAT' }]],
  ['catalog response has the wrong shape', 200, 'invalid'],
  ['catalog request fails', 503, null],
  ['catalog alone responds with 401', 401, null],
])('UC-58 keeps pets usable when %s', async (_label, status, breeds) => {
  const fetchImpl = jest.fn(async url => url.endsWith('/pets')
    ? reply(200, { data: [milo], meta })
    : reply(status, { data: { breeds }, meta }));
  const invalidated = jest.fn();
  window.addEventListener(SESSION_INVALIDATED_EVENT, invalidated);
  try {
    await expect(apiWith(fetchImpl).pets()).resolves.toEqual([{ ...milo, id: 'p1' }]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toContain('/api/v1/pet-care/catalog');
    expect(invalidated).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener(SESSION_INVALIDATED_EVENT, invalidated);
  }
});

test('books with the Idempotency-Key and the CSRF token and returns the appointment', async () => {
  const fetchImpl = jest.fn(async () => reply(201, { data: appointment, meta }));
  const result = await apiWith(fetchImpl).book({ startAt: 'x', pets: [], expectedTotalVnd: 475000 }, 'grooming:key-1');
  expect(result.code).toBe('GR-0001');
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('/api/v1/grooming/appointments');
  expect(init.headers.get('Idempotency-Key')).toBe('grooming:key-1');
  expect(init.headers.get('X-CSRF-Token')).toBe('csrf');
});

test('an error keeps the server sentence and details on the ApiError, per call', async () => {
  const fetchImpl = jest.fn(async () => reply(409, { error: { code: 'GROOMING_PET_ALREADY_BOOKED', message: 'Milo đã có lịch tại cửa hàng vào giờ này. Vui lòng chọn giờ khác.',
    petId: 'p1', petName: 'Milo' }, meta }));
  const failure = await apiWith(fetchImpl).book({}, 'grooming:key-2').catch(error => error);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({ code: 'GROOMING_PET_ALREADY_BOOKED', status: 409, serverMessage: 'Milo đã có lịch tại cửa hàng vào giờ này. Vui lòng chọn giờ khác.',
    details: { petId: 'p1', petName: 'Milo' } });
});

test('an error without a JSON body or message still rejects with its code and no server sentence', async () => {
  const noBody = { status: 502, ok: false, headers: new Headers(), json: async () => { throw new Error('not json'); } };
  const failure = await apiWith(async () => noBody).options().catch(error => error);
  expect(failure).toMatchObject({ code: 'HTTP_ERROR', status: 502 });
  expect(failure.serverMessage).toBeUndefined();
  const noMessage = await apiWith(async () => reply(409, { error: { code: 'GROOMING_SLOT_TAKEN', startAt: 'x' }, meta })).book({}, 'grooming:key-3').catch(error => error);
  expect(noMessage).toMatchObject({ code: 'GROOMING_SLOT_TAKEN', details: { startAt: 'x' } });
  expect(noMessage.serverMessage).toBeUndefined();
});

test('refuses replies that do not have the expected shape', async () => {
  const bad = body => apiWith(async () => reply(200, { data: body, meta }));
  await expect(bad({ services: 'x' }).options()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(bad([{ name: 'no id', species: 'DOG' }]).pets()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(bad({ slots: [{ startAt: 'x', time: '10:00', state: 'OPEN' }] }).slots({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(bad({ pets: [], subtotalVnd: 1.5, totalVnd: 1, tier: { discountVnd: 0 } }).quote({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(bad({ id: 'a', code: 'XX-1' }).book({}, 'grooming:key-4')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('a 202 reply is an uncertain outcome, never a booking', async () => {
  await expect(apiWith(async () => reply(202, { data: null, meta })).book({}, 'grooming:key-5')).rejects.toMatchObject({ code: 'COMMAND_PENDING' });
});
