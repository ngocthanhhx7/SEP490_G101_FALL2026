import { AppError } from '../utils/app-error.js';
import { PRODUCT_PHOTO_LIMITS, PRODUCT_PHOTO_TYPES } from '../constants/product-photos.js';

export const invalidProductPhoto = () => new AppError(422, 'INVALID_PRODUCT_PHOTO', 'Use a valid JPEG, PNG or WebP image within the size and pixel limits');
export function parsePhotoVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(value)) throw new AppError(422, 'VALIDATION_FAILED', 'A product version is required');
  return Number(value);
}
export function parsePhotoIndex(value) {
  if (typeof value !== 'string' || !/^[0-4]$/.test(value)) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid photo index');
  return Number(value);
}
export function parsePhotoDigest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Image not found');
  return value;
}
export function validatePhotoBody(body, contentType) {
  if (!Buffer.isBuffer(body) || !body.length || body.length > PRODUCT_PHOTO_LIMITS.maxBytes || !PRODUCT_PHOTO_TYPES.includes(contentType)) throw invalidProductPhoto();
}
