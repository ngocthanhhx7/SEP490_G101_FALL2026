import mongoose from 'mongoose';

const { Schema } = mongoose;

const petSitterSchema = new Schema({
  fullName: { type: String, required: true, minlength: 2, maxlength: 100 },
  email: { type: String, default: null, maxlength: 254 },
  phone: { type: String, default: null, match: /^\+84\d{9}$/ },
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE', required: true },
  avatarUrl: { type: String, default: null, maxlength: 2048 },
  bio: { type: String, default: null, maxlength: 1000 },
  experienceYears: { type: Number, default: null, min: 0 },
  serviceTypes: { type: [String], default: [] },
  acceptedSpecies: { type: [String], default: [] },
  maxPets: { type: Number, default: null, min: 1 },
  pricePerDay: { type: Number, default: null, min: 0 },
  address: { type: String, default: null, maxlength: 500 },
  district: { type: String, default: null, maxlength: 100 },
  city: { type: String, default: null, maxlength: 100 },
  rating: { type: Number, default: null, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0, min: 0, required: true },
  verificationStatus: { type: String, enum: ['UNVERIFIED', 'PENDING', 'VERIFIED'], default: 'UNVERIFIED' },
  certificates: { type: [String], default: [] },
  photoUrls: { type: [String], default: [], validate: (items) => items.length <= 10 },
}, { timestamps: true, collection: 'pet_sitters' });

petSitterSchema.index({ roleId: 1 }, { name: 'pet_sitter_role_lookup' });
petSitterSchema.index({ district: 1, city: 1, status: 1 }, { name: 'pet_sitter_location_search' });

export const PetSitter = mongoose.models.PetSitter ?? mongoose.model('PetSitter', petSitterSchema);
