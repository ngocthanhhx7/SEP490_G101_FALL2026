import { expect, jest, test } from '@jest/globals';
import { loadConfig } from '../../src/config/environment.js';
import { parseRoutingBounds } from '../../src/validators/routing.validator.js';
import { cachedMatrix, createRoutingProvider } from '../../src/services/sitter-matching/routing.service.js';
const points = [[105.8, 21], [105.82, 21.03]];
const bounds = [105.15, 20.45, 106.15, 21.55];
test.each(['1,2,3', 'x,20,106,21', '106,20,105,21', '105,22,106,21', '-181,20,106,21', '105,-91,106,21'])('rejects malformed coverage %s', value => {
  expect(() => parseRoutingBounds(value)).toThrow();
  expect(() => loadConfig({ NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27018', MONGO_DB: 'test_routing', AI_ROUTING_BOUNDS: value })).toThrow(expect.objectContaining({ fields: ['AI_ROUTING_BOUNDS'] }));
});
test('configured coverage is immutable and enforced before provider calls or cached results', async () => {
  expect(parseRoutingBounds('105.15,20.45,106.15,21.55')).toEqual(bounds);
  const fetchImpl = jest.fn();
  const provider = createRoutingProvider({ baseUrl: 'http://127.0.0.1:5000', bounds, fetchImpl });
  await expect(provider.matrix([[106.7, 10.8]])).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  const Routing = { find: jest.fn() };
  await expect(cachedMatrix({ points: [[106.7, 10.8]], Routing, provider })).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  expect(fetchImpl).not.toHaveBeenCalled(); expect(Routing.find).not.toHaveBeenCalled();
});
test('hard deadline covers body parsing even when an injected transport ignores abort', async () => {
  const provider = createRoutingProvider({ baseUrl: 'http://127.0.0.1:5000', timeoutMs: 20,
    fetchImpl: async () => ({ ok: true, headers: { get: () => null }, json: () => new Promise(() => {}) }) });
  await expect(provider.matrix(points)).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
});
test('an unknown-length response is capped and its stream cancelled', async () => {
  let cancelled = false;
  const provider = createRoutingProvider({ baseUrl: 'http://127.0.0.1:5000',
    fetchImpl: async () => new globalThis.Response(new globalThis.ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(1000001)); }, cancel() { cancelled = true; }
    })) });
  await expect(provider.matrix(points)).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  expect(cancelled).toBe(true);
});
test('a stalled native response body is cancelled at the deadline', async () => {
  let cancelled = false;
  const provider = createRoutingProvider({ baseUrl: 'http://127.0.0.1:5000', timeoutMs: 20,
    fetchImpl: async () => new globalThis.Response(new globalThis.ReadableStream({ cancel() { cancelled = true; } })) });
  await expect(provider.matrix(points)).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  expect(cancelled).toBe(true);
});
test('native OSRM response parsing retains asymmetric durations and unreachable routes', async () => {
  const provider = createRoutingProvider({ baseUrl: 'http://127.0.0.1:5000', bounds,
    fetchImpl: async () => globalThis.Response.json({ code: 'Ok', durations: [[0, 90], [null, 0]] }) });
  const result = await provider.matrix(points);
  expect([...result.map.values()]).toEqual([0, 1.5, null, 0]);
});
test.each([{ status: 503 }, { status: 200, headers: { 'Content-Length': '1000001' } }])('cancels undrained early error responses %j', async options => {
  let cancelled = false;
  const provider = createRoutingProvider({ baseUrl: 'http://127.0.0.1:5000',
    fetchImpl: async () => new globalThis.Response(new globalThis.ReadableStream({ cancel() { cancelled = true; } }), options) });
  await expect(provider.matrix(points)).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  expect(cancelled).toBe(true);
});
