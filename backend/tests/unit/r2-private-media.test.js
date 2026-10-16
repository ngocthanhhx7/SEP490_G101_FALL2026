import { describe, expect, test } from '@jest/globals';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { loadR2Config } from '../../src/config/r2.js';
import { createR2PrivateMedia, MAX_IMAGE_BYTES } from '../../src/services/r2-private-media.service.js';

const env = { R2_ENABLED: 'true', R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'synthetic-private',
  R2_ACCESS_KEY_ID: 'b'.repeat(32), R2_SECRET_ACCESS_KEY: 'c'.repeat(64) };
const key = `private-images/${'d'.repeat(64)}`;

describe('R2 private transport and safe configuration', () => {
  test('disabled is inert and invalid configuration returns names, never secret values', () => {
    expect(loadR2Config({})).toBeNull();
    expect(loadR2Config({ R2_ENABLED: 'false', R2_ACCOUNT_ID: 'wrong' })).toBeNull();
    for (const [field, value] of Object.entries({ R2_ENABLED: 'yes', R2_ACCOUNT_ID: '../evil',
      R2_BUCKET: 'private/escape', R2_ACCESS_KEY_ID: 'secret-invalid',
      R2_SECRET_ACCESS_KEY: 'secret-invalid', R2_MAX_IMAGES_PER_USER: '1001' })) {
      try { loadR2Config({ ...env, [field]: value }); throw new Error('Expected rejection'); }
      catch (error) {
        expect(error.details.fields).toContain(field);
        expect(error.message).toBe('Private media configuration is invalid');
        expect(JSON.stringify(error)).not.toContain(value);
      }
    }
  });

  test('real SDK signs private PUT and GET without a public ACL or public URL', async () => {
    const config = loadR2Config(env);
    const requests = [];
    const client = new S3Client({ region: 'auto', endpoint: config.endpoint,
      credentials: config.credentials, maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED', requestHandler: {
        async handle(request) {
          requests.push(request);
          return { response: { statusCode: 200, headers: request.method === 'GET'
            ? { 'content-length': '3', 'content-type': 'image/png' } : {},
          body: Readable.from(request.method === 'GET' ? [Buffer.from('png')] : []) } };
        }
      } });
    const media = createR2PrivateMedia({ config, client, clock: () => 0 });
    await media.upload({ storageRef: key, body: Buffer.from('png'), contentType: 'image/png' });
    const read = await media.read({ storageRef: key });
    expect(read.body).toEqual(Buffer.from('png'));
    expect(requests.map(r => r.method)).toEqual(['PUT', 'GET']);
    expect(requests.every(r => r.protocol === 'https:' && r.hostname.endsWith('.r2.cloudflarestorage.com'))).toBe(true);
    expect(requests[0].headers['cache-control']).toBe('private, no-store');
    expect(requests[0].headers['x-amz-acl']).toBeUndefined();
    expect(requests[0].headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    const signed = await media.createReadCapability({ storageRef: key, expiresInSeconds: 30 });
    const url = new URL(signed.url);
    expect(url.hostname.endsWith('.r2.cloudflarestorage.com')).toBe(true);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('30');
    expect(url.searchParams.get('response-cache-control')).toBe('private, no-store');
    expect(signed.expiresAt).toBe('1970-01-01T00:00:30.000Z');
    expect(requests).toHaveLength(2); // Presigning makes no provider request.
    client.destroy();
  });

  test('hard deadline aborts hung PUT and destroys a stalled GET body', async () => {
    const config = loadR2Config(env);
    let aborted = false;
    const hung = createR2PrivateMedia({ config, timeoutMs: 20, client: {
      send: async (_command, options) => {
        options.abortSignal.addEventListener('abort', () => { aborted = true; });
        return new Promise(() => {});
      }
    } });
    await expect(hung.upload({ storageRef: key, body: Buffer.from('x'), contentType: 'image/png' }))
      .rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(aborted).toBe(true);
    const body = new Readable({ read() {} });
    const stalled = createR2PrivateMedia({ config, timeoutMs: 20, client: {
      send: async () => ({ ContentLength: 1, ContentType: 'image/png', Body: body })
    } });
    await expect(stalled.read({ storageRef: key })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(body.destroyed).toBe(true);
  });
  test('bounds response bytes and scrubs transport failures', async () => {
    const config = loadR2Config(env);
    const leaked = 'https://secret.invalid/?signature=private';
    const failed = createR2PrivateMedia({ config, client: { send: async () => { throw new Error(leaked); } } });
    await expect(failed.upload({ storageRef: key, body: Buffer.from('x'), contentType: 'image/png' }))
      .rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', message: 'Private media is unavailable' });
    await expect(failed.upload({ storageRef: '../escape', body: Buffer.from('x'), contentType: 'image/png' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    for (const [length, chunks] of [[MAX_IMAGE_BYTES + 1, []], [2, [Buffer.from('abc')]], [3, [Buffer.from('x')]]]) {
      const media = createR2PrivateMedia({ config, client: { send: async () => ({ ContentLength: length,
        Body: Readable.from(chunks) }) } });
      await expect(media.read({ storageRef: key })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    }
  });
});
