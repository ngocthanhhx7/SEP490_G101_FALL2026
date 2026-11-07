import { Schema } from 'mongoose';
import { servicePresentationFields } from './service-presentation.model.js';

export function serviceModel(connection) {
  const presentationFields = servicePresentationFields();
  // Operational metadata stays bounded. Oversized legacy records remain in the
  // fallback store until explicitly resolved; migration never truncates them.
  for (const field of ['preparation', 'exclusions', 'faq', 'locations']) {
    presentationFields[field] = { type: presentationFields[field], default: undefined, validate: values => values.length <= 50 };
  }
  const schema = new Schema({
    code: { type: String, required: true, minlength: 2, maxlength: 48, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    presentation: { type: new Schema(presentationFields, { _id: false, versionKey: false, strict: 'throw' }), default: undefined }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ code: 1 }, { unique: true });
  return connection.models.Service ?? connection.model('Service', schema);
}
