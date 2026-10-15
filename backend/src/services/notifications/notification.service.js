import { createHash } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';

const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);
const CHANNELS = new Set(['IN_APP', 'EMAIL', 'SMS', 'PUSH']);
const SENSITIVE_KEY = /(password|token|secret|otp|code|medical|health|diagnos|document|identity|national|access|address|phone|email|credential|private)/i;
const SAFE_META_KEY = /^[a-z][a-zA-Z0-9_]{0,31}$/;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_PATH = /^\/[a-zA-Z0-9/_:.?=&%-]{0,240}$/;
const MAX_PAGE_SIZE = 100;

function invalid(message = 'Notification request is invalid') {
  throw new AppError(422, 'VALIDATION_FAILED', message);
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) invalid(`${label} is invalid`);
  return value;
}

function instant(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(`${label} is invalid`);
  return date;
}

function safeText(value, label, max = 4000) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max
    || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) invalid(`${label} is invalid`);
  if (/(?:mã\s*vào\s*nhà|access\s*code|medical|diagnos|health\s*record|giấy\s*tờ|cccd|passport)/i.test(value)) invalid(`${label} contains private data`);
  return value;
}

function actorScope(actor) {
  if (!actor || actor.state !== 'ACTIVE' || typeof actor.userId !== 'string'
    || !SAFE_ID.test(actor.userId) || !Array.isArray(actor.roles) || actor.roles.length === 0
    || actor.roles.some(role => !ROLES.has(role))) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  return { recipientId: actor.userId, roles: [...new Set(actor.roles)] };
}

