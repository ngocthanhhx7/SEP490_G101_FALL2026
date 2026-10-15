import { Schema } from 'mongoose';

export function newsletterModel(connection) {
  const schema = new Schema({
    contactLookup: { type: String, required: true, unique: true, select: false },
    contactCiphertext: { type: String, required: true, select: false },
    state: { type: String, enum: ['REQUESTED'], required: true },
    requestedAt: { type: Date, required: true },
    source: { type: String, enum: ['PUBLIC_FOOTER'], required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  return connection.models.NewsletterRequest ?? connection.model('NewsletterRequest', schema);
}
