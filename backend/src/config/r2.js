import { AppError } from '../utils/app-error.js';

export function loadR2Config(env = process.env) {
  if (env.R2_ENABLED === undefined || env.R2_ENABLED === 'false') return null;
  const fields = [];
  if (env.R2_ENABLED !== 'true') fields.push('R2_ENABLED');
  if (!/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID ?? '')) fields.push('R2_ACCOUNT_ID');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET ?? '')
    || /^\d+\.\d+\.\d+\.\d+$/.test(env.R2_BUCKET)) fields.push('R2_BUCKET');
  if (!/^[a-f0-9]{32}$/.test(env.R2_ACCESS_KEY_ID ?? '')) fields.push('R2_ACCESS_KEY_ID');
  if (!/^[a-f0-9]{64}$/.test(env.R2_SECRET_ACCESS_KEY ?? '')) fields.push('R2_SECRET_ACCESS_KEY');
  const maxImagesPerUser = Number(env.R2_MAX_IMAGES_PER_USER ?? '20');
  if (!/^[1-9]\d*$/.test(env.R2_MAX_IMAGES_PER_USER ?? '20')
    || !Number.isSafeInteger(maxImagesPerUser) || maxImagesPerUser > 1000) fields.push('R2_MAX_IMAGES_PER_USER');
  if (fields.length) throw new AppError(503, 'R2_CONFIGURATION_INVALID',
    'Private media configuration is invalid', { fields });
  return Object.freeze({ bucket: env.R2_BUCKET,
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    maxImagesPerUser });
}
