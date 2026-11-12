import { createServiceAreaCatalog } from './service-area-catalog.service.js';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { canonicalizeContact } from './contact-crypto.service.js';
import { normalizeVietnamPhone } from './sms-template.service.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { AppError } from '../utils/app-error.js';
import { isSingleRole } from '../utils/roles.js';
import { identityModels } from '../models/identity.model.js';
import { createDomainNotifications } from './notifications/domain-notifications.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REAPPLY_DELAY_MS = 30 * DAY_MS;
const MAX_DOCUMENT_VIEWS_PER_HOUR = 20;
const ALLOWED_STATES = new Set(['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED']);
const ACTIVE_STATES = ['PENDING', 'UNDER_REVIEW', 'INTERVIEW'];
const PAGE_LIMIT = 50;
const SEARCH_CANDIDATE_LIMIT = 500;

function invalid(message = 'Application request is invalid') {
  const field = ['displayName', 'contactValue', 'dateOfBirth', 'identityNumber', 'experience', 'requestedServices', 'workAreas', 'documents', 'employmentType']
    .find(key => message.startsWith(key));
  const labels = {
    displayName: 'Nhập họ và tên hợp lệ, tối đa 100 ký tự.',
    dateOfBirth: 'Chọn ngày sinh hợp lệ.', identityNumber: 'Kiểm tra số giấy tờ định danh (8 đến 20 chữ hoặc số).',
    experience: 'Mô tả kinh nghiệm từ 10 đến 2.000 ký tự.',
    requestedServices: 'Chọn từ 1 đến 30 dịch vụ, không chọn trùng.',
    workAreas: 'Nhập từ 1 đến 10 khu vực, mỗi khu vực tối đa 80 ký tự.',
    documents: 'Cần mặt trước CCCD, mặt sau CCCD, ảnh chân dung và tối đa 5 ảnh bổ sung, không trùng ảnh.',
    employmentType: 'Chọn toàn thời gian hoặc bán thời gian.'
  };
  throw new AppError(422, 'VALIDATION_FAILED', message, field ? { fieldErrors: { [field]: labels[field] ?? 'Kiểm tra thông tin này.' } } : {});
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
  if (!Array.isArray(value) || value.length < 1 || value.length > (field === 'requestedServices' ? 30 : 10)) invalid(`${field} is invalid`);
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

function normalizeDocuments(value, requireComplete = false) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) invalid('documents are required');
  const documents = value.map(document => {
    if (!document || typeof document !== 'object' || Array.isArray(document)
      || Object.keys(document).some(key => !['documentId', 'documentType', 'storageRef'].includes(key))) invalid('documents are invalid');
    const documentId = safeText(document.documentId, { max: 128, field: 'documentId' });
    const documentType = document.documentType;
    if (!['IDENTITY', 'IDENTITY_FRONT', 'IDENTITY_BACK', 'PORTRAIT', 'CERTIFICATE', 'OTHER'].includes(documentType)) invalid('documentType is invalid');
    const storageRef = document.storageRef;
    if (typeof storageRef !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(storageRef)) invalid('storageRef is invalid');
    return { documentId, documentType, storageRef };
  });
  if (requireComplete) {
    if (['IDENTITY_FRONT', 'IDENTITY_BACK', 'PORTRAIT'].some(type => documents.filter(d => d.documentType === type).length !== 1)
      || documents.some(d => d.documentType === 'IDENTITY')
      || documents.filter(d => ['CERTIFICATE', 'OTHER'].includes(d.documentType)).length > 5) invalid('documents must include both identity sides and a portrait');
  } else if (!documents.some(d => ['IDENTITY', 'IDENTITY_FRONT'].includes(d.documentType))) invalid('documents require an identity image');
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

const LIST_SERVICE_AREAS = DEMO_WORK_AREAS.filter(area => area.level !== 'CITY')
  .map(area => ({ id: area.code, name: area.label }));
