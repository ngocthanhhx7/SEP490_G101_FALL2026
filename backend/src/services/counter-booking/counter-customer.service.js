import { AppError } from '../../utils/app-error.js';
import { userModel } from '../../models/user.model.js';
import { identityModels } from '../../models/identity.model.js';
import { normalizeCustomerDisplayName } from '../customer-registration.service.js';
import { normalizeVietnamPhone } from '../sms-template.service.js';

const conflict = () => new AppError(409, 'CONTACT_ALREADY_LINKED', 'Phone is already linked to an account');
const invalid = () => new AppError(422, 'VALIDATION_FAILED', 'Invalid counter customer details');
function actorId(actor) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles)
    || typeof actor.userId !== 'string' || !/^[a-f0-9]{24}$/i.test(actor.userId)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!actor.roles.some(role => ['SALE_STAFF', 'ADMIN'].includes(role))) {
    throw new AppError(403, 'FORBIDDEN', 'Counter booking permission required');
  }
  return actor.userId;
}
function phoneValue(phone) {
  const canonical = normalizeVietnamPhone(phone);
  if (!canonical) throw invalid();
  return canonical;
}
const customerView = user => ({ id: String(user._id), displayName: user.displayName });

export function createCounterCustomerService({ connection, contacts, contactCrypto, petCare,
  User = userModel(connection), Contact = identityModels(connection).Contact }) {
  async function requireCustomer(customerId) {
    if (typeof customerId !== 'string' || !/^[a-f0-9]{24}$/i.test(customerId)) throw invalid();
    const user = await User.findOne({ _id: customerId, roles: 'CUSTOMER', state: 'ACTIVE' }).select('displayName').lean();
    if (!user) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Active customer not found');
    return user;
  }
  return Object.freeze({
    async lookup(actor, { phone } = {}) {
      actorId(actor);
      const canonical = phoneValue(phone);
      const ids = await contacts.userIdsByPhone(canonical);
      const { lookupKey } = contactCrypto.lookup('PHONE', canonical);
      const pending = await Contact.find({ channel: 'PHONE', lookupKey, state: 'UNVERIFIED' }).select('userId').lean();
      const ownerIds = [...new Set([...ids, ...pending.map(row => row.userId)].map(String))];
      if (!ownerIds.length) return { customer: null };
      if (ownerIds.length !== 1) throw conflict();
      const user = await User.findOne({ _id: ownerIds[0], roles: 'CUSTOMER', state: 'ACTIVE' }).select('displayName').lean();
      if (!user) throw conflict();
      return { customer: customerView(user) };
    },
    async createCustomer(actor, { displayName, phone } = {}) {
      const createdBy = actorId(actor);
      const name = normalizeCustomerDisplayName(displayName);
      const canonical = phoneValue(phone);
      const { lookupKey } = contactCrypto.lookup('PHONE', canonical);
      if ((await contacts.userIdsByPhone(canonical)).length) throw conflict();
      const session = await connection.startSession();
      try {
        return await session.withTransaction(async () => {
          const existing = await Contact.findOne({ channel: 'PHONE', lookupKey,
            state: { $in: ['VERIFIED', 'UNVERIFIED'] } }).session(session).lean();
          if (existing) throw conflict();
          const [user] = await User.create([{ displayName: name, roles: ['CUSTOMER'], state: 'ACTIVE',
            authEpoch: 0, version: 0, synthetic: false, createdChannel: 'COUNTER', createdBy }], { session });
          await Contact.create([{ userId: user._id, channel: 'PHONE', lookupKey,
            canonicalCiphertext: contactCrypto.encrypt(canonical), state: 'UNVERIFIED' }], { session });
          return { customer: customerView(user) };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) {
        if (error?.code === 11000 && error?.keyPattern?.channel === 1 && error?.keyPattern?.lookupKey === 1) throw conflict();
        throw error;
      } finally { await session.endSession(); }
    },
    async listPets(actor, customerId) {
      actorId(actor);
      await requireCustomer(customerId);
      return petCare.listPets(customerId);
    },
    async createPet(actor, customerId, body, key) {
      actorId(actor);
      await requireCustomer(customerId);
      if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) throw invalid();
      return petCare.createPet(customerId, body, key);
    }
  });
}
