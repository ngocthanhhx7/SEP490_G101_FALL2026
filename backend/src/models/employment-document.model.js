import { Schema } from 'mongoose';
export function employmentDocumentModels(connection) {
  const options = { strict: 'throw', versionKey: false, bufferCommands: false };
  const document = new Schema({ applicationId: { type: Schema.Types.ObjectId, required: true }, applicationVersion: Number,
    revision: Number, reference: String, employeeCode: String, templateVersion: String,
    state: { type: String, enum: ['DRAFT', 'ISSUED', 'SIGNED', 'ACTIVATED'], required: true },
    encryptedTerms: { type: String, required: true, select: false }, termsHash: String,
    createdBy: Schema.Types.ObjectId, createdAt: Date, issuedAt: Date, signedAt: Date,
    verifiedBy: Schema.Types.ObjectId, verifiedAt: Date, archiveReference: { type: String, select: false }, employeeId: Schema.Types.ObjectId }, options);
  document.index({ applicationId: 1, revision: 1 }, { unique: true });
  document.index({ reference: 1 }, { unique: true });
  const counter = new Schema({ _id: String, value: Number }, options);
  const command = new Schema({ _id: String, fingerprint: String, documentId: Schema.Types.ObjectId }, options);
  return { EmploymentDocument: connection.models.EmploymentDocument ?? connection.model('EmploymentDocument', document),
    EmploymentDocumentCounter: connection.models.EmploymentDocumentCounter ?? connection.model('EmploymentDocumentCounter', counter),
    EmploymentDocumentCommand: connection.models.EmploymentDocumentCommand ?? connection.model('EmploymentDocumentCommand', command) };
}
