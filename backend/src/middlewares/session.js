import { AppError } from '../utils/app-error.js';

// P06 supplies the real adapter: revocation, authEpoch, expiry and CSRF checks.
export function requireSession(sessionPort) {
  return async (req, _res, next) => {
    const session = await sessionPort.authenticate(req);
    if (!session || session.state !== 'ACTIVE' || !Array.isArray(session.roles) || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() || session.synthetic === true) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    req.auth = Object.freeze(session);
    next();
  };
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
    if (!roles.some(role => req.auth.roles.includes(role) || (role === 'STAFF' && req.auth.roles.includes('ADMIN')))) {
      return next(new AppError(403, 'FORBIDDEN', 'Action is not permitted'));
    }
    next();
  };
}
