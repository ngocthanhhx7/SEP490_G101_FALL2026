import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { canonicalizeContact } from './contact-crypto.service.js';
import { AppError } from '../utils/app-error.js';
import { identityModels } from '../models/identity.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REAPPLY_DELAY_MS = 30 * DAY_MS;
const MAX_DOCUMENT_VIEWS_PER_HOUR = 20;
const ALLOWED_STATES = new Set(['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED']);
const ACTIVE_STATES = ['PENDING', 'UNDER_REVIEW', 'INTERVIEW'];
const PAGE_LIMIT = 50;

function invalid(message = 'Application request is invalid') {
  throw new AppError(422, 'VALIDATION_FAILED', message);
}

function hash(secret, value) {
  return createHmac('sha256', Buffer.from(secret, 'utf8')).update(value).digest('hex');
}

function hashPayload(secret, value) {
  return hash(secret, JSON.stringify(value));
}

function sameDigest(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex'), b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeText(value, { min = 1, max, field }) {
  if (typeof value !== 'string') invalid(`${field} is required`);
  const normalized = value.normalize('NFC').trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    invalid(`${field} is invalid`);
  }
  return normalized;
}

function stringList(value, field) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) invalid(`${field} is invalid`);
  const items = value.map(item => safeText(item, { max: 80, field }));
  if (new Set(items.map(item => item.toLocaleLowerCase('vi'))).size !== items.length) invalid(`${field} contains duplicates`);
  return items;
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function vietnamCalendarDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function isAdult(dateOfBirth, now) {
  const birth = validDateOnly(dateOfBirth);
  if (!birth) invalid('dateOfBirth must be a valid date');
  const today = vietnamCalendarDate(now);
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  if (age < 0 || age > 120) invalid('dateOfBirth is invalid');
  return age >= 18;
}

function canonicalIdentity(value) {
  if (typeof value !== 'string') invalid('identityNumber is required');
  const canonical = value.normalize('NFKC').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{8,20}$/.test(canonical)) invalid('identityNumber is invalid');
  return canonical;
}

function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(value)) {
    invalid('Idempotency-Key is required');
  }
  return value;
}

function normalizeDocuments(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) invalid('documents are required');
  const documents = value.map(document => {
    if (!document || typeof document !== 'object' || Array.isArray(document)
      || Object.keys(document).some(key => !['documentId', 'documentType', 'storageRef'].includes(key))) invalid('documents are invalid');
    const documentId = safeText(document.documentId, { max: 128, field: 'documentId' });
    const documentType = document.documentType;
    if (!['IDENTITY', 'CERTIFICATE', 'OTHER'].includes(documentType)) invalid('documentType is invalid');
    const storageRef = document.storageRef;
    if (typeof storageRef !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(storageRef)) invalid('storageRef is invalid');
    return { documentId, documentType, storageRef };
  });
  if (!documents.some(document => document.documentType === 'IDENTITY')) invalid('An identity document is required');
  if (new Set(documents.map(document => document.documentId)).size !== documents.length
    || new Set(documents.map(document => document.storageRef)).size !== documents.length) invalid('documents contain duplicates');
  return documents;
}

function cursorCodec(secret) {
  function sign(payload) {
    return createHmac('sha256', Buffer.from(secret, 'utf8')).update(`sitter-application-cursor\0${payload}`).digest('base64url');
  }
  return Object.freeze({
    encode(createdAt, id, fingerprint) {
      const payload = Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id: id.toString(), fingerprint })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    decode(value, fingerprint) {
      if (typeof value !== 'string' || value.length > 1024) invalid('Cursor is invalid');
      const [payload, signature, extra] = value.split('.');
      if (!payload || !signature || extra !== undefined) invalid('Cursor is invalid');
      const expected = Buffer.from(sign(payload)), received = Buffer.from(signature);
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) invalid('Cursor is invalid');
      let position;
      try { position = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { invalid('Cursor is invalid'); }
      if (position?.fingerprint !== fingerprint || !Types.ObjectId.isValid(position.id)
        || !Number.isFinite(Date.parse(position.createdAt))) invalid('Cursor is invalid');
      return { createdAt: new Date(position.createdAt), id: new Types.ObjectId(position.id) };
    }
  });
}

