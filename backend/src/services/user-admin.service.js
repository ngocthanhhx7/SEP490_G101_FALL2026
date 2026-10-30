import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../utils/app-error.js';

const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);
const STATES = new Set(['ACTIVE', 'LOCKED', 'SUSPENDED']);
const ACTIONS = new Set(['LOCK', 'UNLOCK']);
const MAX_LIMIT = 50;

function invalid(message = 'Account query is invalid') {
  throw new AppError(422, 'VALIDATION_FAILED', message);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskContact(channel, value) {
  if (channel === 'EMAIL') {
    const separator = value.lastIndexOf('@');
    if (separator < 1) return '••••';
    return `${value.slice(0, 1)}•••${value.slice(separator)}`;
  }
  const digits = value.replace(/\D/g, '');
  return `${value.startsWith('+') ? '+' : ''}••••••${digits.slice(-4)}`;
}

function filterFingerprint({ search, role, state, limit }) {
  return createHash('sha256').update(JSON.stringify({ search: search.toLowerCase(), role, state, limit })).digest('base64url');
}

function createCursorCodec(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new TypeError('A cursor signing secret is required');
  }
  const key = Buffer.from(secret, 'utf8');
  function sign(payload) {
    return createHmac('sha256', key).update(`user-list-cursor\0${payload}`).digest('base64url');
  }
  return Object.freeze({
    encode(position, fingerprint) {
      const payload = Buffer.from(JSON.stringify({ ...position, fingerprint })).toString('base64url');
      return `${payload}.${sign(payload)}`;
    },
    decode(value, fingerprint) {
      if (typeof value !== 'string' || value.length > 1024) invalid('Page cursor is invalid');
      const [payload, signature, extra] = value.split('.');
      if (!payload || !signature || extra !== undefined) invalid('Page cursor is invalid');
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(signature);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) invalid('Page cursor is invalid');
      let decoded;
      try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
      catch { invalid('Page cursor is invalid'); }
      if (decoded?.fingerprint !== fingerprint || typeof decoded.createdAt !== 'string'
        || !Number.isFinite(Date.parse(decoded.createdAt)) || !Types.ObjectId.isValid(decoded.id)) {
        invalid('Page cursor does not match these filters');
      }
      return { createdAt: new Date(decoded.createdAt), id: new Types.ObjectId(decoded.id) };
    }
  });
}

function normalizeListQuery(query, allowedKeys) {
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !allowedKeys.has(key))) invalid();
  const search = query.search === undefined ? '' : query.search;
  const role = query.role === undefined ? '' : query.role;
  const state = query.state === undefined ? '' : query.state;
  const limitText = query.limit === undefined ? '20' : query.limit;
  const cursor = query.cursor === undefined ? '' : query.cursor;
  if (typeof search !== 'string' || search.trim().length > 100
    || typeof role !== 'string' || (role && !ROLES.has(role))
    || typeof state !== 'string' || (state && !STATES.has(state))
    || typeof limitText !== 'string' || !/^[1-9]\d{0,2}$/.test(limitText)
    || typeof cursor !== 'string') invalid();
  const limit = Number(limitText);
  if (limit > MAX_LIMIT) invalid(`Page size cannot exceed ${MAX_LIMIT}`);
  return { search: search.trim(), role, state, limit, cursor };
}

