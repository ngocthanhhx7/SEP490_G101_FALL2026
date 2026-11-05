import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import sharp from 'sharp';
import { avatarModel } from '../models/avatar.model.js';
import { userModel } from '../models/user.model.js';
import { petCareModels } from '../models/pet-care.model.js';
import { AppError } from '../utils/app-error.js';

const invalid = () => new AppError(422, 'VALIDATION_FAILED', 'Choose a PNG or JPEG up to 5 MB and 4 megapixels');
const missing = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Avatar not found');
const conflict = () => new AppError(409, 'AVATAR_VERSION_CONFLICT', 'Avatar changed; reload before editing');
export function createAvatarService({ connection }) {
  const Avatar = avatarModel(connection), User = userModel(connection), { Pet } = petCareModels(connection);
  async function scope(actor, petId, session, write = false) {
    if (!Types.ObjectId.isValid(actor?.userId) || actor.state !== 'ACTIVE') throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    if (petId && !Types.ObjectId.isValid(petId)) throw missing();
    const user = { _id: actor.userId, state: 'ACTIVE' };
    if (petId) user.roles = 'CUSTOMER';
    const check = async (Model, query) => write
      ? Model.findOneAndUpdate(query, { $inc: { version: 1 } }, { session, returnDocument: 'after' })
      : Model.findOne(query).session(session ?? null).lean();
    if (!await check(User, user)) throw missing();
    if (petId && !await check(Pet, { _id: petId, ownerId: actor.userId, ...(write ? { state: 'ACTIVE' } : {}) })) throw missing();
    return petId ? `pet:${petId}` : `user:${actor.userId}`;
  }
  async function get({ actor, petId, content = false }) {
    const id = await scope(actor, petId);
    const row = await Avatar.findById(id).select(content ? '+body' : '').lean();
    if (content) {
      if (!row?.present || !row.body?.length) throw missing();
      return Buffer.isBuffer(row.body) ? row.body : Buffer.from(row.body.buffer);
    }
    return { version: row?.version ?? 0, present: row?.present ?? false };
  }
  async function change({ actor, petId, body, contentType, expectedVersion, idempotencyKey, remove = false }) {
    const resource = await scope(actor, petId);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER
      || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey ?? '')) throw invalid();
    if (!remove && (!Buffer.isBuffer(body) || !body.length || body.length > 5 * 1024 * 1024
      || !['image/jpeg', 'image/png'].includes(contentType))) throw invalid();
    const fingerprint = createHash('sha256').update(JSON.stringify([resource, expectedVersion, idempotencyKey, remove, contentType ?? null]))
      .update(remove ? '' : body).digest('hex');
    const prior = await Avatar.findById(resource).select('+fingerprint').lean();
    if (prior?.fingerprint === fingerprint) return { version: prior.version, present: prior.present, replayed: true };
    if ((prior?.version ?? 0) !== expectedVersion) throw conflict();
    let normalized;
    if (!remove) {
      try {
        const decoder = sharp(body, { failOn: 'warning', limitInputPixels: 4_000_000 });
        const meta = await decoder.metadata();
        if ((meta.pages ?? 1) !== 1 || `image/${meta.format}` !== contentType) throw invalid();
        normalized = await decoder.rotate().resize(512, 512, { fit: 'cover', withoutEnlargement: true })
          .flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).timeout({ seconds: 5 }).toBuffer();
        if (!normalized.length || normalized.length > 512 * 1024) throw invalid();
      } catch { throw invalid(); }
    }
    for (let attempt = 0; ; attempt++) {
      try {
        return await connection.transaction(async session => {
          const current = await Avatar.findById(resource).select('+fingerprint').session(session).lean();
          if (current?.fingerprint === fingerprint) return { version: current.version, present: current.present, replayed: true };
          if ((current?.version ?? 0) !== expectedVersion) throw conflict();
          await scope(actor, petId, session, true);
          const values = { version: expectedVersion + 1, present: !remove, fingerprint };
          if (current) await Avatar.updateOne({ _id: resource, version: expectedVersion },
            { $set: { ...values, ...(remove ? {} : { body: normalized }) }, ...(remove ? { $unset: { body: 1 } } : {}) }, { session });
          else await Avatar.create([{ _id: resource, ...values, ...(remove ? {} : { body: normalized }) }], { session });
          return { version: values.version, present: values.present, replayed: false };
        });
      } catch (error) { if (error.code !== 11000 || attempt >= 2) throw error; }
    }
  }
  return Object.freeze({ get, change });
}
