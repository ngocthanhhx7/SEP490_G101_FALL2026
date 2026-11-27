// PRIVATE-IMG-02 — chỉ kiểm thử read; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createPrivateImageService } from '../../../src/services/private-image.service.js';
const OWNER = '111111111111111111111111', OTHER = '222222222222222222222222', IMAGE = 'a'.repeat(64);
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

// SRS: NFR Privacy dòng 6441–6442: ảnh visit chỉ cho chủ visit, sitter phụ trách, Staff/Admin xử lý.
test("PRIVATE-IMG-02-UTCID01 [N] Chủ ảnh đọc được nội dung riêng tư", async () => {
  const f = await fixture();
  await expect(f.service.read({ actor: f.actor, id: IMAGE })).resolves.toEqual({ body: f.body, contentType: 'image/png' });
});

// SRS: NFR Privacy dòng 6441–6442: ảnh visit chỉ cho chủ visit, sitter phụ trách, Staff/Admin xử lý.
test("PRIVATE-IMG-02-UTCID02 [N] Sitter được port cấp quyền theo visit có thể đọc ảnh", async () => {
  const f = await fixture(); f.authorizeEvidenceRead.mockResolvedValue(true);
  await expect(f.service.read({ actor: { userId: OTHER, roles: ['PET_SITTER'] }, id: IMAGE })).resolves.toMatchObject({ body: f.body });
  expect(f.authorizeEvidenceRead).toHaveBeenCalledWith(expect.objectContaining({ actor: { userId: OTHER, roles: ['PET_SITTER'] }, image: f.record }));
});

// SRS: NFR Privacy dòng 6441–6442: ảnh visit chỉ cho chủ visit, sitter phụ trách, Staff/Admin xử lý.
test("PRIVATE-IMG-02-UTCID03 [A] Người không liên quan không đọc ảnh", async () => {
  const f = await fixture();
  await expect(f.service.read({ actor: { userId: OTHER }, id: IMAGE })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  expect(f.media.read).not.toHaveBeenCalled();
});
