import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  isActive: { type: Boolean, required: true, default: true },
}, { versionKey: false, collection: 'roles' });

roleSchema.index({ code: 1 }, { unique: true, name: 'uniq_role_code' });

export const Role = mongoose.models.Role ?? mongoose.model('Role', roleSchema);

export async function ensureBaseRoles() {
  await Promise.all([
    { code: 'CUSTOMER', name: 'Customer' },
    { code: 'PET_SITTER', name: 'Pet Sitter' },
  ].map(({ code, name }) => Role.updateOne(
    { code },
    { $setOnInsert: { code, name, isActive: true } },
    { upsert: true },
  )));
}
