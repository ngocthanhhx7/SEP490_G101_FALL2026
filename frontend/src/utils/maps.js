export function googleMapsDirections(address) {
  if (typeof address !== 'string' || !address.trim()) return null;
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', address);
  return url.href;
}
