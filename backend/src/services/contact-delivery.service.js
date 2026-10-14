export function createContactDelivery({ email, sms, fallback } = {}) {
  if (typeof fallback?.send !== 'function'
    || (email !== undefined && typeof email?.send !== 'function')
    || (sms !== undefined && typeof sms?.send !== 'function')) {
    throw new TypeError('Valid contact delivery adapters are required');
  }

  return Object.freeze({
    send(command) {
      if (command?.channel === 'EMAIL' && email) return email.send(command);
      if (command?.channel === 'PHONE' && sms) return sms.send({ ...command, channel: 'SMS' });
      return fallback.send(command);
    }
  });
}
