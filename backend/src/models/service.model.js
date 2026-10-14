import { Schema } from 'mongoose';

export function serviceModel(connection) {
  const schema = new Schema({
    code: { type: String, required: true, minlength: 2, maxlength: 48, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ code: 1 }, { unique: true });
  return connection.models.Service ?? connection.model('Service', schema);
}
