import { AppError } from '../utils/app-error.js';
export function requireSameOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (
    req.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== `${req.protocol}://${req.get('host')}`)
  )
    return next(
      new AppError(403, 'FORBIDDEN', 'Request origin is not allowed')
    );
  next();
}
