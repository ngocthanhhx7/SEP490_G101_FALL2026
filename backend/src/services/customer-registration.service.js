import { AppError } from '../utils/app-error.js';
import { identityModels } from '../models/identity.model.js';
import { userModel as createUserModel } from '../models/user.model.js';

export function normalizeCustomerDisplayName(value) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Registration details are invalid');
  }
  const displayName = value.trim().replace(/\s+/gu, ' ');
  if (!displayName || displayName.length > 100) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Registration details are invalid');
  }
  return displayName;
}

function isContactUniqueConflict(error) {
  return error?.code === 11000 && error?.keyPattern?.channel === 1 && error?.keyPattern?.lookupKey === 1;
}

export function createCustomerRegistrationHandler({ connection, User, models = identityModels(connection),
  sessionService, contactCrypto, registrationPolicyService, clock = Date.now } = {}) {
  const userStore = User ?? createUserModel(connection);
  if (typeof sessionService?.issueInTransaction !== 'function'
    || typeof contactCrypto?.encrypt !== 'function' || typeof registrationPolicyService?.validateAndBuildReceipt !== 'function' || typeof clock !== 'function'
    || typeof models?.Contact?.findOne !== 'function') {
    throw new TypeError('Customer registration dependencies are required');
  }

  return async function registerVerifiedCustomer({ channel, canonicalValue, contactLookup, displayName, policyVersions, session: mongoSession, now = clock() } = {}) {
    const normalizedName = normalizeCustomerDisplayName(displayName);
    if (!['EMAIL', 'PHONE'].includes(channel) || typeof canonicalValue !== 'string' || !canonicalValue
      || typeof contactLookup !== 'string' || !contactLookup || !mongoSession) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Registration details are invalid');
    }

    const policyConsents = await registrationPolicyService.validateAndBuildReceipt({ policyVersions, session: mongoSession, now });
    const existing = await models.Contact.findOne({ channel, lookupKey: contactLookup, state: 'VERIFIED' })
      .session(mongoSession).lean();
    if (existing) {
      throw new AppError(409, 'CONTACT_ALREADY_LINKED', 'Contact verification could not be completed');
    }

    let user;
    try {
      [user] = await userStore.create([{
        displayName: normalizedName,
        roles: ['CUSTOMER'],
        state: 'ACTIVE',
        authEpoch: 0,
        version: 0,
        synthetic: false,
        policyConsents,
      }], { session: mongoSession });
      await models.Contact.create([{
        userId: user._id,
        channel,
        canonicalCiphertext: contactCrypto.encrypt(canonicalValue),
        lookupKey: contactLookup,
        state: 'VERIFIED',
        verifiedAt: new Date(now),
      }], { session: mongoSession });
      const issuedSession = await sessionService.issueInTransaction(user, mongoSession);
      return Object.freeze({ session: issuedSession });
    } catch (error) {
      if (isContactUniqueConflict(error)) {
        throw new AppError(409, 'CONTACT_ALREADY_LINKED', 'Contact verification could not be completed');
      }
      throw error;
    }
  };
}
