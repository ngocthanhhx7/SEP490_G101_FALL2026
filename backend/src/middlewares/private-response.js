export function privateResponse(_req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Cookie');
  next();
}
