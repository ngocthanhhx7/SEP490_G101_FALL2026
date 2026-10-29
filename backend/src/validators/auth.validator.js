export function hasOnlyKeys(body, keys) {
  return (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body).every((key) => keys.has(key)) &&
    [...keys].every((key) => Object.hasOwn(body, key))
  );
}