function assertMeta(value, path = 'metadata') {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${path} is invalid`);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_META_KEY.test(key) || SENSITIVE_KEY.test(key)) invalid(`${path} contains private data`);
    if (typeof item === 'string') {
      if (item.length > 200 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(item)) invalid(`${path} is invalid`);
      result[key] = item;
    } else if (Number.isSafeInteger(item) || typeof item === 'boolean') {
      result[key] = item;
    } else if (item !== null) {
      invalid(`${path} is invalid`);
    } else result[key] = null;
  }
  return result;
}

function safeDeepLink(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !SAFE_PATH.test(value) || value.startsWith('//')
    || /(?:access|token|secret|document|medical|health|address|phone|email)/i.test(value)) {
    invalid('deepLink is invalid');
  }
  return value;
}

function safeChannel(value) {
  if (value === undefined) return 'IN_APP';
  if (typeof value !== 'string' || !CHANNELS.has(value)) invalid('channel is invalid');
  return value;
}

function normalizeNotification(row, actor) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  if (String(row.recipientId ?? row.userId) !== actor.userId) return null;
  const role = row.role ?? row.recipientRole;
  if (role !== undefined && (!ROLES.has(role) || !actor.roles.includes(role))) return null;
  const id = row.id ?? row._id ?? row.notificationId;
  if (typeof id !== 'string') return null;
  const createdAt = row.createdAt ? instant(row.createdAt, 'createdAt').toISOString() : null;
  const readAt = row.readAt ? instant(row.readAt, 'readAt').toISOString() : null;
  const data = {
    id, eventType: safeText(row.eventType ?? 'SYSTEM', 'eventType', 80),
    title: safeText(row.title, 'title', 120), message: safeText(row.message, 'message'),
    channel: safeChannel(row.channel), role: role ?? null, readAt, createdAt,
    deepLink: safeDeepLink(row.deepLink), metadata: assertMeta(row.metadata)
  };
  return Object.freeze(data);
}

function normalizeRecipients(recipients) {
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 500) invalid('recipients are invalid');
  const seen = new Set();
  return recipients.map((recipient, index) => {
    const value = typeof recipient === 'string' ? { recipientId: recipient } : recipient;
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`recipient ${index + 1} is invalid`);
    const recipientId = requiredId(value.recipientId ?? value.userId, 'recipientId');
    const role = value.role ?? null;
    if (role !== null && !ROLES.has(role)) invalid('recipient role is invalid');
    const key = `${recipientId}:${role ?? '*'}`;
    if (seen.has(key)) invalid('recipients must be unique');
    seen.add(key);
    return Object.freeze({ recipientId, role });
  });
}

function operationKey(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  requiredId(value, 'idempotencyKey');
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeResult(result, actor) {
  const source = Array.isArray(result) ? { items: result } : result || {};
  const rows = Array.isArray(source.items) ? source.items : [];
  const items = rows.map(row => normalizeNotification(row, actor)).filter(Boolean);
  return Object.freeze({
    items: Object.freeze(items),
    nextCursor: typeof source.nextCursor === 'string' ? source.nextCursor : null,
    unreadCount: Number.isSafeInteger(source.unreadCount) && source.unreadCount >= 0 ? source.unreadCount : null
  });
}

function validateLimit(value) {
  if (value === undefined || value === '') return 20;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_PAGE_SIZE) invalid('limit is invalid');
  return number;
}

export function createNotificationService({ repository, clock = Date.now, pageSize = 20, pushSupport } = {}) {
  if (!repository || typeof repository.list !== 'function' || typeof repository.markRead !== 'function'
    || typeof repository.createEvent !== 'function' || typeof clock !== 'function'
    || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new TypeError('Notification repository, clock and page size are required');
  }
  const inFlight = new Map();

  async function list({ actor, cursor, unreadOnly = false, limit = pageSize } = {}) {
    const scope = actorScope(actor);
    if (cursor !== undefined && cursor !== null && (typeof cursor !== 'string' || cursor.length > 512)) invalid('cursor is invalid');
    if (typeof unreadOnly !== 'boolean') invalid('unreadOnly is invalid');
    const result = await repository.list({ ...scope, cursor: cursor || null, unreadOnly, limit: validateLimit(limit), projection: 'NOTIFICATION_SAFE_V1' });
    return normalizeResult(result, actor);
  }

  async function markRead({ actor, notificationId, idempotencyKey } = {}) {
    const scope = actorScope(actor);
    const id = requiredId(notificationId, 'notificationId');
    const key = operationKey(idempotencyKey, `notification-read:${scope.recipientId}:${id}`);
    const result = await repository.markRead({ ...scope, notificationId: id, idempotencyKey: key, readAt: instant(clock(), 'clock').toISOString() });
    if (!result || result.status === 'NOT_FOUND') throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Notification not found');
    if (result.status === 'FORBIDDEN') throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    if (result.status === 'IDEMPOTENCY_CONFLICT') throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Operation key was already used with different data');
    return Object.freeze({ status: result.status === 'ALREADY_READ' ? 'ALREADY_READ' : 'READ', notificationId: id, readAt: result.readAt ?? new Date(clock()).toISOString() });
  }

  async function publish({ eventId, eventType, title, message, deepLink, metadata, recipients, channel = 'IN_APP', idempotencyKey } = {}) {
    const normalizedEventId = requiredId(eventId ?? idempotencyKey, 'eventId');
    const normalized = {
      eventId: normalizedEventId, eventType: safeText(eventType, 'eventType', 80),
      title: safeText(title, 'title', 120), message: safeText(message, 'message'),
      deepLink: safeDeepLink(deepLink), metadata: assertMeta(metadata), channel: safeChannel(channel),
      recipients: normalizeRecipients(recipients)
    };
    const key = operationKey(idempotencyKey, normalizedEventId);
    const body = { ...normalized, idempotencyKey: key, occurredAt: instant(clock(), 'clock').toISOString() };
    const bodyFingerprint = fingerprint(body);
    const inFlightKey = `${normalizedEventId}:${key}`;
    const existing = inFlight.get(inFlightKey);
    if (existing) {
      if (existing.fingerprint !== bodyFingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Operation key was already used with different data');
      return existing.promise;
    }
    const promise = Promise.resolve().then(async () => {
      const result = await repository.createEvent(body);
      if (result?.status === 'IDEMPOTENCY_CONFLICT') throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Operation key was already used with different data');
      if (result?.status === 'FORBIDDEN') throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
      if (result?.status === 'CREATED' || result?.status === 'ALREADY_EXISTS') {
        return Object.freeze({ status: result.status, eventId: normalizedEventId, notificationIds: Object.freeze(Array.isArray(result.notificationIds) ? [...result.notificationIds] : []) });
      }
      throw new AppError(503, 'NOTIFICATION_UNAVAILABLE', 'Notifications are temporarily unavailable');
    }).finally(() => inFlight.delete(inFlightKey));
    inFlight.set(inFlightKey, { fingerprint: bodyFingerprint, promise });
    return promise;
  }

  async function updatePreferences({ actor, preferences, idempotencyKey } = {}) {
    const scope = actorScope(actor);
    if (typeof repository.updatePreferences !== 'function') throw new AppError(503, 'NOTIFICATION_UNAVAILABLE', 'Notification preferences are unavailable');
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) invalid('preferences are invalid');
    const allowed = ['inApp', 'email', 'sms', 'push'];
    if (Object.keys(preferences).some(key => !allowed.includes(key) || typeof preferences[key] !== 'boolean')) invalid('preferences are invalid');
    const result = await repository.updatePreferences({ ...scope, preferences: { ...preferences }, idempotencyKey: operationKey(idempotencyKey, `notification-preferences:${scope.recipientId}`) });
    if (result?.status === 'FORBIDDEN') throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    return Object.freeze({ preferences: Object.freeze({ ...preferences }) });
  }

  async function registerPushSubscription({ actor, subscription, idempotencyKey } = {}) {
    const scope = actorScope(actor);
    if (typeof repository.savePushSubscription !== 'function') throw new AppError(503, 'PUSH_UNSUPPORTED', 'Web push is not configured');
    if (pushSupport && (await pushSupport()) !== true) throw new AppError(503, 'PUSH_UNSUPPORTED', 'Web push is not supported');
    if (!subscription || typeof subscription !== 'object' || typeof subscription.endpoint !== 'string'
      || !/^https:\/\//.test(subscription.endpoint) || subscription.endpoint.length > 2048
      || !subscription.keys || typeof subscription.keys.p256dh !== 'string' || typeof subscription.keys.auth !== 'string'
      || subscription.keys.p256dh.length > 256 || subscription.keys.auth.length > 256) invalid('push subscription is invalid');
    const result = await repository.savePushSubscription({ ...scope, subscription: {
      endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }
    }, idempotencyKey: operationKey(idempotencyKey, `push-subscription:${scope.recipientId}:${fingerprint(subscription)}`) });
    if (result?.status === 'OPTED_OUT') throw new AppError(409, 'PUSH_OPTED_OUT', 'Push notifications are disabled');
    if (result?.status === 'FORBIDDEN') throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    return Object.freeze({ status: result?.status === 'ALREADY_EXISTS' ? 'ALREADY_EXISTS' : 'SUBSCRIBED' });
  }

  return Object.freeze({ list, markRead, publish, updatePreferences, registerPushSubscription });
}

export { actorScope, normalizeNotification, safeDeepLink };
