import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../utils/app-error.js';
import { identityModels } from '../models/identity.model.js';
import { userModel as createUserModel } from '../models/user.model.js';

const SESSION_COOKIE = 'pwc_session';
const CUSTOMER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const STAFF_SESSION_MS = 12 * 60 * 60 * 1000;
const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);

function keyBuffer(value, name) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < 32) {
    throw new TypeError(`${name} must contain at least 32 bytes`);
  }
  return Buffer.from(value, 'utf8');
}

function digest(key, value, purpose) {
  return createHmac('sha256', key).update(`${purpose}\0${value}`).digest('hex');
}

function equalDigest(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function readCookie(req) {
  const header = req?.headers?.cookie;
  if (typeof header !== 'string' || header.length > 8192) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{40,128}$/.test(value) ? value : null;
  }
  return null;
}

export function createSessionService({ connection, User, models = identityModels(connection),
  tokenSecret, csrfSecret, clock = Date.now, randomBytesImpl = randomBytes }) {
  const sessionKey = keyBuffer(tokenSecret, 'tokenSecret');
  const csrfKey = keyBuffer(csrfSecret, 'csrfSecret');
  const userStore = User ?? createUserModel(connection);
  if (typeof clock !== 'function' || typeof randomBytesImpl !== 'function') throw new TypeError('Invalid session service dependencies');

  function sessionDuration(roles) {
    if (!Array.isArray(roles) || roles.length === 0 || roles.some(role => !ROLES.has(role))) {
      throw new AppError(403, 'FORBIDDEN', 'Account role is not permitted');
    }
    return roles.some(role => role === 'STAFF' || role === 'ADMIN') ? STAFF_SESSION_MS : CUSTOMER_SESSION_MS;
  }

  async function issueInTransaction(user, mongoSession) {
    if (!user || user.state !== 'ACTIVE' || user.synthetic === true) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    const duration = sessionDuration(user.roles);
    const now = clock();
    const token = randomBytesImpl(32).toString('base64url');
    const csrfToken = randomBytesImpl(32).toString('base64url');
    const sessionId = randomUUID();
    const expiresAt = new Date(now + duration);
    await models.AuthSession.create([{
      sessionId, userId: user._id, tokenDigest: digest(sessionKey, token, 'session'),
      csrfDigest: digest(csrfKey, csrfToken, 'csrf'), authEpochAtIssue: user.authEpoch,
      expiresAt, revokedAt: null
    }], { session: mongoSession });
    return Object.freeze({
      sessionId, token, csrfToken, expiresAt: expiresAt.getTime(),
      maxAge: duration, user: Object.freeze({
        id: user._id.toString(), displayName: user.displayName,
        roles: Object.freeze([...user.roles])
      })
    });
  }

  async function authenticate(req) {
    const token = readCookie(req);
    if (!token) return null;
    const now = clock();
    const session = await models.AuthSession.findOne({
      tokenDigest: digest(sessionKey, token, 'session'), revokedAt: null, expiresAt: { $gt: new Date(now) }
    }).select('+tokenDigest +csrfDigest').lean();
    if (!session) return null;
    const user = await userStore.findById(session.userId).select('displayName roles state authEpoch synthetic').lean();
    if (!user || user.state !== 'ACTIVE' || user.synthetic === true
      || user.authEpoch !== session.authEpochAtIssue || !Array.isArray(user.roles)
      || user.roles.length === 0 || user.roles.some(role => !ROLES.has(role))) {
      await models.AuthSession.updateOne({ _id: session._id, revokedAt: null }, { $set: { revokedAt: new Date(now) } });
      return null;
    }
    return Object.freeze({
      userId: user._id.toString(), sessionId: session.sessionId,
      state: user.state, roles: Object.freeze([...user.roles]),
      expiresAt: session.expiresAt.getTime()
    });
  }

  async function getCurrentUser(auth) {
    if (!auth?.sessionId || !Types.ObjectId.isValid(auth.userId)) return null;
    const now = clock();
    const session = await models.AuthSession.findOne({
      sessionId: auth.sessionId,
      userId: new Types.ObjectId(auth.userId),
      revokedAt: null,
      expiresAt: { $gt: new Date(now) }
    }).select('authEpochAtIssue').lean();
    if (!session) return null;

    const user = await userStore.findById(auth.userId).select('displayName roles state authEpoch synthetic').lean();
    if (!user || user.state !== 'ACTIVE' || user.synthetic === true
      || user.authEpoch !== session.authEpochAtIssue || !Array.isArray(user.roles)
      || user.roles.length === 0 || user.roles.some(role => !ROLES.has(role))) return null;
    return Object.freeze({
      id: user._id.toString(),
      displayName: user.displayName,
      roles: Object.freeze([...user.roles])
    });
  }

  async function verifyCsrf(auth, token) {
    if (!auth?.sessionId || typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(token)) return false;
    const session = await models.AuthSession.findOne({
      sessionId: auth.sessionId, revokedAt: null, expiresAt: { $gt: new Date(clock()) }
    }).select('+csrfDigest').lean();
    return Boolean(session && equalDigest(session.csrfDigest, digest(csrfKey, token, 'csrf')));
  }

  async function revoke(req) {
    const token = readCookie(req);
    if (!token) return false;
    const result = await models.AuthSession.updateOne({
      tokenDigest: digest(sessionKey, token, 'session'), revokedAt: null
    }, { $set: { revokedAt: new Date(clock()) } });
    return result.modifiedCount === 1;
  }

  async function revokeUserSessions(userId, { session: mongoSession } = {}) {
    if (!Types.ObjectId.isValid(userId)) throw new AppError(422, 'VALIDATION_FAILED', 'User reference is invalid');
    const result = await models.AuthSession.updateMany({
      userId: new Types.ObjectId(userId), revokedAt: null
    }, { $set: { revokedAt: new Date(clock()) } }, mongoSession ? { session: mongoSession } : {});
    return result.modifiedCount;
  }

  function setCookie(res, issued, { secure = true } = {}) {
    res.cookie(SESSION_COOKIE, issued.token, {
      httpOnly: true, secure, sameSite: 'lax', path: '/',
      maxAge: issued.maxAge
    });
  }

  function clearCookie(res, { secure = true } = {}) {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  }

  return Object.freeze({
    authenticate, getCurrentUser, verifyCsrf, issueInTransaction, revoke, revokeUserSessions,
    setCookie, clearCookie, cookieName: SESSION_COOKIE
  });
}

