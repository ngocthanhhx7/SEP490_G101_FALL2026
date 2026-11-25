import { APPLICATION_INTAKE_COOKIE, createGuestIntakeService } from '../services/applications/guest-intake.service.js';
import { AppError } from '../utils/app-error.js';

function cookie(req) {
  return req.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${APPLICATION_INTAKE_COOKIE}=`))?.slice(APPLICATION_INTAKE_COOKIE.length + 1);
}
export function applicationIntakeMiddleware({ secret, clock, secure = false }) {
  const service = createGuestIntakeService({ secret, clock });
  function sameOrigin(req, _res, next) {
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`))
      return next(new AppError(403, 'FORBIDDEN', 'Request origin is not allowed'));
    next();
  }
  return {
    sameOrigin,
    open(req, res, next) {
      const intake = service.open(cookie(req));
      res.cookie(APPLICATION_INTAKE_COOKIE, intake.token, { httpOnly: true, secure, sameSite: 'strict', path: '/api/v1', maxAge: 7200000 });
      req.applicationIntake = intake;
      next();
    },
    require(req, _res, next) {
      try { req.applicationApplicant = service.authenticate(cookie(req), req.get('X-Application-Token')); next(); }
      catch (error) { next(error); }
    },
    // The image service accepts an owner capability. It does not create an account.
    documentOwner(req, _res, next) { req.auth = req.applicationApplicant; next(); }
  };
}
