import { Types } from 'mongoose';
import { privateImageModels } from '../../models/private-image.model.js';

// Evidence references are deterministic so one upload cannot back two requests.
export function createPrivateTransferEvidenceRepository({ connection }) {
  const { PrivateImage } = privateImageModels(connection);
  return Object.freeze({
    async findReady({ evidenceReference, actorId, session }) {
      const match = /^private-image:([a-f0-9]{64})$/.exec(evidenceReference ?? '');
      if (!match || !Types.ObjectId.isValid(actorId) || !session) return null;
      const image = await PrivateImage.findOne({ _id: match[1], ownerId: actorId, state: 'READY' })
        .select('+contentDigest').session(session).lean();
      if (!image || !/^[a-f0-9]{64}$/.test(image.contentDigest ?? '')
        || !Number.isSafeInteger(image.byteLength) || image.byteLength < 1 || image.byteLength > 5 * 1024 * 1024
        || !['image/png', 'image/jpeg'].includes(image.contentType)) return null;
      return { mediaId: image._id, uploadedAt: image.updatedAt };
    }
  });
}
