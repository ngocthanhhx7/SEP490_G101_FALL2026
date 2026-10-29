import { fail, point } from '../../validators/pet-care.validator.js';
import { URLSearchParams } from 'node:url';
import { readRoutingBody } from '../sitter-matching/routing.service.js';

export function createLocationSearchService({ env = {}, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  return {
    async search(body) {
      if (!body || Object.keys(body).some(key => key !== 'query') || typeof body.query !== 'string' || body.query.trim().length < 3 || body.query.length > 200)
        fail('VALIDATION_FAILED', 'Address query must contain between 3 and 200 characters');
      if (!env.GOONG_REST_API_KEY) fail('MAPS_UNAVAILABLE', 'Address search is not configured', 503);
      const controller = new globalThis.AbortController();
      let timer;
      const work = async () => {
        const url = new URL('https://rsapi.goong.io/Geocode');
        url.search = new URLSearchParams({ address: body.query.trim(), api_key: env.GOONG_REST_API_KEY });
        const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
        if (!response.ok) throw new Error('Provider unavailable');
        const data = await readRoutingBody(response, controller.signal);
        if (data.status === 'ZERO_RESULTS') return { provider: 'GOONG', items: [] };
        if (data.status !== 'OK' || !Array.isArray(data.results)) throw new Error('Invalid response');
        return { provider: 'GOONG', items: data.results.slice(0, 5).map(row => {
          const coordinates = [row.geometry?.location?.lng, row.geometry?.location?.lat]; point(coordinates);
          if (typeof row.formatted_address !== 'string' || row.formatted_address.length > 500) throw new Error('Invalid address');
          return { label: row.formatted_address, coordinates };
        }) };
      };
      try {
        return await Promise.race([work(), new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Search timeout')); }, timeoutMs);
        })]);
      } catch {
        controller.abort(); fail('MAPS_UNAVAILABLE', 'Address search is temporarily unavailable', 503);
      } finally { clearTimeout(timer); }
    }
  };
}
