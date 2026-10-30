import { jest, test, expect } from '@jest/globals';
import { createMapRenderService } from '../../src/services/maps/map-render.service.js';
const Response = globalThis.Response;

const key = 'synthetic-tilemap-secret';
const env = { VIETMAP_TILEMAP_KEY: key };
const stylePath = '/maps/styles/tm/style.json';
const style = { version: 8, glyphs: 'https://maps.vietmap.vn/maps/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://maps.vietmap.vn/maps/styles/tm/sprite', sources: { roads: { type: 'vector',
    tiles: ['https://maps.vietmap.vn/maps/tiles/vlc-20261026/{z}/{x}/{y}.pbf?apikey=' + key] } } };
test('rewrites provider resources to authenticated same-origin paths and keeps templates, never keys', async () => {
  const fetchImpl = jest.fn(async () => new Response(JSON.stringify(style)));
  const result = await createMapRenderService({ env, fetchImpl }).resource(stylePath);
  const data = JSON.parse(result.body);
  expect(data.sources.roads.tiles).toEqual(['/api/v1/maps/render/maps/tiles/vlc-20261026/{z}/{x}/{y}.pbf']);
  expect(data.glyphs).toBe('/api/v1/maps/render/maps/fonts/{fontstack}/{range}.pbf');
  expect(result.body.toString()).not.toContain(key);
  expect(fetchImpl.mock.calls[0][0].origin).toBe('https://maps.vietmap.vn');
  expect(fetchImpl.mock.calls[0][0].searchParams.get('apikey')).toBe(key);
});
test.each(['/maps/api/search', '//attacker.test/a', '/maps/styles/tm/../dm/style.json', '/maps/tiles/vlc-20261026/0/0/0.pbf?apikey=x', '/maps/fonts/../0-255.pbf'])('rejects arbitrary resource %s before fetch', async path => {
  const fetchImpl = jest.fn();
  await expect(createMapRenderService({ env, fetchImpl }).resource(path)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('requires credentials, rejects client query injection and redirects, sanitizes provider failures', async () => {
  await expect(createMapRenderService().resource(stylePath)).rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
  await expect(createMapRenderService({ env }).resource(stylePath, { apikey: 'other' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const fetchImpl = jest.fn(async () => { throw new Error(key); });
  await expect(createMapRenderService({ env, fetchImpl }).resource(stylePath)).rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
  expect(fetchImpl.mock.calls[0][1].redirect).toBe('error');
});
test.each([
  { ...style, glyphs: 'https://attacker.test/fonts/{range}.pbf' },
  { ...style, metadata: { credentials: key } }
])('refuses foreign resources or credentials embedded in metadata', async body => {
  await expect(createMapRenderService({ env, fetchImpl: async () => new Response(JSON.stringify(body)) }).resource(stylePath))
    .rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
});
test('bounds body size and elapsed time including streaming body', async () => {
  await expect(createMapRenderService({ env, fetchImpl: async () => new Response('a'.repeat(8 * 1024 * 1024 + 1)) }).resource(stylePath))
    .rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
  await expect(createMapRenderService({ env, timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) }).resource(stylePath))
    .rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
});
test('returns binary PBF and rejects HTML provider errors with HTTP 200', async () => {
  const path = '/maps/tiles/vlc-20261026/12/3252/1801.pbf';
  const service = createMapRenderService({ env, fetchImpl: async () => new Response(new Uint8Array([26, 42]), { headers: { 'content-type': 'application/x-protobuf' } }) });
  expect((await service.resource(path)).type).toBe('application/x-protobuf');
  await expect(createMapRenderService({ env, fetchImpl: async () => new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } }) }).resource(path))
    .rejects.toMatchObject({ code: 'MAPS_UNAVAILABLE' });
});
