import { Schema } from 'mongoose';

export function avatarModel(connection) {
  const schema = new Schema({
    _id: { type: String, required: true },
    version: { type: Number, required: true, min: 0 },
    body: { type: Buffer, select: false },
    fingerprint: { type: String, required: true, select: false },
    present: { type: Boolean, required: true }
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  return connection.models.ProfileAvatar ?? connection.model('ProfileAvatar', schema, 'profileavatars');
}
