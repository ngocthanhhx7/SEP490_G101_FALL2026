import { createHash } from 'node:crypto';
import { fail, point } from '../../validators/pet-care.validator.js';
import { parseRoutingBounds } from '../../validators/routing.validator.js';

async function readRoutingBody(response, signal) {
  const length = Number(response.headers.get('content-length'));
  if (length > 1000000) fail('ROUTING_UNAVAILABLE', 'Routing response too large', 503);
  // Native fetch supplies a stream; injected unit adapters may expose json only.
  if (!response.body?.getReader) return response.json();
  const reader = response.body.getReader();
  const abort = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('Routing aborted');
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1000000) fail('ROUTING_UNAVAILABLE', 'Routing response too large', 503);
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export const edgeKey = (a, b) =>
  createHash('sha256')
    .update(JSON.stringify([a, b, 'OSRM_DRIVING_V1']))
    .digest('hex');
export function createRoutingProvider({
  baseUrl,
  bounds = null,
  fetchImpl = globalThis.fetch,
  clock = Date.now,
  timeoutMs = 8000
}) {
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) {
    throw new TypeError('Invalid routing dependencies');
  }
  if (bounds !== null && bounds !== undefined) {
    if (!Array.isArray(bounds) || bounds.length !== 4) throw new TypeError('Invalid routing coverage');
    bounds = parseRoutingBounds(bounds.join(','));
  }
  const validatePoints = points => {
    if (!Array.isArray(points) || !points.length || points.length > 50) fail('ROUTING_LIMIT', 'Invalid routing coordinate count');
    points.forEach(point);
    if (bounds && points.some(([lon, lat]) => lon < bounds[0] || lon > bounds[2] || lat < bounds[1] || lat > bounds[3])) {
      fail('ROUTING_UNAVAILABLE', 'Location outside configured routing coverage', 503);
    }
  };
  if (!baseUrl)
    return {
      validatePoints,
      matrix: async () =>
        fail(
          'ROUTING_UNAVAILABLE',
          'Configure AI_ROUTING_URL with a trusted OSRM server',
          503
        )
    };
  const base = new URL(baseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !(
      base.protocol === 'https:' ||
      (base.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(base.hostname))
    )
  )
    throw new TypeError('Routing server must use HTTPS or local HTTP');
  return {
    validatePoints,
    async matrix(points) {
      validatePoints(points);
      const url = new URL(
        `table/v1/driving/${points.map((x) => x.join(',')).join(';')}?annotations=duration&skip_waypoints=true`,
        base.href.endsWith('/') ? base : base.href + '/'
      );
      const controller = new globalThis.AbortController();
      let response;
      let timer;
      const deadline = new Promise((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Routing deadline')); }, timeoutMs);
      });
      const work = async () => {
        response = await fetchImpl(url, {
          signal: controller.signal,
          redirect: 'error',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok)
          fail('ROUTING_UNAVAILABLE', 'Routing provider unavailable', 503);
        const body = await readRoutingBody(response, controller.signal);
        if (
          body.code !== 'Ok' ||
          !Array.isArray(body.durations) ||
          body.durations.length !== points.length ||
          body.fallback_speed_cells?.length
        )
          fail('ROUTING_UNAVAILABLE', 'Routing response invalid', 503);
        const map = new Map();
        body.durations.forEach((row, i) => {
          if (!Array.isArray(row) || row.length !== points.length)
            fail('ROUTING_UNAVAILABLE', 'Routing matrix invalid', 503);
          row.forEach((seconds, j) => {
            if (
              seconds !== null &&
              (typeof seconds !== 'number' ||
                !Number.isFinite(seconds) ||
                seconds < 0 ||
                seconds > 86400)
            )
              fail('ROUTING_UNAVAILABLE', 'Routing duration invalid', 503);
            map.set(
              edgeKey(points[i], points[j]),
              seconds === null ? null : seconds / 60
            );
          });
        });
        return {
          map,
          recordedAt: new Date(clock()),
          source: 'OSRM_STATIC_ROAD_ETA'
        };
      };
      try {
        return await Promise.race([work(), deadline]);
      } catch (error) {
        controller.abort();
        try { response?.body?.cancel?.()?.catch?.(() => {}); } catch { /* locked/already cancelled */ }
        if (error?.code === 'ROUTING_UNAVAILABLE') throw error;
        fail('ROUTING_UNAVAILABLE', 'Routing calculation failed', 503);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
export async function cachedMatrix({
  points,
  Routing,
  provider,
  clock = Date.now
}) {
  const unique = [
    ...new Map(
      points.map((p) => {
        point(p);
        return [JSON.stringify(p), p];
      })
    ).values()
  ];
  if (unique.length > 50) fail('ROUTING_LIMIT', 'Daily route too large', 409);
  provider.validatePoints?.(unique); // Cached rows cannot bypass the deployed dataset boundary.
  const keys = unique.flatMap((a) => unique.map((b) => edgeKey(a, b)));
  const rows = await Routing.find({
    key: { $in: keys },
    expiresAt: { $gt: new Date(clock()) }
  }).lean();
  const map = new Map(rows.map((r) => [r.key, r.minutes]));
  if (map.size !== keys.length) {
    const result = await provider.matrix(unique);
    const ops = [];
    for (const [key, minutes] of result.map) {
      map.set(key, minutes);
      if (minutes !== null)
        ops.push({
          updateOne: {
            filter: { key },
            update: {
              $set: {
                minutes,
                source: result.source,
                recordedAt: result.recordedAt,
                expiresAt: new Date(clock() + 15 * 60000)
              }
            },
            upsert: true
          }
        });
    }
    if (ops.length) await Routing.bulkWrite(ops, { ordered: false });
  }
  return (a, b) => map.get(edgeKey(a, b)) ?? null;
}
