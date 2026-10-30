import { Schema } from 'mongoose';

function ownedImageModels(connection, imageName, quotaName) {
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
    PrivateImage: connection.models[imageName] ?? connection.model(imageName, imageSchema),
    PrivateImageQuota: connection.models[quotaName] ?? connection.model(quotaName, quotaSchema)
  };
}

export const privateImageModels = connection => ownedImageModels(connection, 'PrivateImage', 'PrivateImageQuota');
export const applicantDocumentModels = connection => ownedImageModels(connection, 'ApplicantDocument', 'ApplicantDocumentQuota');
