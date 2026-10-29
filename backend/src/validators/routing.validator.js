// Technical dataset coverage, not a declaration of approved service areas.
export function parseRoutingBounds(value) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) {
    throw new TypeError('Invalid routing coverage');
  }
  const bounds = value.split(',').map(Number);
  const [west, south, east, north] = bounds;
  if (!bounds.every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new TypeError('Invalid routing coverage');
  }
  return Object.freeze(bounds);
}
