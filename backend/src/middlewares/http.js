import { randomUUID } from 'node:crypto';
import { AppError, errorPayload } from '../utils/app-error.js';

export function requestId(req, res, next) {
  const incoming = req.get('X-Request-ID');
  req.requestId = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(incoming ?? '') ? incoming : randomUUID();
  res.set('X-Request-ID', req.requestId);
  next();
}

export function notFound(_req, _res, next) {
  next(new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found'));
}

export function errorHandler(logger) {
  return (err, req, res, _next) => {
    if (res.headersSent) {
      logger({ event: 'request_error', requestId: req.requestId, status: 500, code: 'STREAM_ERROR' });
      res.destroy();
      return;
    }
    let status = 500, code = 'INTERNAL_ERROR', message = 'Unexpected server error', details = {};
    if (err instanceof AppError) ({ status, code, message, details } = err);
    else if (err.type === 'entity.parse.failed') [status, code, message] = [400, 'BAD_REQUEST', 'Invalid JSON body'];
    else if (err.type === 'entity.too.large') [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds limit'];
    logger({ event: 'request_error', requestId: req.requestId, status, code });
    res.status(status).json(errorPayload(req, code, message, details));
  };
}
