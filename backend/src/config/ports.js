import { AppError } from '../utils/app-error.js';

function unavailable() {
  throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Provider is not configured');
}

export function createPorts(overrides = {}) {
  const defaults = {
    session: { authenticate: async () => null },
    contactDelivery: { send: unavailable },
    paymentGateway: { createIntent: unavailable, verifyCallback: unavailable, reconcile: unavailable },
    privateMedia: { upload: unavailable, createReadCapability: unavailable },
    notificationDelivery: { send: unavailable }
  };
  for (const name of Object.keys(overrides)) {
    if (!Object.hasOwn(defaults, name)) throw new TypeError('Unknown provider port');
  }
  return Object.freeze(Object.fromEntries(Object.entries(defaults).map(([name, methods]) => {
    const port = { ...methods, ...overrides[name] };
    for (const method of Object.keys(methods)) if (typeof port[method] !== 'function') throw new TypeError('Invalid provider port');
    return [name, Object.freeze(port)];
  })));
}
