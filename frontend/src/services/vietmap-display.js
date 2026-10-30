export const mapStyleUrl = '/api/v1/maps/render/maps/styles/tm/style.json';

export function mapRequest(url) {
  const parsed = new URL(url, globalThis.location.origin);
  if (parsed.origin !== globalThis.location.origin || !parsed.pathname.startsWith('/api/v1/maps/render/maps/') || parsed.search || parsed.hash) {
    throw new Error('Invalid map resource');
  }
  return { url: parsed.href, credentials: 'same-origin' };
}

export async function loadVietmapStyle() {
  const resource = mapRequest(mapStyleUrl);
  const response = await fetch(resource.url, { credentials: resource.credentials, cache: 'no-store', redirect: 'error', signal: globalThis.AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Map unavailable');
  const style = await response.json();
  // Vietmap GL normalizes sprite URLs before transformRequest, requiring an absolute URL.
  if (typeof style.sprite === 'string') style.sprite = mapRequest(style.sprite).url;
  else if (Array.isArray(style.sprite)) style.sprite = style.sprite.map(item => ({ ...item, url: mapRequest(item.url).url }));
  return style;
}

export async function loadVietmap() {
  const [sdk] = await Promise.all([
    import('@vietmap/vietmap-gl-js/dist/vietmap-gl.js'),
    import('@vietmap/vietmap-gl-js/dist/vietmap-gl.css')
  ]);
  return sdk.default || sdk;
}
