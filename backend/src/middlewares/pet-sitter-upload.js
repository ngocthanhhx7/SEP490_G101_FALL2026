import multer from 'multer';
import { AppError } from '../errors/app-error.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 8,
    fields: 16,
    fieldNameSize: 64,
    fieldSize: 16 * 1024,
  },
}).fields([
  { name: 'portrait', maxCount: 1 },
  { name: 'nationalIdFront', maxCount: 1 },
  { name: 'nationalIdBack', maxCount: 1 },
  { name: 'certificates', maxCount: 5 },
]);

export function receivePetSitterApplicationFiles(request, _response, next) {
  upload(request, _response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const field = error.field;
      return next(new AppError('VALIDATION_ERROR', 400, {
        ...(field ? { field } : {}),
        ...(error.code === 'LIMIT_FILE_SIZE' ? { reason: 'FILE_TOO_LARGE' } : {}),
      }));
    }
    return next(new AppError('VALIDATION_ERROR', 400));
  });
}