function maskContact(channel, value) {
  if (channel === 'EMAIL') {
    const at = value.lastIndexOf('@');
    return at < 1 ? '••••' : `${value.slice(0, 1)}•••${value.slice(at)}`;
  }
  const digits = value.replace(/\D/g, '');
  return `${value.startsWith('+') ? '+' : ''}••••••${digits.slice(-4)}`;
}

function assertAdmin(actor) {
  if (!actor?.userId || actor.state !== 'ACTIVE' || !Array.isArray(actor.roles) || !actor.roles.includes('ADMIN')) {
    throw new AppError(actor?.userId ? 403 : 401, actor?.userId ? 'FORBIDDEN' : 'UNAUTHENTICATED', 'Action is not permitted');
  }
}

function applicationView(application, contactValue, { includePrivate = false } = {}) {
  const result = {
    id: application._id.toString(), displayName: application.displayName,
    contact: includePrivate ? { channel: application.contactChannel, value: contactValue }
      : { channel: application.contactChannel, maskedValue: maskContact(application.contactChannel, contactValue) },
    ageEligible: application.ageEligible, experience: application.experience,
    requestedServices: [...application.requestedServices], workAreas: [...application.workAreas],
    documents: application.privateDocuments.map(document => ({ documentId: document.documentId, documentType: document.documentType })),
    state: application.state, interviewNote: application.interviewNote,
    decisionReason: application.decisionReason,
    rejectedAt: application.rejectedAt?.toISOString() ?? null,
    reapplyAt: application.reapplyAt?.toISOString() ?? null,
    provisionedUserId: application.provisionedUserId?.toString() ?? null,
    version: application.version,
    createdAt: application.createdAt.toISOString(), updatedAt: application.updatedAt.toISOString()
  };
  return result;
}

