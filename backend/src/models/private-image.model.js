import { Schema } from 'mongoose';

export function privateImageModels(connection) {
  const imageSchema = new Schema({
    _id: { type: String }, ownerId: { type: Schema.Types.ObjectId, required: true },
    inputDigest: { type: String, required: true, select: false },
    storageRef: { type: String, required: true, select: false },
    contentType: { type: String, enum: ['image/png', 'image/jpeg'] },
    contentDigest: { type: String, select: false }, byteLength: Number,
    state: { type: String, enum: ['PENDING', 'READY'], required: true }
  }, { timestamps: true, strict: 'throw', autoIndex: false });
  const quotaSchema = new Schema({ _id: { type: Schema.Types.ObjectId },
    count: { type: Number, required: true, min: 0 } }, { strict: 'throw', autoIndex: false });
  return {
    PrivateImage: connection.models.PrivateImage ?? connection.model('PrivateImage', imageSchema),
    PrivateImageQuota: connection.models.PrivateImageQuota ?? connection.model('PrivateImageQuota', quotaSchema)
  };
}
