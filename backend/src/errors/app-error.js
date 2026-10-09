export class AppError extends Error {
  constructor(code, httpStatus, extras = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.extras = extras;
    Error.captureStackTrace?.(this, AppError);
  }
}
