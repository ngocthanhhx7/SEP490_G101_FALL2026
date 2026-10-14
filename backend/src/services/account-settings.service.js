import { Types } from 'mongoose';
import { identityModels } from '../models/identity.model.js';
import { AppError } from '../utils/app-error.js';

function maskContact(channel, value) {
  if (channel === 'EMAIL') {
    const separator = value.lastIndexOf('@');
    const local = value.slice(0, separator);
    const domain = value.slice(separator + 1);
    return `${local[0] ?? ''}${'*'.repeat(Math.max(3, Math.min(8, local.length - 1)))}@${domain}`;
  }
  return `+${'•'.repeat(Math.max(4, value.length - 5))}${value.slice(-4)}`;
}

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
