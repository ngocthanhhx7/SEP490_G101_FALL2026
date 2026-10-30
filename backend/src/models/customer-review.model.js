import { Schema } from 'mongoose';
export function customerReviewModels(connection) {
  const options = { strict: 'throw', versionKey: false, bufferCommands: false };
  const review = new Schema({ _id: String, visitId: String, customerId: String, sitterId: String,
    direction: { type: String, enum: ['CUSTOMER_TO_SITTER'] }, rating: { type: Number, min: 1, max: 5, validate: Number.isInteger },
    comment: { type: String, select: false }, tags: [String], state: String, visibility: String, version: Number,
    createdAt: Date, updatedAt: Date, verifiedSource: Schema.Types.Mixed }, options);
  review.index({ visitId: 1, direction: 1 }, { unique: true });
  const command = new Schema({ _id: String, payloadHash: String, result: Schema.Types.Mixed }, options);
  return {
    CustomerVisitReview: connection.models.CustomerVisitReview ?? connection.model('CustomerVisitReview', review, 'reviews'),
    CustomerReviewCommand: connection.models.CustomerReviewCommand ?? connection.model('CustomerReviewCommand', command)
  };
}
