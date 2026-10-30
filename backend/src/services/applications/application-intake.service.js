import { createHmac } from 'node:crypto';
import { identityModels } from '../../models/identity.model.js';
import { applicantDocumentModels } from '../../models/private-image.model.js';
import { sitterApplicationModels } from '../../models/sitter-application.model.js';
import { AppError } from '../../utils/app-error.js';

// Applicant documents use the existing authenticated, decoded/re-encoded image
// pipeline, in a dedicated collection/bucket/quota. They never accept client-authored object keys.
export function createApplicationIntakeService({ connection, contactCrypto, media, secret, uploadsAvailable, clock = Date.now }) {
  const { Contact } = identityModels(connection);
  const { PrivateImage } = applicantDocumentModels(connection);
  const { SitterApplication } = sitterApplicationModels(connection);
  async function verifiedContact(actor, contactLookupKey) {
    if (!actor?.roles?.includes('CUSTOMER') || actor.roles.some(role => ['ADMIN', 'STAFF', 'PET_SITTER'].includes(role))) {
      throw new AppError(403, 'FORBIDDEN', 'Customer registration is required before applying');
    }
    const contact = await Contact.findOne({ userId: actor.userId, channel: 'EMAIL', state: 'VERIFIED',
      ...(contactLookupKey ? { lookupKey: contactLookupKey } : {}) }).select('+canonicalCiphertext +lookupKey').lean();
    if (!contact) throw new AppError(403, 'VERIFIED_EMAIL_REQUIRED', 'A verified email is required');
    return contact;
  }
  return Object.freeze({
    async getIntake({ actor }) {
      const contact = await verifiedContact(actor);
      const previous = await SitterApplication.findOne({ ownerUserId: actor.userId })
        .sort({ createdAt: -1, _id: -1 }).select('state createdAt reapplyAt decisionReason +submissionKeyDigest').lean();
      const application = previous ? {
        state: previous.state, submittedAt: previous.createdAt.toISOString(),
        reapplyAt: previous.reapplyAt?.toISOString() ?? null,
        rejectionReason: previous.state === 'REJECTED' ? previous.decisionReason ?? null : null,
        canReapply: previous.state === 'REJECTED' && !!previous.reapplyAt && previous.reapplyAt.getTime() <= clock(),
        applicationCode: createHmac('sha256', secret).update(`application-receipt\0${previous.submissionKeyDigest}`).digest('base64url')
      } : null;
      return { contactChannel: 'EMAIL', contactValue: contactCrypto.decrypt(contact.canonicalCiphertext),
        uploadsAvailable, acceptedTypes: ['image/jpeg', 'image/png'], maxFileBytes: 5 * 1024 * 1024, application };
    },
    async verifyApplicantDocuments({ documents, contactLookupKey, actor }) {
      await verifiedContact(actor, contactLookupKey);
      if (!uploadsAvailable) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private document storage is unavailable');
      for (const document of documents) {
        if (!/^[a-f0-9]{64}$/.test(document.documentId) || document.storageRef !== document.documentId) {
          throw new AppError(422, 'VALIDATION_FAILED', 'Invalid private document reference');
        }
        const image = await PrivateImage.exists({ _id: document.documentId, ownerId: actor.userId, state: 'READY' });
        if (!image) throw new AppError(403, 'FORBIDDEN', 'Private document does not belong to this applicant');
      }
      return documents;
    },
    async readDocument({ storageRef }) {
      if (!/^[a-f0-9]{64}$/.test(storageRef ?? '')) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Document not found');
      const record = await PrivateImage.findOne({ _id: storageRef, state: 'READY' }).select('+storageRef').lean();
      if (!record) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Document not found');
      return media.read({ storageRef: record.storageRef });
    }
  });
}
