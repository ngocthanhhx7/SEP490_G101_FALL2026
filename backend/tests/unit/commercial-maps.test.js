import { jest, test, expect } from '@jest/globals';
import { createConfiguredRoutingProvider } from '../../src/services/sitter-matching/commercial-routing.service.js';
import { cachedMatrix, edgeKey } from '../../src/services/sitter-matching/routing.service.js';
import { createLocationSearchService } from '../../src/services/maps/location-search.service.js';

const points = [[105.85, 21.01], [105.86, 21.02]];
const response = data => ({ ok: true, headers: new Map(), json: async () => data });
const matrixBody = { code: 'OK', durations: [[0, 600], [null, 0]] };

test('Vietmap uses lat,lng and asymmetric car durations without persisting provider content', async () => {
  const fetchImpl = jest.fn(async () => response(matrixBody));
  const provider = createConfiguredRoutingProvider({ env: { MAPS_ROUTING_PROVIDER: 'vietmap', VIETMAP_REST_API_KEY: 'synthetic-key' }, fetchImpl });
  const Routing = { find: jest.fn(), bulkWrite: jest.fn() };
  const matrix = await cachedMatrix({ points, provider, Routing });
  const url = fetchImpl.mock.calls[0][0];
  expect(url.origin).toBe('https://maps.vietmap.vn');
  expect(url.searchParams.getAll('point')).toEqual(['21.01,105.85', '21.02,105.86']);
  expect(url.searchParams.get('vehicle')).toBe('car');
  expect(matrix(...points)).toBe(10); expect(matrix(points[1], points[0])).toBeNull();
  expect(provider.edgeKey(...points)).not.toBe(edgeKey(...points));
  expect(Routing.find).not.toHaveBeenCalled(); expect(Routing.bulkWrite).not.toHaveBeenCalled();
});

