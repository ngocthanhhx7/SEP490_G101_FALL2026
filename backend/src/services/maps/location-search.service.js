import { exact, fail, point } from '../../validators/pet-care.validator.js';
import { readRoutingBody } from '../sitter-matching/routing.service.js';
import { URLSearchParams } from 'node:url';

export function createLocationSearchService({ env = {}, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const kind = env.MAPS_SEARCH_PROVIDER || 'goong';
  if (!['goong', 'google', 'vietmap'].includes(kind)) throw new TypeError('Invalid MAPS_SEARCH_PROVIDER');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) throw new TypeError('Invalid search timeout');
  const key = { goong: env.GOONG_REST_API_KEY, google: env.GOOGLE_MAPS_SERVER_KEY, vietmap: env.VIETMAP_REST_API_KEY }[kind];
  const provider = kind.toUpperCase();
  const label = value => {
    if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error('Invalid address');
    return value;
  };
  const location = (name, lng, lat) => ({ label: label(name), coordinates: point([lng, lat]) });
  async function request(path, params) {
    if (!key?.trim()) fail('MAPS_UNAVAILABLE', 'Address search is not configured', 503);
    const controller = new globalThis.AbortController(); let timer;
    const work = async () => {
      const base = { goong: 'https://rsapi.goong.io', google: 'https://maps.googleapis.com', vietmap: 'https://maps.vietmap.vn' }[kind];
      const url = new URL(path, base);
      url.search = new URLSearchParams({ ...params, [{ goong: 'api_key', google: 'key', vietmap: 'apikey' }[kind]]: key });
      const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new Error('Provider unavailable');
      return readRoutingBody(response, controller.signal);
    };
    try {
      return await Promise.race([work(), new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Search timeout')); }, timeoutMs);
      })]);
    } catch { controller.abort(); fail('MAPS_UNAVAILABLE', 'Address search is temporarily unavailable', 503); }
    finally { clearTimeout(timer); }
  }
  return {
    async search(body) {
      exact(body, ['query'], ['query']);
      if (typeof body.query !== 'string' || body.query.trim().length < 3 || body.query.length > 200)
        fail('VALIDATION_FAILED', 'Address query must contain between 3 and 200 characters');
      const query = body.query.trim();
      const data = await request({ goong: '/geocode', google: '/maps/api/geocode/json', vietmap: '/api/search/v4' }[kind],
        kind === 'vietmap' ? { text: query, display_type: '5' } : { address: query, ...(kind === 'google' ? { language: 'vi', region: 'vn' } : {}) });
      try {
        if (kind === 'vietmap') {
          if (!Array.isArray(data)) throw new Error('Invalid response');
          return { provider, items: data.slice(0, 5).map(row => {
            if (typeof row.ref_id !== 'string' || row.ref_id.length > 2000 || !/^(auto|geocode):\S+$/.test(row.ref_id)) throw new Error('Invalid reference');
            return { label: label(row.display || row.address), provider, refId: row.ref_id };
          }) };
        }
        if (data.status === 'ZERO_RESULTS') return { provider, items: [] };
        if (data.status !== 'OK' || !Array.isArray(data.results)) throw new Error('Invalid response');
        return { provider, items: data.results.slice(0, 5).map(row => location(row.formatted_address, row.geometry?.location?.lng, row.geometry?.location?.lat)) };
      } catch { fail('MAPS_UNAVAILABLE', 'Address search is temporarily unavailable', 503); }
    },
    async resolve(body) {
      exact(body, ['provider', 'refId'], ['provider', 'refId']);
      if (kind !== 'vietmap' || body.provider !== provider || typeof body.refId !== 'string' || body.refId.length > 2000 || !/^(auto|geocode):\S+$/.test(body.refId))
        fail('VALIDATION_FAILED', 'Invalid place reference');
      const data = await request('/api/place/v4', { refid: body.refId });
      try { return { provider, ...location(data.display || data.address, data.lng, data.lat) }; }
      catch { fail('MAPS_UNAVAILABLE', 'Selected address is temporarily unavailable', 503); }
    }
  };
}
