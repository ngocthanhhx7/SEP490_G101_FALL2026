import { AppError } from '../utils/app-error.js';

const VERSION = Number.MAX_SAFE_INTEGER;
const USER_ID = /^[a-f\d]{24}$/i;

function actorId(actor) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles)
    || !actor.roles.includes('CUSTOMER') || typeof actor.userId !== 'string' || !USER_ID.test(actor.userId)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  return actor.userId;
}

function maskContact(channel, value) {
  if (channel === 'EMAIL') {
    const [local, ...domainParts] = value.split('@');
    const domain = domainParts.join('@');
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return `••••••••${value.slice(-4)}`;
}

function profileView(user, contacts) {
  return Object.freeze({
    id: user._id.toString(),
    displayName: user.displayName,
    contacts: Object.freeze(contacts.map(contact => Object.freeze({
      channel: contact.channel,
      maskedValue: maskContact(contact.channel, contact.value),
      verifiedAt: contact.verifiedAt.toISOString()
    }))),
    version: user.version,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  });
}

function normalizeDisplayName(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').replace(/[\s\u00a0]+/gu, ' ').trim();
  if (!normalized || normalized.length > 100 || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}

export function createCustomerProfileService({ User, Contact, contactCrypto }) {
  if (typeof User?.findOne !== 'function' || typeof User?.updateOne !== 'function'
    || typeof Contact?.find !== 'function' || typeof contactCrypto?.decrypt !== 'function') {
    throw new TypeError('User, Contact and contact decryption dependencies are required');
  }

  async function loadProfile(userId) {
    const user = await User.findOne({ _id: userId, roles: 'CUSTOMER', state: 'ACTIVE' }).lean();
    if (!user) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Customer profile not found');

    const storedContacts = await Contact.find({ userId: user._id, state: 'VERIFIED' })
      .select('+canonicalCiphertext channel verifiedAt')
      .sort({ channel: 1, _id: 1 }).limit(2).lean();
    const contacts = storedContacts.map(contact => {
      let value;
      try { value = contactCrypto.decrypt(contact.canonicalCiphertext); }
      catch { throw new AppError(503, 'PROFILE_UNAVAILABLE', 'Customer profile is temporarily unavailable'); }
      if (typeof value !== 'string' || !value) {
        throw new AppError(503, 'PROFILE_UNAVAILABLE', 'Customer profile is temporarily unavailable');
      }
      return { channel: contact.channel, value, verifiedAt: contact.verifiedAt };
    });
    return profileView(user, contacts);
  }

  return Object.freeze({
    get: async actor => loadProfile(actorId(actor)),
    update: async (actor, input) => {
      const userId = actorId(actor);
      const allowedKeys = new Set(['displayName', 'expectedVersion']);
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !allowedKeys.has(key))
        || !Object.hasOwn(input, 'displayName') || !Object.hasOwn(input, 'expectedVersion')
        || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
        || input.expectedVersion > VERSION) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Profile update is invalid');
      }
      const displayName = normalizeDisplayName(input.displayName);
      if (!displayName) throw new AppError(422, 'VALIDATION_FAILED', 'Profile update is invalid');

      const current = await User.findOne({ _id: userId, roles: 'CUSTOMER', state: 'ACTIVE' }).lean();
      if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Customer profile not found');
      if (current.version !== input.expectedVersion) {
        throw new AppError(409, 'PROFILE_VERSION_CONFLICT', 'Customer profile has changed');
      }
      if (displayName !== current.displayName) {
        const result = await User.updateOne({
          _id: userId, roles: 'CUSTOMER', state: 'ACTIVE', version: input.expectedVersion
        }, { $set: { displayName }, $inc: { version: 1 } }, { runValidators: true });
        if (result.matchedCount !== 1) {
          const stillOwned = await User.exists({ _id: userId, roles: 'CUSTOMER', state: 'ACTIVE' });
          if (!stillOwned) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Customer profile not found');
          throw new AppError(409, 'PROFILE_VERSION_CONFLICT', 'Customer profile has changed');
        }
      }
      return loadProfile(userId);
    }
  });
}
