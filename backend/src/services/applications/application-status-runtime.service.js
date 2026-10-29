import { createHmac } from 'node:crypto';
import { sitterApplicationModels } from '../../models/sitter-application.model.js';
import { createContactCrypto } from '../contact-crypto.service.js';
import { createOtpService } from '../otp-verification.service.js';
import { createSessionService } from '../session.service.js';
import { createApplicationStatusService } from '../applications/application-status.service.js';
import { AppError } from '../../utils/app-error.js';

export function createApplicationStatusRuntimeService({
  config,
  connection,
  ports,
  clock = Date.now
}) {
  const { SitterApplication: Applicant } = sitterApplicationModels(connection);
  const crypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  const sessionService = createSessionService({
    connection,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  const digest = (code) =>
    createHmac('sha256', config.auth.contactLookupSecret)
      .update(`application-tracking\0${code}`)
      .digest('hex');
  async function scoped(code) {
    const codeDigest = digest(code);
    const record = await Applicant.findOne({ trackingCodeDigest: codeDigest })
      .select('_id contactChannel +contactCiphertext')
      .lean();
    const applicationId = record?._id.toString() ?? codeDigest.slice(0, 24);
    const channel = record?.contactChannel ?? 'EMAIL';
    const contact = record
      ? crypto.decrypt(record.contactCiphertext)
      : `${codeDigest}@unknown.invalid`;
    const otp = createOtpService({
      connection,
      sessionService,
      contactCrypto: crypto,
      otpSecret: config.auth.otpSecret,
      clock,
      contactDelivery: {
        send: (command) =>
          record
            ? ports.contactDelivery.send(command)
            : Promise.resolve({ status: 'ACCEPTED' })
      }
    });
    return { record, applicationId, channel, contact, otp };
  }
  return createApplicationStatusService({
    clock,
    applications: {
      async findApplicantStatusById({ applicationId }) {
        const record = await Applicant.findById(applicationId)
          .select('state createdAt decisionReason rejectedAt reapplyAt')
          .lean();
        return record && { ...record, submittedAt: record.createdAt };
      }
    },
    statusOtp: {
      async beginForApplication({ applicationCode, purpose }) {
        const scope = await scoped(applicationCode);
        return scope.otp.begin({ ...scope, purpose });
      },
      async verifyForApplication({
        applicationCode,
        challengeId,
        code,
        purpose
      }) {
        const scope = await scoped(applicationCode);
        const proof = await scope.otp.verify({
          ...scope,
          challengeId,
          code,
          purpose
        });
        if (!scope.record)
          throw new AppError(
            401,
            'APPLICATION_STATUS_VERIFICATION_FAILED',
            'Verification failed'
          );
        return proof;
      }
    }
  });
}
