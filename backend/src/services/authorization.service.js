import { AppError } from '../utils/app-error.js';
import { hasRole } from '../middlewares/session.js';

const ACTIONS = new Set(['CREATE', 'READ', 'UPDATE', 'DELETE', 'DECIDE']);
const ID = /^[0-9a-f]{24}$/i;

export function createAuthorizationService({ loadResource, policies = [], audit, clock = Date.now }) {
  if (typeof loadResource !== 'function' || !Array.isArray(policies)
    || typeof audit !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Invalid authorization service dependencies');
  }
  for (const policy of policies) {
    if (!policy || typeof policy.resource !== 'string' || !ACTIONS.has(policy.action)
      || !Array.isArray(policy.roles) || policy.roles.length === 0
      || policy.roles.some(role => !['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'].includes(role))
      || typeof policy.authorize !== 'function') throw new TypeError('Invalid authorization policy');
  }

  async function decide({ actor, action, resourceType, resourceId, context = {} }) {
    const decisionAt = clock();
    let allowed = false;
    let reason = 'POLICY_DENIED';
    let resource;
    if (!actor || actor.state !== 'ACTIVE' || !Array.isArray(actor.roles)
      || actor.roles.length === 0
      || actor.roles.some(item => !['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'].includes(item))) {
      reason = 'INVALID_ACTOR';
    } else if (!ACTIONS.has(action) || typeof resourceType !== 'string'
      || !resourceType || typeof resourceId !== 'string' || !ID.test(resourceId)) {
      reason = 'INVALID_RESOURCE_REQUEST';
    } else {
      resource = await loadResource({ resourceType, resourceId, actor, action, context });
      if (!resource) reason = 'RESOURCE_NOT_FOUND';
      else {
        const candidates = policies.filter(policy => policy.resource === resourceType && policy.action === action
          && policy.roles.some(role => hasRole(actor.roles, role)));
        for (const policy of candidates) {
          const result = await policy.authorize({ actor, resource, context, action, decisionAt });
          if (result === true || result?.allowed === true) {
            allowed = true;
            reason = 'POLICY_ALLOWED';
            break;
          }
          if (result?.conceal === true) reason = 'RESOURCE_NOT_FOUND';
        }
      }
    }

    try {
      await audit({
        actorId: actor?.userId ?? null,
        actorRoles: Array.isArray(actor?.roles) ? [...actor.roles] : [],
        action, resourceType, resourceId, allowed, reason, occurredAt: new Date(decisionAt).toISOString(),
        correlationId: typeof context.correlationId === 'string' ? context.correlationId : undefined
      });
    } catch {
      throw new AppError(503, 'AUTHORIZATION_UNAVAILABLE', 'Authorization is temporarily unavailable');
    }

    if (allowed) return Object.freeze({ allowed: true, resource });
    if (reason === 'INVALID_ACTOR') throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    if (reason === 'INVALID_RESOURCE_REQUEST') throw new AppError(422, 'VALIDATION_FAILED', 'Resource authorization request is invalid');
    if (reason === 'RESOURCE_NOT_FOUND') throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
    throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
  }

  return Object.freeze({ decide });
}

export function requireResourceAuthorization(authorization, { action, resourceType, resourceId = req => req.params.id,
  context = req => ({ correlationId: req.requestId }) } = {}) {
  if (typeof authorization?.decide !== 'function' || !ACTIONS.has(action)
    || typeof resourceType !== 'string' || typeof resourceId !== 'function' || typeof context !== 'function') {
    throw new TypeError('Invalid resource authorization middleware configuration');
  }
  return async (req, _res, next) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    req.authorization = await authorization.decide({
      actor: req.auth, action, resourceType, resourceId: resourceId(req), context: context(req)
    });
    next();
  };
}