export async function lockUserAndRevokeSessions({ connection, userModel, models = identityModels(connection),
  userId, expectedVersion, actor, reason, authorize, audit, clock = Date.now }) {
  if (!Types.ObjectId.isValid(userId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Account lock request is invalid');
  }
  if (typeof actor?.userId !== 'string' || actor.state !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 1000
    || typeof authorize !== 'function' || typeof audit !== 'function' || typeof clock !== 'function') {
    throw new AppError(422, 'VALIDATION_FAILED', 'Account lock decision is invalid');
  }
  const decision = await authorize({ actor, action: 'DECIDE', resourceType: 'user', resourceId: userId, context: { reason: reason.trim() } });
  if (decision !== true && decision?.allowed !== true) {
    throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
  }
  return connection.transaction(async mongoSession => {
    const user = await userModel.findOneAndUpdate({
      _id: new Types.ObjectId(userId), state: 'ACTIVE', version: expectedVersion
    }, { $set: { state: 'LOCKED' }, $inc: { authEpoch: 1, version: 1 } }, {
      returnDocument: 'after', session: mongoSession
    });
    if (!user) throw new AppError(409, 'VERSION_CONFLICT', 'Account changed before the lock decision');
    await models.AuthSession.updateMany({ userId: user._id, revokedAt: null }, {
      $set: { revokedAt: new Date(clock()) }
    }, { session: mongoSession });
    await audit({
      actorId: actor.userId, action: 'USER_LOCKED', resourceType: 'user', resourceId: userId,
      reason: reason.trim(), occurredAt: new Date(clock()).toISOString()
    }, { session: mongoSession });
    return user;
  }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
}
