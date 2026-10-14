import { Schema } from 'mongoose';

const sectionSchema = new Schema({
  heading: { type: String, required: true, maxlength: 200 },
  paragraphs: { type: [String], default: undefined },
  items: { type: [String], default: undefined },
}, { _id: false, strict: 'throw' });

export function publicPolicyVersionModel(connection) {
  if (!connection?.models || typeof connection.model !== 'function') throw new TypeError('Database connection is required');
  const schema = new Schema({
    slug: { type: String, enum: ['terms', 'privacy', 'contact-verification', 'service-areas', 'booking', 'payments', 'cancellations-refunds', 'care-evidence', 'safety-complaints', 'sitter-onboarding', 'settlement-and-ratings', 'pwa'], required: true, immutable: true },
    versionId: { type: String, required: true, maxlength: 80, immutable: true },
    status: { type: String, enum: ['DRAFT', 'APPROVED', 'RETIRED'], required: true },
    title: { type: String, required: true, maxlength: 200, immutable: true },
    purpose: { type: String, required: true, maxlength: 500, immutable: true },
    effectiveAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, default: null, immutable: true },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null, maxlength: 120 },
    sourceRef: { type: String, required: true, maxlength: 500, immutable: true },
    contentHash: { type: String, required: true, maxlength: 128, immutable: true },
    sections: { type: [sectionSchema], required: true, immutable: true },
  }, { timestamps: true, versionKey: false, strict: 'throw', bufferCommands: false });
  schema.index({ slug: 1, versionId: 1 }, { unique: true });
  schema.index({ slug: 1, status: 1, effectiveAt: -1 });
  return connection.models.PublicPolicyVersion
    ?? connection.model('PublicPolicyVersion', schema);
}
