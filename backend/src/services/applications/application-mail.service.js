import { randomUUID } from 'node:crypto';
import { applicationMailModel } from '../../models/application-mail.model.js';
import { identityModels } from '../../models/identity.model.js';

const SAFE_CODES = new Set(['PROVIDER_UNAVAILABLE', 'AUTHENTICATION_FAILED', 'INVALID_ADDRESS', 'TIMEOUT', 'THROTTLED', 'PROVIDER_ERROR', 'INVALID_REQUEST', 'EXPIRED']);

// Enqueue in the domain transaction. SMTP runs only after commit, in the worker.
export function createApplicationMailService({ connection, contactCrypto, delivery, webOrigin = 'https://pawworldvn.shop', clock = Date.now }) {
  const Mail = applicationMailModel(connection);
  const { Contact } = identityModels(connection);
  const origin = new URL(webOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password) throw new TypeError('HTTPS application mail origin required');
  async function enqueue(application, session) {
    const email = application.contactChannel === 'EMAIL' && typeof application.contactCiphertext === 'string'
      ? contactCrypto.decrypt(application.contactCiphertext) : null;
    const verified = email && application.ownerUserId && await Contact.exists({ userId: application.ownerUserId,
      channel: 'EMAIL', state: 'VERIFIED', lookupKey: contactCrypto.lookup('EMAIL', email).lookupKey }).session(session);
    const hasEmail = !!verified;
    await Mail.updateOne({ _id: `${application._id}:${application.version}` }, { $setOnInsert: {
      applicationId: application._id, applicationVersion: application.version, applicationState: application.state,
      ownerUserId: application.ownerUserId ?? null,
      ...(hasEmail ? { contactCiphertext: application.contactCiphertext } : {}), operationId: randomUUID(),
      deliveryState: hasEmail ? 'PENDING' : 'SKIPPED', failureCode: hasEmail ? null : 'VERIFIED_EMAIL_UNAVAILABLE',
      createdAt: new Date(clock()), nextAttemptAt: new Date(clock()), attempts: 0
    } }, { upsert: true, session });
  }
  async function runBatch({ limit = 10 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new TypeError('Bounded mail batch required');
    const now = clock();
    // A process crash may have happened after SMTP acceptance. Never resend blindly.
    await Mail.updateMany({ deliveryState: 'SENDING', leaseUntil: { $lte: new Date(now) } },
      { $set: { deliveryState: 'UNKNOWN', failureCode: 'ACKNOWLEDGEMENT_UNKNOWN', leaseUntil: null } });
    const result = { processed: 0, accepted: 0, failed: 0, unknown: 0 };
    for (let index = 0; index < limit; index++) {
      const row = await Mail.findOneAndUpdate({ deliveryState: 'PENDING', nextAttemptAt: { $lte: new Date(clock()) } },
        { $set: { deliveryState: 'SENDING', leaseUntil: new Date(clock() + 60000) }, $inc: { attempts: 1 } },
        { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' }).select('+contactCiphertext').lean();
      if (!row) break;
      result.processed++;
      const recipient = contactCrypto.decrypt(row.contactCiphertext);
      const verified = await Contact.exists({ userId: row.ownerUserId, channel: 'EMAIL', state: 'VERIFIED',
        lookupKey: contactCrypto.lookup('EMAIL', recipient).lookupKey });
      if (!verified) {
        await Mail.updateOne({ _id: row._id, deliveryState: 'SENDING' }, { $set: { deliveryState: 'SKIPPED',
          failureCode: 'VERIFIED_EMAIL_UNAVAILABLE', leaseUntil: null } });
        continue;
      }
      let response;
      try {
        response = await delivery.send({ kind: 'SYSTEM', channel: 'EMAIL', template: 'SITTER_APPLICATION_STATUS',
          applicationState: row.applicationState, webOrigin: origin.origin,
          to: recipient, operationId: row.operationId });
      } catch (error) {
        response = error?.code === 'PROVIDER_UNAVAILABLE'
          ? { status: 'FAILED', code: 'PROVIDER_UNAVAILABLE', retryable: true }
          : { status: 'FAILED', code: 'PROVIDER_ERROR', uncertain: true };
      }
      const accepted = response?.status === 'ACCEPTED';
      const uncertain = response?.uncertain === true;
      const retry = !accepted && !uncertain && response?.retryable === true && row.attempts < 3;
      const deliveryState = accepted ? 'ACCEPTED' : uncertain ? 'UNKNOWN' : retry ? 'PENDING' : 'FAILED';
      const failureCode = accepted ? null : SAFE_CODES.has(response?.code) ? response.code : 'PROVIDER_ERROR';
      await Mail.updateOne({ _id: row._id, deliveryState: 'SENDING', attempts: row.attempts }, { $set: {
        deliveryState, failureCode, leaseUntil: null,
        acceptedAt: accepted ? new Date(clock()) : null,
        nextAttemptAt: new Date(clock() + 60000 * row.attempts)
      } });
      if (accepted) result.accepted++;
      else if (uncertain) result.unknown++;
      else result.failed++;
    }
    return result;
  }
  async function list(applicationId) {
    return Mail.find({ applicationId }).sort({ applicationVersion: 1 }).select('applicationState applicationVersion deliveryState createdAt acceptedAt failureCode').lean();
  }
  return { enqueue, runBatch, list };
}
