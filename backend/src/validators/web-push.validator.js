import { AppError } from '../utils/app-error.js';

export function isPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash
      && url.pathname.length > 1 && (host === 'fcm.googleapis.com'
        || host.endsWith('.push.apple.com') || host === 'push.apple.com'
        || host === 'updates.push.services.mozilla.com' || host === 'push.services.mozilla.com'
        || host.endsWith('.notify.windows.com'));
  } catch { return false; }
}

export function isBase64url(value, bytes) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)
    && value.length === Math.ceil(bytes * 4 / 3)
    && Buffer.from(value, 'base64url').toString('base64url') === value;
}

export function validateWebPushSubscription(subscription) {
  if (!isPushEndpoint(subscription?.endpoint) || !isBase64url(subscription?.keys?.auth, 16)
    || !isBase64url(subscription?.keys?.p256dh, 65)
    || Buffer.from(subscription.keys.p256dh, 'base64url')[0] !== 4) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Invalid Web Push subscription');
  }
  return { endpoint: new URL(subscription.endpoint).href,
    keys: { auth: subscription.keys.auth, p256dh: subscription.keys.p256dh } };
}