const LIST_FIELDS = 'displayName contactChannel ageEligible employmentType requestedServices workAreas state reapplyAt createdAt updatedAt version +contactCiphertext +submissionKeyDigest';

function receiptCode(secret, submissionKeyDigest) {
  return createHmac('sha256', secret).update(`application-receipt\0${submissionKeyDigest}`).digest('base64url');
}

function areaFilter(area) {
  const names = [area.id, area.name, area.name.replace(/^Khu vực /u, '')];
  return { workAreas: { $in: names.map(name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } };
}

function phoneSearchTerm(search) {
  const compact = search.replace(/[\s().-]/g, '');
  return /^\+?\d+$/u.test(compact) ? normalizeVietnamPhone(search) ?? compact : null;
}

function phoneMatches(phone, term) {
  const local = phone.startsWith('+84') ? `0${phone.slice(3)}` : phone;
  return phone.includes(term) || local.includes(term);
}

function assertAdmin(actor) {
  if (!actor?.userId || actor.state !== 'ACTIVE' || !isSingleRole(actor.roles) || actor.roles[0] !== 'ADMIN') {
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
    employmentType: application.employmentType ?? null,
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
  contactCrypto, privateMedia, lookupSecret, cursorSecret, registrationPolicyService, applicationMail, employmentDocuments, clock = Date.now }) {
  if (typeof employmentDocuments?.activate !== 'function' || !connection?.transaction || !Applicant || !User || !Audit || !DownloadQuota || !SitterStatus
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
        'identityNumber', 'experience', 'requestedServices', 'workAreas', 'documents', 'policyVersions', 'employmentType'].includes(key))) invalid();
    const employmentType = body.employmentType;
    if (employmentType !== undefined && !['FULL_TIME', 'PART_TIME'].includes(employmentType)) invalid('employmentType is invalid');
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
    const applicationCode = receiptCode(lookupSecret, submissionKeyDigest);
    const trackingCodeDigest = hash(lookupSecret, `application-tracking\0${applicationCode}`);
    const normalizedPayload = {
      displayName, contactChannel, contactLookupKey: contact.lookupKey, identityLookupKey,
      dateOfBirth: body.dateOfBirth, experience, requestedServices, workAreas,
      ...(employmentType ? { employmentType } : {}),
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
      // A matching original request can restore omitted particulars, never guessed historical data.
      if (actor?.userId && String(priorSubmission.ownerUserId) === actor.userId) await Applicant.updateOne({ _id: priorSubmission._id, applicantParticularsCiphertext: { $exists: false } },
        { $set: { applicantParticularsCiphertext: contactCrypto.encrypt(JSON.stringify({ dateOfBirth: body.dateOfBirth, identityNumber: identityValue })) } });
      await Applicant.updateOne({ _id: priorSubmission._id, trackingCodeDigest: { $exists: false } },
        { $set: { trackingCodeDigest } });
      return { id: priorSubmission._id.toString(), state: priorSubmission.state,
        submittedAt: priorSubmission.createdAt.toISOString(), applicationCode, replayed: true };
    }

    normalizeDocuments(body.documents, true);
    const tooEarly = await Applicant.exists({
      $or: [{ contactLookupKey: contact.lookupKey }, { identityLookupKey }, ...(actor?.userId ? [{ ownerUserId: actor.userId }] : [])],
      state: 'REJECTED', reapplyAt: { $gt: new Date(now) }
    });
    if (tooEarly) throw new AppError(409, 'REAPPLY_NOT_AVAILABLE', 'An application cannot be submitted at this time');
    const duplicate = await Applicant.exists({ $or: [
      { activePendingContactKey: contact.lookupKey }, { activePendingIdentityKey: identityLookupKey },
      ...(actor?.userId ? [{ ownerUserId: actor.userId, state: { $in: ACTIVE_STATES } }] : [])
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
          ...(actor?.userId ? { activePendingOwnerUserId: actor.userId } : {}),
          policyConsents,
          displayName, contactChannel, contactCiphertext: contactCrypto.encrypt(contact.canonicalValue),
          contactLookupKey: contact.lookupKey, identityLookupKey,
          applicantParticularsCiphertext: contactCrypto.encrypt(JSON.stringify({ dateOfBirth: body.dateOfBirth, identityNumber: identityValue })),
          activePendingContactKey: contact.lookupKey, activePendingIdentityKey: identityLookupKey,
          ageEligible: true, ageCheckedAt: new Date(now), experience, requestedServices, workAreas,
          ...(employmentType ? { employmentType } : {}),
          privateDocuments: verifiedDocuments, state: 'PENDING', version: 0,
          trackingCodeDigest, submissionKeyDigest, submissionPayloadDigest
        }], { session });
        await applicationMail?.enqueue(created, session);
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
        { activePendingContactKey: contact.lookupKey }, { activePendingIdentityKey: identityLookupKey },
      ...(actor?.userId ? [{ ownerUserId: actor.userId, state: { $in: ACTIVE_STATES } }] : [])
      ] });
      if (duplicatePending || error?.code === 11000) {
        throw new AppError(409, 'APPLICATION_ALREADY_PENDING', 'An application cannot be submitted at this time');
      }
      throw error;
    }
  }

  async function list({ query, actor }) {
    assertAdmin(actor);
    const allowed = new Set(['state', 'limit', 'cursor', 'search', 'employmentType', 'sortOrder', 'serviceArea']);
    if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !allowed.has(key))) invalid();
    const state = query.state === 'ALL' ? '' : query.state ?? '';
    const search = query.search ?? '';
    const limitText = query.limit ?? '20';
    const cursorValue = query.cursor ?? '';
    const employmentType = query.employmentType ?? '';
    const sortOrder = query.sortOrder ?? 'desc';
    const serviceArea = query.serviceArea ?? '';
    if (employmentType && !['FULL_TIME', 'PART_TIME'].includes(employmentType)) invalid('Employment filter is invalid');
    if (state && !ALLOWED_STATES.has(state)) invalid('state is invalid');
    const serviceAreas = [...new Map([...LIST_SERVICE_AREAS,
      ...(await createServiceAreaCatalog(connection).list({ all: true })).map(area => ({ id: area.code, name: area.label }))]
      .map(area => [area.id, area])).values()];
    const area = serviceAreas.find(option => option.id === serviceArea);
    if (typeof search !== 'string' || search.length > 50
      || typeof limitText !== 'string' || !/^[1-9]\d{0,2}$/.test(limitText)
      || typeof cursorValue !== 'string'
      || !['asc', 'desc'].includes(sortOrder) || (serviceArea !== '' && !area)) invalid('Application filters are invalid');
    const limit = Number(limitText);
    if (limit > PAGE_LIMIT) invalid(`Page size cannot exceed ${PAGE_LIMIT}`);
    const term = search.trim().normalize('NFC').toLocaleLowerCase('vi');
    const direction = sortOrder === 'asc' ? 1 : -1;
    const sort = { createdAt: direction, _id: direction };
    const fingerprint = createHash('sha256').update(JSON.stringify({
      state, employmentType, search: term, limit, sortOrder, serviceArea
    })).digest('base64url');
    const position = cursorValue ? cursors.decode(cursorValue, fingerprint) : null;
    const matchingFilter = {
      state: state || { $in: [...ALLOWED_STATES] },
      ...(employmentType && { employmentType }),
      ...(area && areaFilter(area))
    };

    const operator = direction === 1 ? '$gt' : '$lt';
    const pageFilter = position ? { ...matchingFilter, $or: [
      { createdAt: { [operator]: position.createdAt } },
      { createdAt: position.createdAt, _id: { [operator]: position.id } }
    ] } : matchingFilter;
    let rows, totalMatching, continuation = null, searchIncomplete = false;
    if (term) {
      const phoneTerm = phoneSearchTerm(term);
      rows = [];
      const candidates = await Applicant.find(pageFilter).select(LIST_FIELDS).sort(sort)
        .limit(SEARCH_CANDIDATE_LIMIT + 1).maxTimeMS(5000).lean();
      let scanned;
      for (const row of candidates.slice(0, SEARCH_CANDIDATE_LIMIT)) {
        scanned = row;
        const code = row.submissionKeyDigest ? receiptCode(lookupSecret, row.submissionKeyDigest) : null;
        const matches = row.displayName.normalize('NFC').toLocaleLowerCase('vi').includes(term)
          || code?.toLowerCase().includes(term)
          || (phoneTerm && row.contactChannel === 'PHONE' && phoneMatches(contactCrypto.decrypt(row.contactCiphertext), phoneTerm));
        if (matches) rows.push(row);
        if (rows.length > limit) break;
      }
      searchIncomplete = rows.length > limit || candidates.length > SEARCH_CANDIDATE_LIMIT;
      continuation = rows.length > limit ? rows[limit - 1] : candidates.length > SEARCH_CANDIDATE_LIMIT ? scanned : null;
      totalMatching = !position && !searchIncomplete ? rows.length : null;
    } else {
      [rows, totalMatching] = await Promise.all([
        Applicant.find(pageFilter).select(LIST_FIELDS).sort(sort).limit(limit + 1).maxTimeMS(5000).lean(),
        Applicant.countDocuments(matchingFilter).maxTimeMS(5000)
      ]);
      continuation = rows.length > limit ? rows[limit - 1] : null;
    }

    const page = rows.slice(0, limit);
    const items = page.map(row => {
      const contactValue = contactCrypto.decrypt(row.contactCiphertext);
      return {
        id: row._id.toString(), displayName: row.displayName,
        applicationCode: row.submissionKeyDigest ? receiptCode(lookupSecret, row.submissionKeyDigest) : null,
        phoneNumber: row.contactChannel === 'PHONE' ? contactValue : null,
        contact: { channel: row.contactChannel, maskedValue: maskContact(row.contactChannel, contactValue) },
        ageEligible: row.ageEligible, employmentType: row.employmentType ?? null,
        requestedServices: [...row.requestedServices], workAreas: [...row.workAreas],
        state: row.state, reapplyAt: row.reapplyAt?.toISOString() ?? null, version: row.version,
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
      };
    });
    const counts = await Applicant.aggregate([{ $group: { _id: '$state', count: { $sum: 1 } } }]).option({ maxTimeMS: 5000 });
    const byState = Object.fromEntries([...ALLOWED_STATES].map(state => [state, 0]));
    for (const row of counts) if (Object.hasOwn(byState, row._id)) byState[row._id] = row.count;
    return { applications: items, summary: { total: Object.values(byState).reduce((sum, value) => sum + value, 0), byState },
      serviceAreas, totalMatching, searchIncomplete, nextCursor: continuation
      ? cursors.encode(continuation.createdAt, continuation._id, fingerprint) : null };
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
    const transitions = await Audit.find({ resourceId: id, action: { $in: ['APPLICATION_REVIEW_STARTED', 'APPLICATION_DECIDED'] } })
      .sort({ occurredAt: 1, _id: 1 }).select('state occurredAt').lean();
    result.timeline = [{ state: 'PENDING', occurredAt: application.createdAt.toISOString() },
      ...transitions.map(row => ({ state: row.state, occurredAt: row.occurredAt.toISOString() }))];
    result.emailNotifications = applicationMail ? (await applicationMail.list(id)).map(row => ({
      state: row.applicationState, version: row.applicationVersion, deliveryState: row.deliveryState,
      createdAt: row.createdAt.toISOString(), acceptedAt: row.acceptedAt?.toISOString() ?? null, failureCode: row.failureCode
    })) : [];
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
          { $set: { state: targetState }, $inc: { version: 1 } }, { returnDocument: 'after', session }).select('+contactCiphertext');
        if (!application) {
          const found = await Applicant.exists({ _id: id }).session(session);
          if (!found) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
          throw new AppError(409, 'VERSION_CONFLICT', 'Application changed before review started');
        }
        await applicationMail?.enqueue(application, session);
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
          .select('+contactLookupKey +contactCiphertext').session(session).lean();
        if (!current) {
          const found = await Applicant.exists({ _id: id }).session(session);
          if (!found) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Application not found');
          throw new AppError(409, 'VERSION_CONFLICT', 'Application is no longer awaiting a decision');
        }
        if (current.state !== 'INTERVIEW') throw new AppError(409, 'APPLICATION_STAGE_REQUIRED', 'Complete review and interview before a decision');
        let user = null;
        if (action === 'APPROVE') {
          if (current.ownerUserId) {
            const { Contact } = identityModels(connection);
            const verifiedContact = await Contact.exists({ userId: current.ownerUserId, channel: current.contactChannel,
              lookupKey: current.contactLookupKey, state: 'VERIFIED' }).session(session);
            if (!verifiedContact) throw new AppError(409, 'CONTACT_UNAVAILABLE', 'Applicant contact is no longer verified');
            user = await User.findOneAndUpdate({ _id: current.ownerUserId, state: 'ACTIVE', roles: ['CUSTOMER'], synthetic: false },
              { $set: { roles: ['PET_SITTER'] }, $inc: { authEpoch: 1, version: 1 } }, { returnDocument: 'after', session });
            if (!user) throw new AppError(409, 'CONTACT_UNAVAILABLE', 'Applicant account is no longer eligible');
          } else {
            [user] = await User.create([{
              displayName: current.displayName, roles: ['PET_SITTER'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false
            }], { session });
          }
          await employmentDocuments.activate(current, user._id, actor, session);
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
          $unset: { activePendingContactKey: 1, activePendingIdentityKey: 1, activePendingOwnerUserId: 1 },
          $inc: { version: 1 }
        }, { returnDocument: 'after', session });
        if (!application) throw new AppError(409, 'VERSION_CONFLICT', 'Application changed before the decision was applied');
        await applicationMail?.enqueue({ ...current, state, version: application.version }, session);
        await createDomainNotifications({ connection, clock }).application({ applicationId: String(id),
          ownerId: current.ownerUserId ?? user?._id, approved: action === 'APPROVE' }, session);
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

  async function readDocument({ applicationId, documentId, actor, correlationId }) {
    assertAdmin(actor);
    if (!Types.ObjectId.isValid(applicationId) || typeof documentId !== 'string' || documentId.length > 128) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Document not found');
    }
    if (typeof privateMedia?.readDocument !== 'function') {
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
    let content;
    try { content = await privateMedia.readDocument({ storageRef: document.storageRef }); }
    catch { throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private document storage is unavailable'); }
    if (!Buffer.isBuffer(content?.body) || content.body.length === 0 || content.body.length > 5 * 1024 * 1024
      || !['image/jpeg', 'image/png'].includes(content.contentType)) {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private document storage is unavailable');
    }
    return content;
  }

  async function ownerContext(actor, session) {
    if (actor?.state !== 'ACTIVE' || !isSingleRole(actor.roles) || !['CUSTOMER','PET_SITTER'].includes(actor.roles[0]) || !Types.ObjectId.isValid(actor.userId))
      throw new AppError(403,'FORBIDDEN','Applicant account required');
    const user = await User.findOne({ _id:actor.userId,state:'ACTIVE',synthetic:false,...(actor.authEpoch !== undefined ? {authEpoch:actor.authEpoch} : {}) }).session(session ?? null).lean();
    if (!user || !isSingleRole(user.roles) || !['CUSTOMER','PET_SITTER'].includes(user.roles[0])) throw new AppError(403,'FORBIDDEN','Current applicant account required');
    if(session){const locked=await connection.collection('users').findOneAndUpdate({_id:user._id,state:'ACTIVE',synthetic:false,authEpoch:user.authEpoch,roles:user.roles},{$inc:{applicationGuard:1}},{session,returnDocument:'after'});if(!locked)throw new AppError(403,'FORBIDDEN','Current applicant account required');}
    const contacts = await identityModels(connection).Contact.find({userId:actor.userId,state:'VERIFIED'}).select('+lookupKey').session(session ?? null).lean();
    const filter = {$or:[{ownerUserId:actor.userId},{ownerUserId:null,contactLookupKey:{$in:contacts.map(row=>row.lookupKey)}}]};
    return {filter,contacts};
  }
  async function getMine({actor}) {
    const {filter}=await ownerContext(actor);
    const row=await Applicant.findOne(filter).sort({createdAt:-1,_id:-1}).select('+contactCiphertext +applicantParticularsCiphertext').lean();
    if (!row) return {application:null};
    const particulars=row.applicantParticularsCiphertext ? JSON.parse(contactCrypto.decrypt(row.applicantParticularsCiphertext)) : {};
    const transitions=await Audit.find({resourceId:row._id,action:{$in:['APPLICATION_SUBMITTED','APPLICATION_UPDATED','APPLICATION_REVIEW_STARTED','APPLICATION_DECIDED']}}).sort({occurredAt:1,_id:1}).select('action state occurredAt').limit(100).lean();
    return {application:{id:String(row._id),state:row.state,version:row.version,canEdit:row.state==='PENDING',displayName:row.displayName,
      contact:{channel:row.contactChannel,value:contactCrypto.decrypt(row.contactCiphertext)},dateOfBirth:particulars.dateOfBirth??'',identityNumber:particulars.identityNumber??'',
      employmentType:row.employmentType??'',experience:row.experience,requestedServices:row.requestedServices,workAreas:row.workAreas,
      documents:row.privateDocuments.map(d=>({documentId:d.documentId,documentType:d.documentType})),submittedAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
      rejectionReason:row.state==='REJECTED'?row.decisionReason:null,reapplyAt:row.reapplyAt?.toISOString()??null,
      timeline:transitions.map(t=>({action:t.action,state:t.state,at:t.occurredAt.toISOString()}))}};
  }
  async function updateMine({actor,body,idempotencyKey,correlationId}) {
    const {filter}=await ownerContext(actor);
    const keys=['applicationId','expectedVersion','displayName','dateOfBirth','identityNumber','employmentType','experience','requestedServices','workAreas','documents'];
    if (!body || Object.keys(body).some(key=>!keys.includes(key)) || keys.some(key=>!Object.hasOwn(body,key)) || !Types.ObjectId.isValid(body.applicationId) || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion<0) invalid();
    const displayName=safeText(body.displayName,{max:100,field:'displayName'}),identityValue=canonicalIdentity(body.identityNumber),now=clock();
    if (!isAdult(body.dateOfBirth,now)) throw new AppError(422,'AGE_REQUIREMENT_NOT_MET','Applicant must be at least 18');
    if (!['FULL_TIME','PART_TIME'].includes(body.employmentType)) invalid('employmentType is invalid');
    const owned=await Applicant.findOne({...filter,_id:body.applicationId}).select('+privateDocuments.storageRef').lean();
    if(!owned)throw new AppError(404,'RESOURCE_NOT_FOUND','Application unavailable');
    const resolved=Array.isArray(body.documents)?body.documents.map(d=>{const old=owned.privateDocuments.find(x=>x.documentId===d?.documentId&&x.documentType===d?.documentType);
      return old&&d.storageRef===d.documentId?{...d,storageRef:old.storageRef}:d;}):body.documents;
    const experience=safeText(body.experience,{min:10,max:2000,field:'experience'}),requestedServices=stringList(body.requestedServices,'requestedServices'),workAreas=stringList(body.workAreas,'workAreas'),documents=normalizeDocuments(resolved,true);
    const key=validateIdempotencyKey(idempotencyKey),id=new Types.ObjectId(body.applicationId),idempotencyDigest=hash(lookupSecret,'application-owner-update\0'+actor.userId+'\0'+key),payloadDigest=hashPayload(lookupSecret,body);
    const replay=async session=>{
      const previous=await Audit.findOne({resourceId:id,idempotencyDigest,actorId:actor.userId}).select('+payloadDigest').session(session??null).lean();
      if(!previous)return null;
      if(!sameDigest(previous.payloadDigest,payloadDigest))throw new AppError(409,'IDEMPOTENCY_CONFLICT','Operation key reused');
      return {id:String(id),state:previous.state,version:previous.resultVersion,replayed:true};
    };
    if(!await Applicant.exists({...filter,_id:id}))throw new AppError(404,'RESOURCE_NOT_FOUND','Application unavailable');
    const prior=await replay();if(prior)return prior;
    const existing=await Applicant.findOne({...filter,_id:id}).select('+contactLookupKey +privateDocuments.storageRef').lean();
    if(existing.state!=='PENDING')throw new AppError(409,'APPLICATION_EDIT_CLOSED','Review has already started');
    const retained=documents.filter(d=>existing.privateDocuments.some(old=>old.documentId===d.documentId&&old.documentType===d.documentType&&old.storageRef===d.storageRef));
    const added=documents.filter(d=>!retained.includes(d));
    if(added.length){const verified=await privateMedia.verifyApplicantDocuments({documents:added,contactLookupKey:existing.contactLookupKey,actor});
      if(!Array.isArray(verified)||verified.length!==added.length||verified.some(d=>!added.some(x=>x.documentId===d.documentId&&x.storageRef===d.storageRef&&x.documentType===d.documentType)))throw new AppError(503,'PROVIDER_UNAVAILABLE','Private documents not verified');}

    try{return await connection.transaction(async session=>{
      const fresh=await ownerContext(actor,session),again=await replay(session);if(again)return again;
      const identityLookupKey=hash(lookupSecret,'applicant-identity\0'+identityValue);
      if(await Applicant.exists({_id:{$ne:id},identityLookupKey,state:'REJECTED',reapplyAt:{$gt:new Date(now)}}).session(session))throw new AppError(409,'REAPPLY_NOT_AVAILABLE','Identity remains in reapply cooldown');
      if(await Applicant.exists({_id:{$ne:id},identityLookupKey,state:{$in:ACTIVE_STATES}}).session(session))throw new AppError(409,'APPLICATION_ALREADY_PENDING','Identity already has pending application');
      const saved=await Applicant.findOneAndUpdate({...fresh.filter,_id:id,state:'PENDING',version:body.expectedVersion},{$set:{displayName,experience,requestedServices,workAreas,employmentType:body.employmentType,
        identityLookupKey,activePendingIdentityKey:identityLookupKey,ageEligible:true,ageCheckedAt:new Date(now),privateDocuments:documents,
        applicantParticularsCiphertext:contactCrypto.encrypt(JSON.stringify({dateOfBirth:body.dateOfBirth,identityNumber:identityValue}))},$inc:{version:1}},{session,returnDocument:'after'}).lean();
      if(!saved)throw new AppError(409,'VERSION_CONFLICT','Application changed; reload');
      await Audit.create([{actorId:actor.userId,actorRoles:actor.roles,action:'APPLICATION_UPDATED',resourceId:id,occurredAt:new Date(now),state:'PENDING',idempotencyDigest,payloadDigest,resultVersion:saved.version,correlationId:correlationId??null}],{session});
      return {id:String(id),state:'PENDING',version:saved.version,replayed:false};
    });}catch(error){if(error.code===11000){const result=await replay();if(result)return result;throw new AppError(409,'APPLICATION_ALREADY_PENDING','Pending identity conflict');}throw error;}
  }

  async function startInterview(input) {
    assertAdmin(input.actor);
    return changeToReview({ ...input, targetState: 'INTERVIEW' });
  }
  return Object.freeze({ getMine, updateMine, submit, list, get, startReview, startInterview, decide, changeSitterStatus, readDocument });
}
