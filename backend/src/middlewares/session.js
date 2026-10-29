import { hasRole } from '../utils/roles.js';
export { hasRole } from '../utils/roles.js';
import { AppError } from '../utils/app-error.js';

const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);

export function requireSession(sessionPort, { clock = Date.now } = {}) {
  if (
    typeof sessionPort?.authenticate !== 'function' ||
    typeof clock !== 'function'
  ) {
    throw new TypeError('A session authentication port and clock are required');
  }
  return async (req, _res, next) => {
    const session = await sessionPort.authenticate(req);
    if (
      !session ||
      session.state !== 'ACTIVE' ||
      session.synthetic === true ||
      !Array.isArray(session.roles) ||
      session.roles.length === 0 ||
      session.roles.some((role) => !ROLES.has(role)) ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= clock()
    ) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    req.auth = Object.freeze({
      userId: session.userId,
      sessionId: session.sessionId,
      state: session.state,
      roles: Object.freeze([...new Set(session.roles)]),
      expiresAt: session.expiresAt
    });
    next();
  };
}

export function requireRoles(...roles) {
  if (roles.length === 0 || roles.some((role) => !ROLES.has(role))) {
    throw new TypeError('At least one supported role is required');
  }
  return (req, _res, next) => {
    if (!req.auth)
      return next(
        new AppError(401, 'UNAUTHENTICATED', 'Authentication required')
      );
    if (!roles.some((role) => hasRole(req.auth.roles, role))) {
      return next(new AppError(403, 'FORBIDDEN', 'Action is not permitted'));
    }
    next();
  };
}

export function requireCsrf(sessionPort, { allowedOrigins } = {}) {
  if (typeof sessionPort?.verifyCsrf !== 'function') {
    throw new TypeError('A CSRF verification port is required');
  }
  if (
    allowedOrigins !== undefined &&
    (!Array.isArray(allowedOrigins) ||
      allowedOrigins.some((origin) => typeof origin !== 'string'))
  ) {
    throw new TypeError('Allowed origins must be an array of origins');
  }
  return async (req, _res, next) => {
    const origin = req.get('origin');
    const expectedOrigin = `${req.protocol}://${req.get('host')}`;
    const originAllowed =
      typeof origin === 'string' &&
      (() => {
        try {
          const parsed = new URL(origin);
          return (
            parsed.origin === origin &&
            (allowedOrigins
              ? allowedOrigins.includes(parsed.origin)
              : parsed.origin === expectedOrigin)
          );
        } catch {
          return false;
        }
      })();
    if (
      !req.auth ||
      !originAllowed ||
      typeof req.get('x-csrf-token') !== 'string' ||
      !(await sessionPort.verifyCsrf(req.auth, req.get('x-csrf-token')))
    ) {
      throw new AppError(403, 'CSRF_REJECTED', 'Request verification failed');
    }
    next();
  };
}
