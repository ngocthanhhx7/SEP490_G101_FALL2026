export class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function metadata(req) {
  return { schemaVersion: 1, serverNow: new Date().toISOString(), correlationId: req.requestId };
}

export function errorPayload(req, code, message, details = {}) {
  return { error: { code, message, ...details }, meta: metadata(req) };
}
