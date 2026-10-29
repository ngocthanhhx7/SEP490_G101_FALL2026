import { createHash } from 'node:crypto';
import { fail, point } from '../../validators/pet-care.validator.js';
export const edgeKey = (a, b) =>
  createHash('sha256')
    .update(JSON.stringify([a, b, 'OSRM_DRIVING_V1']))
    .digest('hex');
export function createRoutingProvider({
  baseUrl,
  fetchImpl = globalThis.fetch,
  clock = Date.now,
  timeoutMs = 8000
}) {
  if (!baseUrl)
    return {
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
    async matrix(points) {
      points.forEach(point);
      if (points.length > 50)
        fail('ROUTING_LIMIT', 'Too many routing coordinates');
      const url = new URL(
        `table/v1/driving/${points.map((x) => x.join(',')).join(';')}?annotations=duration&skip_waypoints=true`,
        base.href.endsWith('/') ? base : base.href + '/'
      );
      const controller = new globalThis.AbortController(),
        timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal,
          redirect: 'error',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok)
          fail('ROUTING_UNAVAILABLE', 'Routing provider unavailable', 503);
        const length = Number(response.headers.get('content-length'));
        if (length > 1000000)
          fail('ROUTING_UNAVAILABLE', 'Routing response too large', 503);
        const body = await response.json();
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
      } catch (error) {
        if (error.code === 'ROUTING_UNAVAILABLE') throw error;
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
