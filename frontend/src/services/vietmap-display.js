export const mapStyleUrl = '/api/v1/maps/render/maps/styles/tm/style.json';

export function mapRequest(url) {
  const parsed = new URL(url, globalThis.location.origin);
  if (parsed.origin !== globalThis.location.origin || !parsed.pathname.startsWith('/api/v1/maps/render/maps/') || parsed.search || parsed.hash) {
    throw new Error('Invalid map resource');
  }
  return { url: parsed.href, credentials: 'same-origin' };
}

export async function loadVietmap() {
  const [sdk] = await Promise.all([
    import('@vietmap/vietmap-gl-js/dist/vietmap-gl.js'),
    import('@vietmap/vietmap-gl-js/dist/vietmap-gl.css')
  ]);
  return sdk.default || sdk;
}
