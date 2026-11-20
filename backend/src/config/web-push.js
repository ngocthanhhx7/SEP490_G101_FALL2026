import { createECDH, timingSafeEqual } from 'node:crypto';
import { isMailbox } from '../utils/mailbox.js';
import { isBase64url } from '../validators/web-push.validator.js';

export function webPushConfig(env, authEnabled, invalid) {
  const enabled = env.WEB_PUSH_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled)) invalid.push('WEB_PUSH_ENABLED');
  if (enabled !== 'true') return null;
  if (!authEnabled) invalid.push('AUTH_ENABLED');
  const { WEB_PUSH_PUBLIC_KEY: publicKey, WEB_PUSH_PRIVATE_KEY: privateKey, WEB_PUSH_CONTACT: contact } = env;
  if (!isBase64url(publicKey, 65)) invalid.push('WEB_PUSH_PUBLIC_KEY');
  if (!isBase64url(privateKey, 32)) invalid.push('WEB_PUSH_PRIVATE_KEY');
  if (typeof contact !== 'string' || !contact.startsWith('mailto:') || !isMailbox(contact.slice(7)))
    invalid.push('WEB_PUSH_CONTACT');
  if (isBase64url(publicKey, 65) && isBase64url(privateKey, 32)) {
    try {
      const keys = createECDH('prime256v1');
      keys.setPrivateKey(Buffer.from(privateKey, 'base64url'));
      if (!timingSafeEqual(keys.getPublicKey(), Buffer.from(publicKey, 'base64url'))) invalid.push('WEB_PUSH_PUBLIC_KEY');
    } catch { invalid.push('WEB_PUSH_PRIVATE_KEY'); }
  }
  return Object.freeze({ publicKey, privateKey, contact });
}