test('Google Routes handles unordered elements, field mask, omitted zero indexes and independent credentials', async () => {
  const fetchImpl = jest.fn(async () => response([
    { originIndex: 1, destinationIndex: 1, status: {}, condition: 'ROUTE_EXISTS', duration: '0s' },
    { destinationIndex: 1, status: {}, condition: 'ROUTE_EXISTS', duration: '120.5s' },
    { originIndex: 1, status: {}, condition: 'ROUTE_NOT_FOUND' },
    { status: {}, condition: 'ROUTE_EXISTS', duration: '0s' }
  ]));
  const provider = createConfiguredRoutingProvider({ env: { MAPS_ROUTING_PROVIDER: 'google', GOOGLE_MAPS_SERVER_KEY: 'synthetic-key' }, fetchImpl });
  const result = await provider.matrix(points), [url, options] = fetchImpl.mock.calls[0];
  expect(url.origin).toBe('https://routes.googleapis.com');
  expect(options.headers['X-Goog-Api-Key']).toBe('synthetic-key');
  expect(options.headers['X-Goog-FieldMask']).toContain('status');
  expect(JSON.parse(options.body)).toMatchObject({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
  expect(result.map.get(provider.edgeKey(...points))).toBeCloseTo(120.5 / 60);
  expect(result.map.get(provider.edgeKey(points[1], points[0]))).toBeNull();
});

test.each(['google', 'vietmap'])('%s missing credentials, coverage and matrix limits fail before a paid request', async kind => {
  const fetchImpl = jest.fn(), provider = createConfiguredRoutingProvider({ env: { MAPS_ROUTING_PROVIDER: kind }, fetchImpl });
  await expect(provider.matrix(points)).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  await expect(provider.matrix(Array.from({ length: 11 }, () => points[0]))).rejects.toMatchObject({ code: 'ROUTING_LIMIT' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('provider errors cannot expose secret URLs, and invalid durations fail closed', async () => {
  const provider = createConfiguredRoutingProvider({ env: { MAPS_ROUTING_PROVIDER: 'vietmap', VIETMAP_REST_API_KEY: 'secret-value' },
    fetchImpl: async () => { throw new Error('https://example.invalid/?api_key=secret-value'); } });
  await expect(provider.matrix(points)).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE', message: 'Routing provider could not verify this route' });
  const invalid = createConfiguredRoutingProvider({ env: { MAPS_ROUTING_PROVIDER: 'vietmap', VIETMAP_REST_API_KEY: 'synthetic' },
    fetchImpl: async () => response({ code: 'OK', durations: [[-1]] }) });
  await expect(invalid.matrix([points[0]])).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
});

test('commercial routing deadline includes a stalled JSON body', async () => {
  const provider = createConfiguredRoutingProvider({ env: { MAPS_ROUTING_PROVIDER: 'google', GOOGLE_MAPS_SERVER_KEY: 'synthetic' }, timeoutMs: 10,
    fetchImpl: async () => ({ ok: true, headers: new Map(), json: () => new Promise(() => {}) }) });
  await expect(provider.matrix(points)).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
});

test('Google search validates input and returns bounded suggestions without confirming an address', async () => {
  const fetchImpl = jest.fn(async () => response({ status: 'OK', results: [{ formatted_address: 'Synthetic Hanoi address', geometry: { location: { lat: 21.01, lng: 105.85 } } }] }));
  const service = createLocationSearchService({ env: { MAPS_SEARCH_PROVIDER: 'google', GOOGLE_MAPS_SERVER_KEY: 'synthetic' }, fetchImpl });
  await expect(service.search({ query: 'ab' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await expect(service.search({ query: 'Hanoi', url: 'https://example.invalid' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const result = await service.search({ query: 'Hanoi' });
  expect(result).toEqual({ provider: 'GOOGLE', items: [{ label: 'Synthetic Hanoi address', coordinates: points[0] }] });
  expect(fetchImpl.mock.calls[0][0].pathname).toBe('/maps/api/geocode/json');
});

test('Vietmap matrix v4 uses repeated lat,lng points, seconds and separate cache namespace', async () => {
  const fetchImpl = jest.fn(async () => response({ code: 'OK', durations: [[0, 120], [180, 0]] }));
  const provider = createConfiguredRoutingProvider({ env: { MAPS_ROUTING_PROVIDER: 'vietmap', VIETMAP_REST_API_KEY: 'synthetic' }, fetchImpl });
  const result = await provider.matrix(points), url = fetchImpl.mock.calls[0][0];
  expect(url.pathname).toBe('/api/matrix/v4');
  expect(url.searchParams.getAll('point')).toEqual(['21.01,105.85', '21.02,105.86']);
  expect(url.searchParams.get('annotation')).toBe('duration');
  expect(result.map.get(provider.edgeKey(...points))).toBe(2);
  expect(result.map.get(provider.edgeKey(points[1], points[0]))).toBe(3);
  expect(provider.cacheTtlMs).toBe(0); expect(result.source).toBe('VIETMAP_V4_CAR_STATIC_ROAD_ETA');
});

test('Vietmap resolves only the selected prefixed reference and rejects provider mismatch', async () => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(response([{ display: 'Synthetic Hanoi', ref_id: 'geocode:sample' }]))
    .mockResolvedValueOnce(response({ display: 'Synthetic Hanoi', lat: 21.01, lng: 105.85 }));
  const service = createLocationSearchService({ env: { VIETMAP_REST_API_KEY: 'synthetic' }, fetchImpl });
  const result = await service.search({ query: 'Synthetic Hanoi' });
  expect(result.items).toEqual([{ label: 'Synthetic Hanoi', provider: 'VIETMAP', refId: 'geocode:sample' }]);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await expect(service.resolve({ provider: 'GOOGLE', refId: 'geocode:sample' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(await service.resolve({ provider: 'VIETMAP', refId: 'geocode:sample' })).toMatchObject({ coordinates: points[0] });
  expect(fetchImpl.mock.calls[1][0].searchParams.get('refid')).toBe('geocode:sample');
  expect(fetchImpl.mock.calls[1][0].pathname).toBe('/api/place/v4');
});

test('Google geocoding uses independent server API', async () => {
  const fetchImpl = jest.fn(async () => response({ status: 'OK', results: [{ formatted_address: 'Synthetic Hanoi', geometry: { location: { lng: 105.85, lat: 21.01 } } }] }));
  const service = createLocationSearchService({ env: { MAPS_SEARCH_PROVIDER: 'google', GOOGLE_MAPS_SERVER_KEY: 'synthetic' }, fetchImpl });
  expect(await service.search({ query: 'Hanoi' })).toMatchObject({ provider: 'GOOGLE', items: [{ coordinates: points[0] }] });
  expect(fetchImpl.mock.calls[0][0].pathname).toBe('/maps/api/geocode/json');
});

test('malformed Vietmap results and negative durations fail closed', async () => {
  const env = { MAPS_ROUTING_PROVIDER: 'vietmap', MAPS_SEARCH_PROVIDER: 'vietmap', VIETMAP_REST_API_KEY: 'synthetic' };
  const provider = createConfiguredRoutingProvider({ env, fetchImpl: async () => response({ code: 'OK', durations: [[-1]] }) });
  await expect(provider.matrix([points[0]])).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  const service = createLocationSearchService({ env, fetchImpl: async () => response([{ display: 'Synthetic', ref_id: 'missing-prefix' }]) });
  await expect(service.search({ query: 'Hanoi' })).rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
});