export function createSitterApplicationService({ connection, Applicant, User, Audit, DownloadQuota, SitterStatus,
  contactCrypto, privateMedia, lookupSecret, cursorSecret, registrationPolicyService, clock = Date.now }) {
  if (!connection?.transaction || !Applicant || !User || !Audit || !DownloadQuota || !SitterStatus
    || typeof contactCrypto?.lookup !== 'function' || typeof contactCrypto?.encrypt !== 'function'
    || typeof contactCrypto?.decrypt !== 'function' || typeof lookupSecret !== 'string'
    || Buffer.byteLength(lookupSecret, 'utf8') < 32 || typeof cursorSecret !== 'string'
    || Buffer.byteLength(cursorSecret, 'utf8') < 32 || typeof clock !== 'function') {
    throw new TypeError('Sitter application dependencies are required');
  }
  const cursors = cursorCodec(cursorSecret);

  async function submit({ body, idempotencyKey, correlationId, actor }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['displayName', 'contactChannel', 'contactValue', 'dateOfBirth',
        'identityNumber', 'experience', 'requestedServices', 'workAreas', 'documents', 'policyVersions'].includes(key))) invalid();
    const displayName = safeText(body.displayName, { max: 100, field: 'displayName' });
    const contactChannel = body.contactChannel;
    const contactValue = canonicalizeContact(contactChannel, body.contactValue);
    const contact = contactCrypto.lookup(contactChannel, contactValue);
    const identityValue = canonicalIdentity(body.identityNumber);
    const identityLookupKey = hash(lookupSecret, `applicant-identity\0${identityValue}`);
    const experience = safeText(body.experience, { min: 10, max: 2000, field: 'experience' });
    const requestedServices = stringList(body.requestedServices, 'requestedServices');
    const workAreas = stringList(body.workAreas, 'workAreas');
    const documents = normalizeDocuments(body.documents);
    const now = clock();
    if (!Number.isFinite(now)) throw new TypeError('clock must return a timestamp');
    const ageEligible = isAdult(body.dateOfBirth, now);
    if (!ageEligible) throw new AppError(422, 'AGE_REQUIREMENT_NOT_MET', 'Applicant must be at least 18 years old');
    const key = validateIdempotencyKey(idempotencyKey);
    const submissionKeyDigest = hash(lookupSecret, `application-submit\0${contact.lookupKey}\0${key}`);
    const applicationCode = createHmac('sha256', lookupSecret)
      .update(`application-receipt\0${submissionKeyDigest}`).digest('base64url');
    const trackingCodeDigest = hash(lookupSecret, `application-tracking\0${applicationCode}`);
    const normalizedPayload = {
      displayName, contactChannel, contactLookupKey: contact.lookupKey, identityLookupKey,
      dateOfBirth: body.dateOfBirth, experience, requestedServices, workAreas,
      ...(registrationPolicyService ? { policyVersions: body.policyVersions } : {}),
      documents: documents.map(({ documentId, documentType, storageRef }) => ({ documentId, documentType, storageRef }))
    };
    const submissionPayloadDigest = hashPayload(lookupSecret, normalizedPayload);

    const priorSubmission = await Applicant.findOne({ submissionKeyDigest }).select('+submissionPayloadDigest').lean();
    if (priorSubmission) {
      if (priorSubmission.ownerUserId && priorSubmission.ownerUserId.toString() !== actor?.userId) {
        throw new AppError(403, 'FORBIDDEN', 'Application does not belong to this applicant');
      }
      if (!sameDigest(priorSubmission.submissionPayloadDigest, submissionPayloadDigest)) {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This submission key was already used');
      }
      await Applicant.updateOne({ _id: priorSubmission._id, trackingCodeDigest: { $exists: false } },
        { $set: { trackingCodeDigest } });
      return { id: priorSubmission._id.toString(), state: priorSubmission.state,
        submittedAt: priorSubmission.createdAt.toISOString(), applicationCode, replayed: true };
    }

    const tooEarly = await Applicant.exists({
      $or: [{ contactLookupKey: contact.lookupKey }, { identityLookupKey }],
      state: 'REJECTED', reapplyAt: { $gt: new Date(now) }
    });
    if (tooEarly) throw new AppError(409, 'REAPPLY_NOT_AVAILABLE', 'An application cannot be submitted at this time');
    const duplicate = await Applicant.exists({ $or: [
      { activePendingContactKey: contact.lookupKey }, { activePendingIdentityKey: identityLookupKey }
    ] });
    if (duplicate) throw new AppError(409, 'APPLICATION_ALREADY_PENDING', 'An application cannot be submitted at this time');
    if (typeof privateMedia?.verifyApplicantDocuments !== 'function') {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private document storage is not configured');
    }
    const verifiedDocuments = await privateMedia.verifyApplicantDocuments({
      documents, contactLookupKey: contact.lookupKey, identityLookupKey, actor
    });
    if (!Array.isArray(verifiedDocuments) || verifiedDocuments.length !== documents.length
      || verifiedDocuments.some(document => !documents.some(input => input.documentId === document.documentId
        && input.documentType === document.documentType && input.storageRef === document.storageRef))) {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private document references could not be verified');
    }

    try {
      const application = await connection.transaction(async session => {
        const policyConsents = registrationPolicyService
          ? await registrationPolicyService.validateAndBuildReceipt({ policyVersions: body.policyVersions, session, now }) : [];
        if (actor?.userId) {
          const { Contact } = identityModels(connection);
          const verified = await Contact.exists({ userId: actor.userId, channel: contactChannel,
            lookupKey: contact.lookupKey, state: 'VERIFIED' }).session(session);
          const owner = await User.exists({ _id: actor.userId, state: 'ACTIVE', roles: ['CUSTOMER'], synthetic: false }).session(session);
          if (!verified || !owner) throw new AppError(403, 'FORBIDDEN', 'Applicant account or contact is no longer eligible');
        }
        const [created] = await Applicant.create([{
          ownerUserId: actor?.userId ?? null,
          policyConsents,
          displayName, contactChannel, contactCiphertext: contactCrypto.encrypt(contact.canonicalValue),
          contactLookupKey: contact.lookupKey, identityLookupKey,
          activePendingContactKey: contact.lookupKey, activePendingIdentityKey: identityLookupKey,
          ageEligible: true, ageCheckedAt: new Date(now), experience, requestedServices, workAreas,
          privateDocuments: verifiedDocuments, state: 'PENDING', version: 0,
          trackingCodeDigest, submissionKeyDigest, submissionPayloadDigest
        }], { session });
        await Audit.create([{
          actorRoles: [], action: 'APPLICATION_SUBMITTED', resourceId: created._id,
          occurredAt: new Date(now), state: 'PENDING', correlationId: correlationId ?? null
        }], { session });
        return created;
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return { id: application._id.toString(), state: application.state,
        submittedAt: application.createdAt.toISOString(), applicationCode, replayed: false };
    } catch (error) {
      const replay = await Applicant.findOne({ submissionKeyDigest }).select('+submissionPayloadDigest').lean();
      if (replay) {
        if (replay.ownerUserId && replay.ownerUserId.toString() !== actor?.userId) {
          throw new AppError(403, 'FORBIDDEN', 'Application does not belong to this applicant');
        }
        if (!sameDigest(replay.submissionPayloadDigest, submissionPayloadDigest)) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This submission key was already used');
        }
        await Applicant.updateOne({ _id: replay._id, trackingCodeDigest: { $exists: false } },
          { $set: { trackingCodeDigest } });
        return { id: replay._id.toString(), state: replay.state, submittedAt: replay.createdAt.toISOString(), applicationCode, replayed: true };
      }
      const duplicatePending = await Applicant.exists({ $or: [
        { activePendingContactKey: contact.lookupKey }, { activePendingIdentityKey: identityLookupKey }
      ] });
      if (duplicatePending || error?.code === 11000) {
        throw new AppError(409, 'APPLICATION_ALREADY_PENDING', 'An application cannot be submitted at this time');
      }
      throw error;
    }
  }

  async function list({ query, actor }) {
    assertAdmin(actor);
    const allowed = new Set(['state', 'limit', 'cursor', 'search']);
    if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !allowed.has(key))) invalid();
    const state = query.state ?? '';
    const search = query.search ?? '';
    const limitText = query.limit ?? '20';
    const cursorValue = query.cursor ?? '';
    if (state && !ALLOWED_STATES.has(state)) invalid('state is invalid');
    if (typeof search !== 'string' || search.trim().length > 100
      || typeof limitText !== 'string' || !/^[1-9]\d{0,2}$/.test(limitText)
      || typeof cursorValue !== 'string') invalid('Application filters are invalid');
    const limit = Number(limitText);
    if (limit > PAGE_LIMIT) invalid(`Page size cannot exceed ${PAGE_LIMIT}`);
    const fingerprint = createHash('sha256').update(JSON.stringify({ state, search: search.trim().toLocaleLowerCase('vi'), limit })).digest('base64url');
    const conditions = [];
    if (state) conditions.push({ state });
    if (search.trim()) conditions.push({ displayName: new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    if (cursorValue) {
      const position = cursors.decode(cursorValue, fingerprint);
      conditions.push({ $or: [{ createdAt: { $lt: position.createdAt } }, { createdAt: position.createdAt, _id: { $lt: position.id } }] });
    }
    const filter = conditions.length ? { $and: conditions } : {};
    const rows = await Applicant.find(filter).select('displayName contactChannel contactCiphertext ageEligible experience requestedServices workAreas state createdAt updatedAt version')
      .select('+contactCiphertext').sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const items = page.map(row => ({
      id: row._id.toString(), displayName: row.displayName,
      contact: { channel: row.contactChannel, maskedValue: maskContact(row.contactChannel, contactCrypto.decrypt(row.contactCiphertext)) },
      ageEligible: row.ageEligible, requestedServices: [...row.requestedServices], workAreas: [...row.workAreas],
      state: row.state, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    }));
    return { applications: items, nextCursor: hasMore && page.length
      ? cursors.encode(page.at(-1).createdAt, page.at(-1)._id, fingerprint) : null };
  }

  async function get({ applicationId, actor, correlationId }) {
    assertAdmin(actor);
    if (!Types.ObjectId.isValid(applicationId)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
    const id = new Types.ObjectId(applicationId);
    const application = await Applicant.findById(id).select('+contactCiphertext').lean();
    if (!application) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
    const now = clock();
    await Audit.create({ actorId: new Types.ObjectId(actor.userId), actorRoles: [...actor.roles],
      action: 'APPLICATION_VIEWED', resourceId: id, occurredAt: new Date(now), state: application.state,
      correlationId: correlationId ?? null });
    const result = applicationView(application, contactCrypto.decrypt(application.contactCiphertext), { includePrivate: true });
    if (application.provisionedUserId) {
      const sitterStatus = await SitterStatus.findOne({ userId: application.provisionedUserId })
        .select('+statusReason').lean();
      result.sitterStatus = sitterStatus ? {
        status: sitterStatus.status, reason: sitterStatus.statusReason,
        version: sitterStatus.version, changedAt: sitterStatus.changedAt.toISOString()
      } : null;
    } else result.sitterStatus = null;
    return result;
  }

  async function startReview({ applicationId, expectedVersion, idempotencyKey, actor, correlationId }) {
    assertAdmin(actor);
    return changeToReview({ applicationId, expectedVersion, idempotencyKey, actor, correlationId });
  }

  async function changeToReview({ applicationId, expectedVersion, idempotencyKey, actor, correlationId, targetState = 'UNDER_REVIEW' }) {
    if (!Types.ObjectId.isValid(applicationId)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) invalid('expectedVersion is invalid');
    const key = validateIdempotencyKey(idempotencyKey);
    const id = new Types.ObjectId(applicationId);
    const idempotencyDigest = hash(lookupSecret, `${targetState === 'INTERVIEW' ? 'application-interview' : 'application-review'}\0${actor.userId}\0${id}\0${key}`);
    const payloadDigest = hashPayload(lookupSecret, { action: targetState === 'INTERVIEW' ? 'START_INTERVIEW' : 'START_REVIEW', expectedVersion });
    const now = clock();
    const existing = await Audit.findOne({ resourceId: id, idempotencyDigest }).select('+idempotencyDigest +payloadDigest').lean();
    if (existing) {
      if (!sameDigest(existing.payloadDigest, payloadDigest)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This decision key was already used');
      return { id: id.toString(), state: existing.state, version: existing.resultVersion, replayed: true };
    }
    try {
      return await connection.transaction(async session => {
        const application = await Applicant.findOneAndUpdate({ _id: id, state: targetState === 'INTERVIEW' ? 'UNDER_REVIEW' : 'PENDING', version: expectedVersion },
          { $set: { state: targetState }, $inc: { version: 1 } }, { returnDocument: 'after', session });
        if (!application) {
          const found = await Applicant.exists({ _id: id }).session(session);
          if (!found) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
          throw new AppError(409, 'VERSION_CONFLICT', 'Application changed before review started');
        }
        await Audit.create([{
          actorId: new Types.ObjectId(actor.userId), actorRoles: [...actor.roles], action: 'APPLICATION_REVIEW_STARTED',
          resourceId: id, occurredAt: new Date(now), state: application.state, idempotencyDigest, payloadDigest,
          resultVersion: application.version, correlationId: correlationId ?? null
        }], { session });
        return { id: id.toString(), state: application.state, version: application.version, replayed: false };
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) {
      const replay = await Audit.findOne({ resourceId: id, idempotencyDigest }).select('+idempotencyDigest +payloadDigest').lean();
      if (replay && sameDigest(replay.payloadDigest, payloadDigest)) {
        return { id: id.toString(), state: replay.state, version: replay.resultVersion, replayed: true };
      }
      throw error;
    }
  }

  async function decide({ applicationId, body, idempotencyKey, actor, correlationId }) {
    assertAdmin(actor);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['action', 'reason', 'interviewNote', 'expectedVersion'].includes(key))) invalid();
    const { action, expectedVersion } = body;
    if (!['APPROVE', 'REJECT'].includes(action) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) invalid();
    const reason = safeText(body.reason, { min: 3, max: 1000, field: 'reason' });
    const interviewNote = body.interviewNote === undefined || body.interviewNote === '' ? null
      : safeText(body.interviewNote, { max: 2000, field: 'interviewNote' });
    if (!Types.ObjectId.isValid(applicationId)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
    const id = new Types.ObjectId(applicationId);
    const key = validateIdempotencyKey(idempotencyKey);
    const idempotencyDigest = hash(lookupSecret, `application-decision\0${actor.userId}\0${id}\0${key}`);
    const payloadDigest = hashPayload(lookupSecret, { action, reason, interviewNote, expectedVersion });
    const now = clock();
    const existing = await Audit.findOne({ resourceId: id, idempotencyDigest }).select('+idempotencyDigest +payloadDigest').lean();
    if (existing) {
      if (!sameDigest(existing.payloadDigest, payloadDigest)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This decision key was already used');
      return { id: id.toString(), state: existing.state, version: existing.resultVersion,
        userId: existing.resultUserId?.toString() ?? null, reapplyAt: existing.reapplyAt?.toISOString() ?? null, replayed: true };
    }

    try {
      return await connection.transaction(async session => {
        const current = await Applicant.findOne({ _id: id, state: { $in: ACTIVE_STATES }, version: expectedVersion })
          .select('+contactLookupKey').session(session).lean();
        if (!current) {
          const found = await Applicant.exists({ _id: id }).session(session);
          if (!found) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
          throw new AppError(409, 'VERSION_CONFLICT', 'Application is no longer awaiting a decision');
        }
        let user = null;
        if (action === 'APPROVE') {
          if (current.ownerUserId) {
            const { Contact } = identityModels(connection);
            const verifiedContact = await Contact.exists({ userId: current.ownerUserId, channel: current.contactChannel,
              lookupKey: current.contactLookupKey, state: 'VERIFIED' }).session(session);
            if (!verifiedContact) throw new AppError(409, 'CONTACT_UNAVAILABLE', 'Applicant contact is no longer verified');
            user = await User.findOneAndUpdate({ _id: current.ownerUserId, state: 'ACTIVE', roles: ['CUSTOMER'], synthetic: false },
              { $addToSet: { roles: 'PET_SITTER' }, $inc: { authEpoch: 1, version: 1 } }, { returnDocument: 'after', session });
            if (!user) throw new AppError(409, 'CONTACT_UNAVAILABLE', 'Applicant account is no longer eligible');
          } else {
            [user] = await User.create([{
              displayName: current.displayName, roles: ['PET_SITTER'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false
            }], { session });
          }
          await SitterStatus.create([{
            userId: user._id, status: 'ACTIVE', statusReason: null, changedAt: new Date(now), version: 0
          }], { session });
        }
        const state = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const rejectedAt = action === 'REJECT' ? new Date(now) : null;
        const reapplyAt = rejectedAt ? new Date(now + REAPPLY_DELAY_MS) : null;
        const application = await Applicant.findOneAndUpdate({ _id: id, state: { $in: ACTIVE_STATES }, version: expectedVersion }, {
          $set: { state, interviewNote, decisionReason: reason, rejectedAt, reapplyAt,
            provisionedUserId: user?._id ?? null },
          $unset: { activePendingContactKey: 1, activePendingIdentityKey: 1 },
          $inc: { version: 1 }
        }, { returnDocument: 'after', session });
        if (!application) throw new AppError(409, 'VERSION_CONFLICT', 'Application changed before the decision was applied');
        await Audit.create([{
          actorId: new Types.ObjectId(actor.userId), actorRoles: [...actor.roles], action: 'APPLICATION_DECIDED',
          resourceId: id, occurredAt: new Date(now), state, decision: action,
          reasonDigest: hash(lookupSecret, `application-reason\0${reason}`),
          idempotencyDigest, payloadDigest, resultVersion: application.version,
          resultUserId: user?._id ?? null, reapplyAt, correlationId: correlationId ?? null
        }], { session });
        return { id: id.toString(), state, version: application.version, userId: user?._id.toString() ?? null,
          reapplyAt: reapplyAt?.toISOString() ?? null, replayed: false,
          onboarding: user ? 'CONTACT_VERIFICATION_PENDING' : null,
          applicantNotice: action === 'REJECT' ? 'INTEGRATION_PENDING' : null };
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) {
      const replay = await Audit.findOne({ resourceId: id, idempotencyDigest }).select('+idempotencyDigest +payloadDigest').lean();
      if (replay && sameDigest(replay.payloadDigest, payloadDigest)) {
        return { id: id.toString(), state: replay.state, version: replay.resultVersion,
          userId: replay.resultUserId?.toString() ?? null, reapplyAt: replay.reapplyAt?.toISOString() ?? null,
          replayed: true, onboarding: replay.resultUserId ? 'CONTACT_VERIFICATION_PENDING' : null,
          applicantNotice: replay.decision === 'REJECT' ? 'INTEGRATION_PENDING' : null };
      }
      throw error;
    }
  }

  async function changeSitterStatus({ applicationId, body, idempotencyKey, actor, correlationId }) {
    assertAdmin(actor);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['action', 'reason', 'expectedVersion'].includes(key))) invalid();
    const { action, expectedVersion } = body;
    if (!['SUSPEND', 'REINSTATE'].includes(action) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) invalid();
    const reason = safeText(body.reason, { min: 3, max: 1000, field: 'reason' });
    if (!Types.ObjectId.isValid(applicationId)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
    const id = new Types.ObjectId(applicationId);
    const key = validateIdempotencyKey(idempotencyKey);
    const idempotencyDigest = hash(lookupSecret, `sitter-status\0${actor.userId}\0${id}\0${key}`);
    const payloadDigest = hashPayload(lookupSecret, { action, reason, expectedVersion });
    const now = clock();
    const existing = await Audit.findOne({ resourceId: id, idempotencyDigest })
      .select('+idempotencyDigest +payloadDigest').lean();
    if (existing) {
      if (!sameDigest(existing.payloadDigest, payloadDigest)) {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This status decision key was already used');
      }
      return { applicationId: id.toString(), userId: existing.resultUserId.toString(),
        status: existing.action === 'SITTER_SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
        version: existing.resultVersion, replayed: true };
    }

    const expectedStatus = action === 'SUSPEND' ? 'ACTIVE' : 'SUSPENDED';
    const nextStatus = action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
    try {
      return await connection.transaction(async session => {
        const application = await Applicant.findOne({ _id: id, state: 'APPROVED', provisionedUserId: { $ne: null } })
          .session(session).lean();
        if (!application) {
          const found = await Applicant.exists({ _id: id }).session(session);
          if (!found) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
          throw new AppError(409, 'SITTER_NOT_APPROVED', 'Only an approved Sitter can change status');
        }
        const status = await SitterStatus.findOneAndUpdate({
          userId: application.provisionedUserId, status: expectedStatus, version: expectedVersion
        }, { $set: { status: nextStatus, statusReason: reason, changedAt: new Date(now) }, $inc: { version: 1 } },
        { returnDocument: 'after', session });
        if (!status) throw new AppError(409, 'VERSION_CONFLICT', 'Sitter status changed before this decision');
        await Audit.create([{
          actorId: new Types.ObjectId(actor.userId), actorRoles: [...actor.roles],
          action: action === 'SUSPEND' ? 'SITTER_SUSPENDED' : 'SITTER_REINSTATED',
          resourceId: id, occurredAt: new Date(now), reasonDigest: hash(lookupSecret, `sitter-status-reason\0${reason}`),
          idempotencyDigest, payloadDigest, resultVersion: status.version, resultUserId: status.userId,
          correlationId: correlationId ?? null
        }], { session });
        return { applicationId: id.toString(), userId: status.userId.toString(),
          status: status.status, version: status.version, replayed: false };
      }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) {
      const replay = await Audit.findOne({ resourceId: id, idempotencyDigest })
        .select('+idempotencyDigest +payloadDigest').lean();
      if (replay) {
        if (!sameDigest(replay.payloadDigest, payloadDigest)) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This status decision key was already used');
        }
        return { applicationId: id.toString(), userId: replay.resultUserId.toString(),
          status: replay.action === 'SITTER_SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
          version: replay.resultVersion, replayed: true };
      }
      throw error;
    }
  }

  async function documentReadCapability({ applicationId, documentId, actor, correlationId }) {
    assertAdmin(actor);
    if (!Types.ObjectId.isValid(applicationId) || typeof documentId !== 'string' || documentId.length > 128) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Document not found');
    }
    if (typeof privateMedia?.createReadCapability !== 'function') {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private document storage is not configured');
    }
    const id = new Types.ObjectId(applicationId);
    const now = clock();
    const windowStart = new Date(Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000));
    const application = await Applicant.findOne({ _id: id, 'privateDocuments.documentId': documentId })
      .select('+privateDocuments.storageRef').lean();
    const document = application?.privateDocuments.find(item => item.documentId === documentId);
    if (!document) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Document not found');
    const actorId = new Types.ObjectId(actor.userId);
    let recorded = false;
    for (let attempt = 0; attempt < 2 && !recorded; attempt += 1) {
      try {
        await connection.transaction(async session => {
          const quota = await DownloadQuota.findOneAndUpdate({ actorId, windowStart },
            { $inc: { count: 1 } }, { upsert: true, returnDocument: 'after', session });
          if (!quota || quota.count > MAX_DOCUMENT_VIEWS_PER_HOUR) {
            throw new AppError(429, 'RATE_LIMITED', 'Document view limit reached');
          }
          await Audit.create([{
            actorId, actorRoles: [...actor.roles],
            action: 'APPLICATION_DOCUMENT_REQUESTED', resourceId: id, occurredAt: new Date(now),
            state: application.state, documentId, correlationId: correlationId ?? null
          }], { session });
        }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        recorded = true;
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (error?.code !== 11000 || attempt > 0) throw error;
      }
    }
    const capability = await privateMedia.createReadCapability({ storageRef: document.storageRef, expiresInSeconds: 60 });
    if (!capability || typeof capability.url !== 'string' || !capability.url.startsWith('https://')) {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private document storage is unavailable');
    }
    return { url: capability.url, expiresAt: capability.expiresAt ?? null };
  }

  async function startInterview(input) {
    assertAdmin(input.actor);
    return changeToReview({ ...input, targetState: 'INTERVIEW' });
  }
  return Object.freeze({ submit, list, get, startReview, startInterview, decide, changeSitterStatus, documentReadCapability });
}
