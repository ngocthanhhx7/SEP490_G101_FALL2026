import { Types } from 'mongoose';
import { identityModels } from '../models/identity.model.js';
import { AppError } from '../utils/app-error.js';
import { maskContact } from '../utils/mask-contact.js';

export function createAccountSettingsService({ connection, models = identityModels(connection), contactCrypto } = {}) {
  if (typeof models?.Contact?.find !== 'function' || typeof contactCrypto?.decrypt !== 'function') {
    throw new TypeError('Contact storage and decryption dependencies are required');
  }

  async function listVerifiedContacts(actor) {
    if (!Types.ObjectId.isValid(actor?.userId)) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    const contacts = await models.Contact.find({
      userId: new Types.ObjectId(actor.userId), state: 'VERIFIED'
    }).select('+canonicalCiphertext').lean();

    return Object.freeze(contacts.map(contact => {
      const value = contactCrypto.decrypt(contact.canonicalCiphertext);
      return Object.freeze({
        id: contact._id.toString(),
        channel: contact.channel,
        value: maskContact(contact.channel, value),
        state: 'VERIFIED',
        verifiedAt: new Date(contact.verifiedAt).toISOString()
      });
    }).sort((left, right) => left.channel.localeCompare(right.channel)));
  }

  return Object.freeze({ listVerifiedContacts });
}
