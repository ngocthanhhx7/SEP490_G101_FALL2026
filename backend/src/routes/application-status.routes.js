import { Router } from 'express';
import { createHmac } from 'node:crypto';
import { sitterApplicationModels } from '../models/sitter-application.model.js';
import { createContactCrypto } from '../services/contact-crypto.service.js';
import { createOtpService } from '../services/otp-verification.service.js';
import { createSessionService } from '../services/session.service.js';
import { createApplicationStatusService } from '../services/applications/application-status.service.js';
import { AppError, metadata } from '../utils/app-error.js';

export function applicationStatusModule({ config, connection, ports, clock = Date.now }) {
  if (!config.auth?.enabled) return null;
  const { SitterApplication: Applicant } = sitterApplicationModels(connection);
  const crypto = createContactCrypto({ lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey });
  const sessionService = createSessionService({ connection, tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret });
  const digest = code => createHmac('sha256', config.auth.contactLookupSecret)
    .update(`application-tracking\0${code}`).digest('hex');
  async function scoped(code) {
    const codeDigest = digest(code);
    const record = await Applicant.findOne({ trackingCodeDigest: codeDigest })
      .select('_id contactChannel +contactCiphertext').lean();
    const applicationId = record?._id.toString() ?? codeDigest.slice(0, 24);
    const channel = record?.contactChannel ?? 'EMAIL';
    const contact = record ? crypto.decrypt(record.contactCiphertext) : `${codeDigest}@unknown.invalid`;
    const otp = createOtpService({ connection, sessionService, contactCrypto: crypto,
      otpSecret: config.auth.otpSecret, clock,
      contactDelivery: { send: command => record ? ports.contactDelivery.send(command)
        : Promise.resolve({ status: 'ACCEPTED' }) } });
    return { record, applicationId, channel, contact, otp };
  }
  const service = createApplicationStatusService({ clock,
    applications: { async findApplicantStatusById({ applicationId }) {
      const record = await Applicant.findById(applicationId)
        .select('state createdAt decisionReason rejectedAt reapplyAt').lean();
      return record && { ...record, submittedAt: record.createdAt };
    } },
    statusOtp: {
      async beginForApplication({ applicationCode, purpose }) {
        const scope = await scoped(applicationCode);
        return scope.otp.begin({ ...scope, purpose });
      },
      async verifyForApplication({ applicationCode, challengeId, code, purpose }) {
        const scope = await scoped(applicationCode);
        const proof = await scope.otp.verify({ ...scope, challengeId, code, purpose });
        if (!scope.record) throw new AppError(401, 'APPLICATION_STATUS_VERIFICATION_FAILED', 'Verification failed');
        return proof;
      }
    }
  });
  const router = Router();
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
      return next(new AppError(403, 'FORBIDDEN', 'Request origin is not allowed'));
    }
    next();
  });
  router.post('/challenges', async (req, res) => res.status(202).json({
    data: await service.requestVerification(req.body), meta: metadata(req) }));
  router.post('/verify', async (req, res) => res.json({
    data: await service.verifyAndReadStatus(req.body), meta: metadata(req) }));
  return { name: 'application-status', mount: '/api/v1/application-status', router };
}
