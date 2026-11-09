import { ApiError } from './api-client.js';
export const MAX_AVATAR_SOURCE_BYTES = 10 * 1024 * 1024;

// The browser sends only a small normalized square; server byte/pixel checks remain authoritative.
export async function prepareAvatarImage(file) {
  if (!file || !['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > MAX_AVATAR_SOURCE_BYTES) throw new ApiError('INVALID_AVATAR_IMAGE', 422);
  let source, temporary;
  try {
    if (typeof globalThis.createImageBitmap === 'function') source = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
    else {
      temporary = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => { const image = new globalThis.Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = temporary; });
    }
    const width = source.width || source.naturalWidth, height = source.height || source.naturalHeight;
    if (!width || !height || width * height > 60_000_000) throw new ApiError('INVALID_AVATAR_IMAGE', 422);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = Math.min(512, width, height);
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
    const side = Math.min(width, height);
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob?.size || blob.size > 512 * 1024) throw new ApiError('INVALID_AVATAR_IMAGE', 422);
    return new globalThis.File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('AVATAR_PROCESSING_FAILED', 422); }
  finally { source?.close?.(); if (temporary) URL.revokeObjectURL(temporary); }
}
