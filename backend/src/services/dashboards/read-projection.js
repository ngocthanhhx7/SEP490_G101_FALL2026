import { AppError } from '../../utils/app-error.js';
import { hasRole } from '../../middlewares/session.js';

export const ID = /^[a-f0-9]{24}$/;
export const fail = (status, code) => { throw new AppError(status, code, code); };
export const text = (value, max = 200) => typeof value === 'string' && value.length <= max;
export function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(503, 'INVALID_PROJECTION');
  return value;
}
export function authorize(actor, roles) {
  if (!actor || actor.state !== 'ACTIVE' || !ID.test(actor.userId ?? '')
    || !Number.isFinite(actor.expiresAt) || actor.expiresAt <= Date.now()) fail(401, 'UNAUTHENTICATED');
  if (!roles.some(role => hasRole(actor.roles, role))) fail(403, 'FORBIDDEN');
}
export function filters(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !['from', 'to', 'cursor', 'limit', 'search'].includes(key))) fail(422, 'VALIDATION_FAILED');
  const result = { limit: 20 };
  if (query.limit !== undefined) {
    if (!/^[1-9][0-9]?$/.test(String(query.limit)) || Number(query.limit) > 50) fail(422, 'VALIDATION_FAILED');
    result.limit = Number(query.limit);
  }
  for (const key of ['from', 'to']) {
    if (query[key] === undefined || query[key] === '') continue;
    const value = query[key];
    if (!text(value, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(422, 'VALIDATION_FAILED');
    result[key] = value;
  }
  if (result.from && result.to && result.from > result.to) fail(422, 'VALIDATION_FAILED');
  if (query.cursor !== undefined) {
    if (!text(query.cursor, 512) || !/^[A-Za-z0-9_-]+$/.test(query.cursor)) fail(422, 'VALIDATION_FAILED');
    result.cursor = query.cursor;
  }
  if (query.search !== undefined) {
    if (!text(query.search, 80) || /[\u0000-\u001f]/.test(query.search)) fail(422, 'VALIDATION_FAILED');
    result.search = query.search.trim(); // Repository must use escaped/literal indexed search.
  }
  return { ...result, timeZone: 'Asia/Ho_Chi_Minh' };
}
export function date(value) {
  if (!text(value, 35) || !/Z$|[+-]\d{2}:\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value))) fail(503, 'INVALID_PROJECTION');
  return new Date(value).toISOString();
}
export function createProjectionReader({ kind, roles, repository, project, financial = false }) {
  return Object.freeze({ async read({ actor, query, targetId } = {}) {
    authorize(actor, roles);
    const normalized = filters(query);
    if (targetId !== undefined && !ID.test(targetId)) fail(422, 'VALIDATION_FAILED');
    // Identity and scope are derived from the authenticated session, never query parameters.
    const scope = { kind, userId: actor.userId, targetId: targetId ?? actor.userId };
    if (typeof repository?.readSnapshot !== 'function') return { pending: true, kind };
    const snapshot = await repository.readSnapshot({ scope, query: normalized });
    if (!snapshot || snapshot.ready !== true) return { pending: true, kind };
    if (snapshot.scope?.kind !== kind || snapshot.scope?.userId !== scope.userId
      || snapshot.scope?.targetId !== scope.targetId) fail(503, 'INVALID_PROJECTION');
    if (financial && (!text(snapshot.policyVersion, 128) || !snapshot.policyVersion
      || !Array.isArray(snapshot.decisionIds) || snapshot.decisionIds.length)) return { pending: true, kind };
    if (!Array.isArray(snapshot.items) || snapshot.items.length > normalized.limit
      || !(snapshot.nextCursor === null || (text(snapshot.nextCursor, 512)
        && /^[A-Za-z0-9_-]+$/.test(snapshot.nextCursor)))) fail(503, 'INVALID_PROJECTION');
    if (snapshot.items.some(row => !row || typeof row !== 'object' || !ID.test(row.id ?? ''))
      || new Set(snapshot.items.map(row => row.id)).size !== snapshot.items.length) fail(503, 'INVALID_PROJECTION');
    if (!text(snapshot.sourceVersion, 128) || !snapshot.sourceVersion) fail(503, 'INVALID_PROJECTION');
    const data = project(snapshot, scope);
    return { data: { ...data, kind, asOf: date(snapshot.asOf), sourceVersion: snapshot.sourceVersion,
      timeZone: normalized.timeZone, nextCursor: snapshot.nextCursor } };
  } });
}
export function visitRows(snapshot, scope, ownerField) {
  return snapshot.items.map(row => {
    if (!ID.test(row.id ?? '') || !text(row.state, 64) || !row.state
      || (ownerField && row[ownerField] !== scope.userId)) fail(503, 'INVALID_PROJECTION');
    return { id: row.id, state: row.state, startsAt: date(row.startsAt) };
  });
}
export function metrics(snapshot, names) {
  return names.map(([key, label]) => ({ key, label, value: integer(snapshot.metrics?.[key]) }));
}
