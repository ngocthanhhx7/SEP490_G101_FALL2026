import mongoose from 'mongoose';

const { Schema } = mongoose;

const encryptedValueSchema = new Schema({
  algorithm: { type: String, enum: ['AES-256-GCM'], required: true },
  keyVersion: { type: Number, required: true, default: 1 },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  ciphertext: { type: String, required: true },
}, { _id: false });

const applicationSchema = new Schema({
  fullName: { type: String, required: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, maxlength: 254 },
  phone: { type: String, required: true, match: /^\+84\d{9}$/ },
  age: { type: Number, required: true, min: 18, max: 100 },
  gender: { type: String, enum: ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'], required: true },
  location: { type: String, required: true, minlength: 3, maxlength: 200 },
  experience: { type: String, enum: ['UNDER_ONE', 'ONE_TO_THREE', 'OVER_THREE'], required: true },
  acceptedSpecies: { type: [String], enum: ['DOG', 'CAT'], required: true, validate: (items) => items.length > 0 },
  bio: { type: String, required: true, minlength: 20, maxlength: 1000 },
  nationalIdEncrypted: { type: encryptedValueSchema, required: true, select: false },
  documents: {
    portrait: { type: String, required: true },
    nationalIdFront: { type: String, required: true },
    nationalIdBack: { type: String, required: true },
    certificates: { type: [String], default: [] },
  },
  documentMediaTypes: {
    portrait: { type: String, enum: ['image/jpeg', 'image/png'], required: true },
    nationalIdFront: { type: String, enum: ['image/jpeg', 'image/png'], required: true },
    nationalIdBack: { type: String, enum: ['image/jpeg', 'image/png'], required: true },
  },
  status: {
    type: String,
    enum: ['PENDING_EMAIL_VERIFICATION', 'SUBMITTED_FOR_REVIEW', 'WITHDRAWN'],
    default: 'PENDING_EMAIL_VERIFICATION',
    required: true,
  },
  applicationTokenHash: { type: String, required: true, select: false },
  wrongOtpAttempts: { type: Number, min: 0, default: 0, required: true },
  verificationBlocked: { type: Boolean, default: false, required: true },
  otp: {
    codeVerifier: { type: String, default: null, select: false },
    status: { type: String, enum: ['DELIVERY_PENDING', 'ACTIVE', 'CONSUMED', 'INVALIDATED'], default: 'DELIVERY_PENDING' },
    issuedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    initialOtpIssuedAt: { type: Date, default: null },
    resendCount: { type: Number, min: 0, default: 0 },
  },
  emailVerifiedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, { timestamps: true, collection: 'pet_sitter_applications' });

applicationSchema.index({ email: 1 }, { unique: true, name: 'uniq_sitter_application_email' });
applicationSchema.index({ phone: 1 }, { unique: true, name: 'uniq_sitter_application_phone' });
applicationSchema.index({ applicationTokenHash: 1 }, { unique: true, name: 'uniq_sitter_application_token' });
applicationSchema.index({ status: 1, expiresAt: 1 }, { name: 'sitter_application_expiry_cleanup' });

export const PetSitterApplication = mongoose.models.PetSitterApplication
  ?? mongoose.model('PetSitterApplication', applicationSchema);
