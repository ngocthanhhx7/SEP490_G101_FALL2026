import { AppError } from '../utils/app-error.js';
import { isSingleRole } from '../utils/roles.js';
import { ACCOUNT_ROLES } from '../constants/account-roles.js';

const VERSION = Number.MAX_SAFE_INTEGER;
const USER_ID = /^[a-f\d]{24}$/i;
const profileFields = 'displayName version createdAt updatedAt +familyAndMiddleName +givenName +birthDate +gender';

function actorId(actor, role) {
  if (actor?.state !== 'ACTIVE' || !isSingleRole(actor.roles)
    || typeof actor.userId !== 'string' || !USER_ID.test(actor.userId)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!actor.roles.includes(role)) throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
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
    familyAndMiddleName: user.familyAndMiddleName ?? null,
    givenName: user.givenName ?? null,
    birthDate: user.birthDate ?? null,
    gender: user.gender ?? null,
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

const allowedKeys = new Set(['displayName', 'expectedVersion', 'familyAndMiddleName', 'givenName', 'birthDate', 'gender']);
const genders = new Set([null, 'MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']);
const todayInVietnam = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

function invalidProfile() {
  return new AppError(422, 'VALIDATION_FAILED', 'Profile update is invalid');
}

function fieldsFor(input, now) {
  const values = {};
  const structured = Object.hasOwn(input, 'givenName') || Object.hasOwn(input, 'familyAndMiddleName');
  if (structured) {
    if (Object.hasOwn(input, 'displayName')) throw invalidProfile();
    values.familyAndMiddleName = normalizeDisplayName(input.familyAndMiddleName);
    values.givenName = normalizeDisplayName(input.givenName);
    if (!values.familyAndMiddleName || !values.givenName) throw invalidProfile();
    values.displayName = normalizeDisplayName(`${values.familyAndMiddleName} ${values.givenName}`);
    if (!values.displayName) throw invalidProfile();
  } else if (Object.hasOwn(input, 'displayName')) {
    values.displayName = normalizeDisplayName(input.displayName);
    if (!values.displayName) throw invalidProfile();
  }
  if (Object.hasOwn(input, 'birthDate')) {
    const date = input.birthDate;
    if (date !== null) {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000')) throw invalidProfile();
      const parsed = new Date(date);
      if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date || date > todayInVietnam.format(now))
        throw invalidProfile();
    }
    values.birthDate = date;
  }
  if (Object.hasOwn(input, 'gender')) {
    if (!genders.has(input.gender)) throw invalidProfile();
    values.gender = input.gender;
  }
  if (Object.keys(values).length === 0) throw invalidProfile();
  return values;
}

export function createCustomerProfileService({ User, Contact, contactCrypto, role = 'CUSTOMER', clock = Date.now }) {
  if (!ACCOUNT_ROLES.includes(role)) throw new TypeError('Unsupported personal profile role');
  if (typeof User?.findOne !== 'function' || typeof User?.updateOne !== 'function'
    || typeof Contact?.find !== 'function' || typeof contactCrypto?.decrypt !== 'function') {
    throw new TypeError('User, Contact and contact decryption dependencies are required');
  }

  async function loadProfile(userId) {
    const user = await User.findOne({ _id: userId, roles: role, state: 'ACTIVE' }).select(profileFields).lean();
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
    get: async actor => loadProfile(actorId(actor, role)),
    update: async (actor, input) => {
      const userId = actorId(actor, role);
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !allowedKeys.has(key))
        || !Object.hasOwn(input, 'expectedVersion')
        || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
        || input.expectedVersion > VERSION) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Profile update is invalid');
      }
      const values = fieldsFor(input, clock());

      const ownership = { _id: userId, roles: role, state: 'ACTIVE' };
      const current = await User.findOne(ownership).select(profileFields).lean();
      if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Customer profile not found');
      if (current.version !== input.expectedVersion) {
        throw new AppError(409, 'PROFILE_VERSION_CONFLICT', 'Customer profile has changed');
      }
      if (Object.entries(values).some(([key, value]) => value !== (current[key] ?? null))) {
        const result = await User.updateOne({
          ...ownership, version: input.expectedVersion
        }, { $set: values, $inc: { version: 1 } }, { runValidators: true });
        if (result.matchedCount !== 1) {
          const stillOwned = await User.exists(ownership);
          if (!stillOwned) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Customer profile not found');
          throw new AppError(409, 'PROFILE_VERSION_CONFLICT', 'Customer profile has changed');
        }
      }
      return loadProfile(userId);
    }
  });
}
