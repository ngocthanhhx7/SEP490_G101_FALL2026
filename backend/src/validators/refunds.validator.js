export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function hasOnlyKeys(body, allowed, required) {
  return (
    isObject(body) &&
    Object.keys(body).every((key) => allowed.has(key)) &&
    required.every((key) => Object.hasOwn(body, key))
  );
}