export function createUserAdminService({ connection, User, Contact, Audit, sessionService,
  contactCrypto, cursorSecret, clock = Date.now }) {
  if (!connection?.transaction || !User || !Contact || !Audit
    || typeof sessionService?.revokeUserSessions !== 'function'
    || typeof contactCrypto?.decrypt !== 'function'
    || typeof clock !== 'function') throw new TypeError('User administration dependencies are required');
  const cursor = createCursorCodec(cursorSecret);

  async function contactViews(users) {
    if (!users.length) return new Map();
    const contacts = await Contact.find({ userId: { $in: users.map(user => user._id) }, state: 'VERIFIED' })
      .select('userId channel +canonicalCiphertext').sort({ channel: 1, createdAt: 1 }).lean();
    const grouped = new Map(users.map(user => [user._id.toString(), []]));
    for (const contact of contacts) {
      const value = contactCrypto.decrypt(contact.canonicalCiphertext);
      grouped.get(contact.userId.toString())?.push({ channel: contact.channel, maskedValue: maskContact(contact.channel, value) });
    }
    return grouped;
  }

  async function views(users) {
    const contacts = await contactViews(users);
    return users.map(user => ({
      id: user._id.toString(), displayName: user.displayName, roles: [...user.roles],
      state: user.state, version: user.version,
      createdAt: new Date(user.createdAt).toISOString(), updatedAt: new Date(user.updatedAt).toISOString(),
      contacts: contacts.get(user._id.toString()) ?? []
    }));
  }

  async function list(query) {
    const filters = normalizeListQuery(query, new Set(['search', 'role', 'state', 'limit', 'cursor']));
    const fingerprint = filterFingerprint(filters);
    const conditions = [{ synthetic: { $ne: true } }];
    if (filters.role) conditions.push({ roles: filters.role });
    if (filters.state) conditions.push({ state: filters.state });
    if (filters.search) {
      conditions.push({ displayName: new RegExp(escapeRegex(filters.search), 'i') });
    }
    if (filters.cursor) {
      const position = cursor.decode(filters.cursor, fingerprint);
      conditions.push({ $or: [
        { createdAt: { $lt: position.createdAt } },
        { createdAt: position.createdAt, _id: { $lt: position.id } }
      ] });
    }
    const users = await User.find({ $and: conditions }).select('displayName roles state version createdAt updatedAt')
      .sort({ createdAt: -1, _id: -1 }).limit(filters.limit + 1).lean();
    const hasMore = users.length > filters.limit;
    const page = users.slice(0, filters.limit);
    const nextCursor = hasMore && page.length
      ? cursor.encode({ createdAt: new Date(page.at(-1).createdAt).toISOString(), id: page.at(-1)._id.toString() }, fingerprint)
      : null;
    return { users: await views(page), nextCursor };
  }

  async function getById(userId) {
    if (!Types.ObjectId.isValid(userId)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Account not found');
    const user = await User.findOne({ _id: new Types.ObjectId(userId), synthetic: { $ne: true } })
      .select('displayName roles state version createdAt updatedAt').lean();
    if (!user) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Account not found');
    return (await views([user]))[0];
  }

  async function decide({ userId, body, actor }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 3 || !Object.hasOwn(body, 'action')
      || !Object.hasOwn(body, 'reason') || !Object.hasOwn(body, 'expectedVersion')) invalid('Account decision is invalid');
    const { action, reason: submittedReason, expectedVersion } = body;
    if (!ACTIONS.has(action) || typeof submittedReason !== 'string'
      || submittedReason.trim().length < 3 || submittedReason.trim().length > 1000
      || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0
      || !Types.ObjectId.isValid(userId)) invalid('Account decision is invalid');
    if (!actor?.userId || actor.state !== 'ACTIVE' || !actor.roles?.includes('ADMIN')) {
      throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    }

    const sourceState = action === 'LOCK' ? 'ACTIVE' : 'LOCKED';
    const targetState = action === 'LOCK' ? 'LOCKED' : 'ACTIVE';
    const auditAction = action === 'LOCK' ? 'USER_LOCKED' : 'USER_UNLOCKED';
    const reason = submittedReason.trim();
    return connection.transaction(async session => {
      const user = await User.findOneAndUpdate({
        _id: new Types.ObjectId(userId), synthetic: { $ne: true }, state: sourceState, version: expectedVersion
      }, { $set: { state: targetState }, $inc: { authEpoch: 1, version: 1 } }, {
        returnDocument: 'after', session
      });
      if (!user) {
        const exists = await User.exists({ _id: new Types.ObjectId(userId), synthetic: { $ne: true } }).session(session);
        if (!exists) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Account not found');
        throw new AppError(409, 'VERSION_CONFLICT', 'Account changed before the decision was applied');
      }
      await sessionService.revokeUserSessions(user._id.toString(), { session });
      await Audit.create([{
        actorId: new Types.ObjectId(actor.userId), action: auditAction, resourceType: 'user',
        resourceId: user._id, reason, occurredAt: new Date(clock())
      }], { session });
      return user.toObject();
    }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  }

  async function changeRoles({ userId, body, actor }) {
    if (!actor?.userId || actor.state !== 'ACTIVE' || !actor.roles?.includes('ADMIN')) {
      throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 3 || !Object.hasOwn(body, 'roles')
      || !Object.hasOwn(body, 'reason') || !Object.hasOwn(body, 'expectedVersion')
      || !Array.isArray(body.roles) || body.roles.length < 1 || body.roles.length > ROLES.size
      || body.roles.some(role => !ROLES.has(role)) || new Set(body.roles).size !== body.roles.length
      || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 1000
      || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0
      || !Types.ObjectId.isValid(userId)) invalid('Role decision is invalid');
    if (userId.toString().toLowerCase() === actor.userId.toString().toLowerCase()) {
      throw new AppError(409, 'SELF_ROLE_CHANGE_FORBIDDEN', 'Another Admin must change your roles');
    }
    const roles = [...body.roles].sort();
    return connection.transaction(async session => {
      // Serialize with concurrent demotion/locking of the acting Admin.
      const admin = await User.findOneAndUpdate({ _id: actor.userId, roles: 'ADMIN', state: 'ACTIVE', synthetic: { $ne: true } },
        { $inc: { version: 1 } }, { session, returnDocument: 'after' });
      if (!admin) throw new AppError(403, 'FORBIDDEN', 'Administrator permission changed');
      const target = await User.findOne({ _id: userId, synthetic: { $ne: true } }).session(session);
      if (!target) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Account not found');
      if (target.version !== body.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', 'Account changed before the decision was applied');
      if (roles.includes('PET_SITTER') !== target.roles.includes('PET_SITTER')) {
        throw new AppError(409, 'SITTER_ROLE_MANAGED', 'Pet Sitter access is managed through application review and Sitter status');
      }
      const previousRoles = [...target.roles].sort();
      if (roles.join(',') === previousRoles.join(',')) invalid('Select different roles');
      target.roles = roles;
      target.authEpoch += 1;
      target.version += 1;
      await target.save({ session });
      await sessionService.revokeUserSessions(target._id.toString(), { session });
      await Audit.create([{ actorId: new Types.ObjectId(actor.userId), action: 'USER_ROLES_CHANGED', resourceType: 'user',
        resourceId: target._id, reason: body.reason.trim(), previousRoles, roles, occurredAt: new Date(clock()) }], { session });
      return { userId: target._id.toString(), roles: [...target.roles], version: target.version };
    }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  }

  return Object.freeze({ list, getById, decide, changeRoles });
}
