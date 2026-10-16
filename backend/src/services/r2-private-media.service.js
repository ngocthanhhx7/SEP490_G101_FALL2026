import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../utils/app-error.js';
import { loadR2Config } from '../config/r2.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const keyPattern = /^private-images\/[a-f0-9]{64}$/;
const unavailable = () => new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private media is unavailable');
function validKey(key) {
  if (!keyPattern.test(key ?? '')) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid private media reference');
}

// Transport boundary only: authorization and durable object metadata belong to
// the calling service. No ACL, public domain, ambient AWS credentials or SDK log.
export function createR2PrivateMedia({ config, client = new S3Client({
  region: 'auto', endpoint: config.endpoint, credentials: config.credentials,
  maxAttempts: 1, requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED'
}), clock = Date.now, timeoutMs = 10000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new TypeError('Invalid R2 timeout');
  async function bounded(work) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([work(controller.signal), new Promise((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async upload({ storageRef, body, contentType }) {
      validKey(storageRef);
      if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES
        || !['image/png', 'image/jpeg'].includes(contentType)) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Invalid private image');
      }
      try {
        await bounded(signal => client.send(new PutObjectCommand({ Bucket: config.bucket, Key: storageRef,
          Body: body, ContentLength: body.length, ContentType: contentType,
          CacheControl: 'private, no-store' }), { abortSignal: signal }));
      } catch { throw unavailable(); } // Never expose SDK error, request URL or credential.
    },
    async read({ storageRef }) {
      validKey(storageRef);
      return bounded(async signal => {
       let result;
       const destroy = () => result?.Body?.destroy?.();
       try {
        result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: storageRef }), { abortSignal: signal });
        if (signal.aborted) throw unavailable();
        signal.addEventListener('abort', destroy, { once: true });
        if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength <= 0
          || result.ContentLength > MAX_IMAGE_BYTES) throw unavailable();
        const chunks = [];
        let length = 0;
        for await (const chunk of result.Body) {
          length += chunk.length;
          if (length > MAX_IMAGE_BYTES || length > result.ContentLength) throw unavailable();
          chunks.push(Buffer.from(chunk));
        }
        if (length !== result.ContentLength) throw unavailable();
        return { body: Buffer.concat(chunks, length), contentType: result.ContentType };
       } catch { throw unavailable(); }
       finally { signal.removeEventListener('abort', destroy); destroy(); }
      });
    },
    async createReadCapability({ storageRef, expiresInSeconds = 60 }) {
      validKey(storageRef);
      if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 60) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Invalid private media lifetime');
      }
      try {
        const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket,
          Key: storageRef, ResponseCacheControl: 'private, no-store',
          ResponseContentDisposition: 'attachment' }), { expiresIn: expiresInSeconds });
        return { url, expiresAt: new Date(clock() + expiresInSeconds * 1000).toISOString() };
      } catch { throw unavailable(); }
    }
  });
}

export function createR2PortOverrides({ env = process.env } = {}) {
  const config = loadR2Config(env);
  return config ? { privateMedia: createR2PrivateMedia({ config }) } : {};
}
