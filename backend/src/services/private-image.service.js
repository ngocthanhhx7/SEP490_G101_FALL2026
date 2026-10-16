import { createHash, createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import sharp from 'sharp';
import { privateImageModels } from '../models/private-image.model.js';
import { MAX_IMAGE_BYTES } from './r2-private-media.service.js';
import { AppError } from '../utils/app-error.js';

const digest = body => createHash('sha256').update(body).digest('hex');
const notFound = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Private image not found');
const invalid = () => new AppError(422, 'VALIDATION_FAILED', 'A valid PNG or JPEG image is required');

export function createPrivateImageService({ connection, media, secret, maxImagesPerUser = 20 }) {
  const { PrivateImage, PrivateImageQuota } = privateImageModels(connection);
  async function upload({ actor, body, contentType, idempotencyKey }) {
    if (!Types.ObjectId.isValid(actor?.userId)) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw invalid();
    if (!Buffer.isBuffer(body) || !body.length || body.length > MAX_IMAGE_BYTES
      || !['image/png', 'image/jpeg'].includes(contentType)) throw invalid();
    const ownerId = new Types.ObjectId(actor.userId);
    const id = createHmac('sha256', secret).update(`private-image-v1\0${ownerId}\0${idempotencyKey}`).digest('hex');
    const inputDigest = digest(Buffer.concat([Buffer.from(`${contentType}\0`), body]));
    const storageRef = `private-images/${id}`;
    let record = await PrivateImage.findById(id).select('+inputDigest').lean();
    if (record && record.inputDigest !== inputDigest) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Upload key was already used');
    if (record?.state === 'READY') return { id, state: 'READY', replayed: true };
    let image;
    try {
      // Decode full pixels and re-encode; signature/MIME checks alone are not validation.
      const decoder = sharp(body, { failOn: 'warning', limitInputPixels: 16000000 });
      const metadata = await decoder.metadata();
      if ((metadata.pages ?? 1) !== 1 || `image/${metadata.format}` !== contentType) throw invalid();
      image = await decoder.rotate().toFormat(metadata.format).timeout({ seconds: 5 }).toBuffer();
      if (!image.length || image.length > MAX_IMAGE_BYTES) throw invalid();
    } catch { throw invalid(); }
    // _id is the native Mongo uniqueness boundary. Reserving a slot and a pending
    // image is atomic; retries retain that slot, including an uncertain R2 result.
    if (!record) {
      for (let attempt = 0; attempt < 3 && !record; attempt += 1) {
        try {
          await connection.transaction(async session => {
            const existing = await PrivateImage.findById(id).select('+inputDigest').session(session).lean();
            if (existing) { record = existing; return; }
            const quota = await PrivateImageQuota.findById(ownerId).session(session).lean();
            if ((quota?.count ?? 0) >= maxImagesPerUser) throw new AppError(429, 'MEDIA_QUOTA_EXCEEDED', 'Private image limit reached');
            if (quota) await PrivateImageQuota.updateOne({ _id: ownerId }, { $inc: { count: 1 } }, { session });
            else await PrivateImageQuota.create([{ _id: ownerId, count: 1 }], { session });
            [record] = await PrivateImage.create([{ _id: id, ownerId, inputDigest, storageRef, state: 'PENDING' }], { session });
          });
        } catch (error) {
          record = await PrivateImage.findById(id).select('+inputDigest').lean();
          if (!record && (error?.code !== 11000 || attempt === 2)) throw error;
        }
      }
    }
    if (!record || record.inputDigest !== inputDigest) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Upload key was already used');
    if (record.state === 'READY') return { id, state: 'READY', replayed: true };
    try { await media.upload({ storageRef, body: image, contentType }); }
    catch { throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private media is unavailable'); }
    await PrivateImage.updateOne({ _id: id, ownerId, inputDigest, state: 'PENDING' },
      { $set: { state: 'READY', contentDigest: digest(image), byteLength: image.length, contentType } });
    return { id, state: 'READY', replayed: false };
  }
  async function read({ actor, id }) {
    if (!/^[a-f0-9]{64}$/.test(id ?? '') || !Types.ObjectId.isValid(actor?.userId)) throw notFound();
    const record = await PrivateImage.findOne({ _id: id, ownerId: actor.userId, state: 'READY' })
      .select('+storageRef +contentDigest').lean();
    if (!record) throw notFound(); // No Admin/Staff ownership bypass.
    let result;
    try { result = await media.read({ storageRef: record.storageRef }); }
    catch { throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private media is unavailable'); }
    if (result.contentType !== record.contentType || result.body.length !== record.byteLength
      || digest(result.body) !== record.contentDigest) {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private media is unavailable');
    }
    return result;
  }
  return Object.freeze({ upload, read });
}
