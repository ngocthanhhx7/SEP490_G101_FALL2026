import { AppError } from '../../utils/app-error.js';

const origin = 'https://maps.vietmap.vn';
const mount = '/api/v1/maps/render';
const unavailable = () => new AppError(503, 'MAPS_UNAVAILABLE', 'Map display is temporarily unavailable');
const allowed = path => !/[\\%\u0000-\u001f]/.test(path) && !path.split('/').some(part => part === '.' || part === '..') &&
  /^\/maps\/(?:styles\/tm\/(?:style\.json|sprite(?:@2x)?\.(?:json|png))|fonts\/[^/]{1,300}\/(?:\d+-\d+|\{range\})\.pbf|tiles\/vlc-\d{8}\/(?:\d{1,2}|\{z\})\/(?:\d{1,9}|\{x\})\/(?:\d{1,9}|\{y\})\.pbf)$/.test(path);

export function createMapRenderService({ env = {}, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const key = env.VIETMAP_TILEMAP_KEY?.trim();
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) throw new TypeError('Invalid map timeout');
  function rewrite(value) {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, rewrite(item)]));
    if (typeof value !== 'string') return value;
    if (/^https?:|^\/\//i.test(value)) {
      const url = new URL(value);
      if (value === 'https://vietmap.vn') return value;
      const path = decodeURIComponent(url.pathname);
      // The SDK adds sprite extensions itself.
      if (url.origin !== origin || (!allowed(path) && path !== '/maps/styles/tm/sprite')) throw unavailable();
      return mount + path;
    }
    if (value.includes(key)) throw unavailable();
    return value;
  }
  return {
    async resource(path, query = {}) {
      if (typeof path !== 'string' || !allowed(path) || Object.keys(query).length) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid map resource');
      if (!key) throw unavailable();
      const controller = new globalThis.AbortController();
      let timer;
      try {
        return await Promise.race([(async () => {
          const url = new URL(path, origin); url.searchParams.set('apikey', key);
          const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
          if (!response.ok || !response.body) throw unavailable();
          const chunks = []; let size = 0;
          for await (const chunk of response.body) {
            size += chunk.length;
            if (size > 8 * 1024 * 1024) { controller.abort(); throw unavailable(); }
            chunks.push(chunk);
          }
          const bytes = Buffer.concat(chunks);
          if (path.endsWith('.json')) {
            const body = Buffer.from(JSON.stringify(rewrite(JSON.parse(bytes.toString('utf8')))));
            if (body.includes(Buffer.from(key))) throw unavailable();
            return { body, type: 'application/json' };
          }
          if (path.endsWith('.png')) {
            if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw unavailable();
            return { body: bytes, type: 'image/png' };
          }
          if (bytes.includes(Buffer.from(key)) || /json|html/i.test(response.headers.get('content-type') || '')) throw unavailable();
          return { body: bytes, type: 'application/x-protobuf' };
        })(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs); })]);
      } catch { controller.abort(); throw unavailable(); }
      finally { clearTimeout(timer); }
    }
  };
}
