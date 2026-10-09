import { AppError } from './app-error.js';

export function errorHandler(error, _request, response, _next) {
  if (response.headersSent) return;

  if (error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && 'body' in error)) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR' } });
    return;
  }

  const known = error instanceof AppError;
  const status = known ? error.httpStatus : 500;
  const code = known ? error.code : 'INTERNAL_ERROR';
  const extras = known ? error.extras : {};

  if (!known) console.error('Unhandled request error', { name: error?.name ?? 'Error' });
  response.status(status).json({
    error: {
      code,
      message: known ? (extras.message ?? code) : 'An internal error occurred.',
      ...Object.fromEntries(Object.entries(extras).filter(([key]) => key !== 'message')),
    },
  });
}
