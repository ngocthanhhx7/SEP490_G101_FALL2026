import { AppError, metadata } from '../utils/app-error.js';

export const controllerAction = (status, handler) => async (req, res) => {
  try {
    const data = await handler(req);
    return res.status(status).json({ data, meta: metadata(req) });
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(409, 'VERSION_CONFLICT', 'Record already exists');
    }
    if (error.name === 'ValidationError' || error.name === 'StrictModeError') {
      throw new AppError(
        422,
        'VALIDATION_FAILED',
        'Data does not match the schema'
      );
    }
    throw error;
  }
};
