import { fail } from '../../validators/pet-care.validator.js';
import { URLSearchParams } from 'node:url';
import { createRoutingProvider, edgeKey, readRoutingBody } from './routing.service.js';

export function createConfiguredRoutingProvider({ env = {}, config = {}, clock = Date.now, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const kind = env.MAPS_ROUTING_PROVIDER || 'osrm';
  if (!['osrm', 'goong', 'google', 'vietmap'].includes(kind)) throw new TypeError('Invalid MAPS_ROUTING_PROVIDER');
  if (kind === 'osrm') return createRoutingProvider({ baseUrl: config.ai?.routingUrl, bounds: config.ai?.routingBounds, clock, fetchImpl, timeoutMs });
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) throw new TypeError('Invalid routing timeout');
  const key = { goong: env.GOONG_REST_API_KEY, google: env.GOOGLE_MAPS_SERVER_KEY, vietmap: env.VIETMAP_REST_API_KEY }[kind];
  const source = { goong: 'GOONG_CAR_STATIC_ROAD_ETA', google: 'GOOGLE_DRIVE_STATIC_ROAD_ETA', vietmap: 'VIETMAP_V4_CAR_STATIC_ROAD_ETA' }[kind];
  const keyFor = (a, b) => edgeKey(a, b, `${source}_V1`);
  const coverage = createRoutingProvider({ bounds: config.ai?.routingBounds });
  const validatePoints = points => {
    coverage.validatePoints(points);
    // Bound billable matrix elements, independently of each provider's larger quota.
    if (points.length > 10) fail('ROUTING_LIMIT', 'Commercial routing is limited to 100 elements', 409);
  };
  return { source, edgeKey: keyFor, cacheTtlMs: 0, validatePoints,
    async matrix(points) {
      validatePoints(points);
      if (typeof key !== 'string' || !key.trim()) fail('ROUTING_UNAVAILABLE', 'Routing credentials are not configured', 503);
      const controller = new globalThis.AbortController();
      let timer;
      const request = async () => {
        let url, options;
        if (kind === 'goong') {
          url = new URL('https://rsapi.goong.io/distancematrix');
          const locations = points.map(([lng, lat]) => `${lat},${lng}`).join('|');
          url.search = new URLSearchParams({ origins: locations, destinations: locations, vehicle: 'car', api_key: key });
          options = {};
        } else if (kind === 'vietmap') {
          url = new URL('https://maps.vietmap.vn/api/matrix/v4');
          url.search = new URLSearchParams({ apikey: key, vehicle: 'car', sources: 'all', destinations: 'all', annotation: 'duration' });
          points.forEach(([lng, lat]) => url.searchParams.append('point', `${lat},${lng}`));
          options = {};
        } else {
          url = new URL('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix');
          const locations = points.map(([longitude, latitude]) => ({ waypoint: { location: { latLng: { latitude, longitude } } } }));
          options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,duration' },
          body: JSON.stringify({ origins: locations, destinations: locations, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }) };
        }
        const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'error' });
        if (!response.ok) throw new Error('Provider unavailable');
        const body = await readRoutingBody(response, controller.signal), map = new Map();
        const put = (i, j, seconds) => {
          if (seconds !== null && (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > 86400)) throw new Error('Invalid duration');
          map.set(keyFor(points[i], points[j]), seconds === null ? null : seconds / 60);
        };
        if (kind === 'goong') {
          if ((body.status !== undefined && body.status !== 'OK') || body.error || body.rows?.length !== points.length) throw new Error('Invalid matrix');
          body.rows.forEach((row, i) => {
            if (row.elements?.length !== points.length) throw new Error('Invalid matrix row');
            row.elements.forEach((entry, j) => {
              if (!['OK', 'ZERO_RESULTS'].includes(entry.status)) throw new Error('Invalid matrix element');
              put(i, j, entry.status === 'OK' ? entry.duration?.value : null);
            });
          });
        } else if (kind === 'vietmap') {
          if (body.code !== 'OK' || !Array.isArray(body.durations) || body.durations.length !== points.length) throw new Error('Invalid matrix');
          body.durations.forEach((row, i) => {
            if (!Array.isArray(row) || row.length !== points.length) throw new Error('Invalid matrix row');
            row.forEach((seconds, j) => put(i, j, seconds));
          });
        } else {
          if (!Array.isArray(body) || body.length !== points.length ** 2) throw new Error('Invalid matrix');
          for (const entry of body) {
            const i = entry.originIndex ?? 0, j = entry.destinationIndex ?? 0;
            if (![i, j].every(index => Number.isInteger(index) && index >= 0 && index < points.length) || map.has(keyFor(points[i], points[j])) || entry.status?.code) throw new Error('Invalid matrix index/status');
            if (!['ROUTE_EXISTS', 'ROUTE_NOT_FOUND'].includes(entry.condition)) throw new Error('Invalid route condition');
            if (entry.condition === 'ROUTE_EXISTS' && !/^\d+(\.\d+)?s$/.test(entry.duration)) throw new Error('Invalid route duration');
            put(i, j, entry.condition === 'ROUTE_NOT_FOUND' ? null : Number(entry.duration.slice(0, -1)));
          }
        }
        return { map, recordedAt: new Date(clock()), source };
      };
      try {
        return await Promise.race([request(), new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Routing timeout')); }, timeoutMs);
        })]);
      } catch {
        controller.abort();
        // Provider URLs and error bodies may contain API keys or private coordinates.
        fail('ROUTING_UNAVAILABLE', 'Routing provider could not verify this route', 503);
      } finally { clearTimeout(timer); }
    }
  };
}
