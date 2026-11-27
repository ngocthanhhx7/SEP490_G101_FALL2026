// The browser origin payOS sends the customer back to (the same BOOKING_WEB_ORIGIN the booking checkout uses).
// Plain https, or http on a local host; no credentials, path, query or fragment.
export function parseWebOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new TypeError('Invalid BOOKING_WEB_ORIGIN');
  }
  return url.origin;
}
