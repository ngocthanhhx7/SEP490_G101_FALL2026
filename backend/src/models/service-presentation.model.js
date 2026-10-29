import { Schema } from 'mongoose';
export function servicePresentationModel(connection) {
  const schema = new Schema({
    serviceId: { type: Schema.Types.ObjectId, required: true, unique: true },
    category: { type: String, maxlength: 80 },
    locations: [{ type: String, enum: ['FACILITY', 'HOME', 'OUTDOOR'] }],
    durationMinutes: { type: Number, min: 1, max: 1440, validate: Number.isSafeInteger },
    preparation: [{ type: String, maxlength: 500 }],
    exclusions: [{ type: String, maxlength: 500 }],
    faq: [{ _id: false, question: { type: String, required: true, maxlength: 200 }, answer: { type: String, required: true, maxlength: 1500 } }],
    provisioningRunId: { type: Schema.Types.ObjectId, required: true },
    updatedAt: { type: Date, required: true }
  }, { versionKey: false, strict: 'throw', bufferCommands: false });
  return connection.models.ServicePresentation ?? connection.model('ServicePresentation', schema);
}
