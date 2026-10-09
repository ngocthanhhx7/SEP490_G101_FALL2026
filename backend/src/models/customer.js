import mongoose from 'mongoose';

const { Schema } = mongoose;

const customerSchema = new Schema({
  fullName: { type: String, required: true, minlength: 2, maxlength: 100 },
  email: { type: String, default: undefined },
  phone: { type: String, default: undefined },
  emailVerifiedAt: { type: Date, default: null },
  phoneVerifiedAt: { type: Date, default: null },
  roleId: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', required: true },
}, { timestamps: true, collection: 'customers' });

customerSchema.index({ email: 1 }, {
  unique: true,
  partialFilterExpression: { email: { $type: 'string' } },
  name: 'uniq_customer_email_when_present',
});
customerSchema.index({ phone: 1 }, {
  unique: true,
  partialFilterExpression: { phone: { $type: 'string' } },
  name: 'uniq_customer_phone_when_present',
});

export const Customer = mongoose.models.Customer ?? mongoose.model('Customer', customerSchema);
