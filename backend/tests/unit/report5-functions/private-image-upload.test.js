// PRIVATE-IMG-01 — chỉ kiểm thử upload; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createPrivateImageService } from '../../../src/services/private-image.service.js';
const OWNER = '111111111111111111111111', IMAGE = 'a'.repeat(64);
function query(value) { const q = { select: () => q, session: () => q, lean: async () => value }; return q; }
async function fixture() {
  const body = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#336699' } }).png().toBuffer();
  const record = { _id: IMAGE, ownerId: OWNER, state: 'READY', storageRef: 'private-images/synthetic-image', contentType: 'image/png', byteLength: body.length, contentDigest: createHash('sha256').update(body).digest('hex') };
  const PrivateImage = { findById: jest.fn(() => query(null)), findOne: jest.fn(() => query(record)), create: jest.fn(async rows => rows), updateOne: jest.fn(async () => ({ modifiedCount: 1 })) };
  const PrivateImageQuota = { findById: () => query(null), create: async () => {} };
  const media = { upload: jest.fn(async () => {}), read: jest.fn(async () => ({ body, contentType: 'image/png' })) };
  const authorizeEvidenceRead = jest.fn(async () => false);
  const service = createPrivateImageService({ connection: { transaction: async work => work({}) }, imageModels: { PrivateImage, PrivateImageQuota }, media, authorizeEvidenceRead, secret: 'synthetic-test-secret-not-production' });
  return { actor: { userId: OWNER }, body, record, PrivateImage, media, authorizeEvidenceRead, service };
}

// SRS: SRS III.16.1.1 ảnh bằng chứng tùy chọn; NFR Privacy dòng 6441–6442.
test("PRIVATE-IMG-01-UTCID01 [N] Tải ảnh visit hợp lệ vào vùng lưu trữ riêng tư", async () => {
  const f = await fixture();
  const actual = await f.service.upload({ actor: f.actor, body: f.body, contentType: 'image/png', idempotencyKey: 'report5-upload-image-01' });
  expect(actual).toMatchObject({ state: 'READY' });
  expect(f.media.upload).toHaveBeenCalledWith(expect.objectContaining({ storageRef: expect.stringMatching(/^private-images\//), body: expect.any(Buffer), contentType: 'image/png' }));
  expect(actual).not.toHaveProperty('url');
});

// SRS: SRS III.16.1.1 ảnh bằng chứng tùy chọn; NFR Privacy dòng 6441–6442.
test("PRIVATE-IMG-01-UTCID02 [A] Chưa có danh tính không được tải ảnh riêng tư", async () => {
  const f = await fixture();
  await expect(f.service.upload({ actor: null, body: f.body, contentType: 'image/png', idempotencyKey: 'report5-upload-image-01' })).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
});
