// AVATAR-02 — chỉ kiểm thử change; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import sharp from 'sharp';
jest.unstable_mockModule('../../../src/models/avatar.model.js', () => ({ avatarModel: c => c.models.Avatar }));
jest.unstable_mockModule('../../../src/models/user.model.js', () => ({ userModel: c => c.models.User }));
jest.unstable_mockModule('../../../src/models/pet-care.model.js', () => ({ petCareModels: c => c.models }));
const { createAvatarService } = await import('../../../src/services/avatar.service.js');
const OWNER = '111111111111111111111111', OTHER = '222222222222222222222222', PET = '333333333333333333333333';
function query(value) { const q = { select: () => q, session: () => q, lean: async () => value }; return q; }
function fixture() {
  const actor = { userId: OWNER, roles: ['CUSTOMER'], state: 'ACTIVE' };
  const data = { row: null };
  const Avatar = { findById: jest.fn(() => query(data.row)), create: jest.fn(async rows => { data.row = rows[0]; }), updateOne: jest.fn(async () => ({ modifiedCount: 1 })) };
  const User = { findOne: () => query({ _id: OWNER }), findOneAndUpdate: async () => ({ _id: OWNER }) };
  const Pet = { findOne: filter => query(filter.ownerId === OWNER ? { _id: PET, ownerId: OWNER } : null), findOneAndUpdate: async filter => filter.ownerId === OWNER ? { _id: PET } : null };
  const service = createAvatarService({ connection: { models: { Avatar, User, Pet }, transaction: async work => work({}) } });
  return { actor, data, Avatar, service };
}

// SRS: UC-14/15; SRS III.5 Pet profile dòng 3944–3945: khách cập nhật ảnh pet; GBR-02.
test("AVATAR-02-UTCID01 [N] Khách lưu ảnh mới cho pet của mình", async () => {
  const f = fixture();
  const body = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#336699' } }).png().toBuffer();
  await expect(f.service.change({ actor: f.actor, petId: PET, body, contentType: 'image/png', expectedVersion: 0, idempotencyKey: 'report5-avatar-change' })).resolves.toMatchObject({ present: true, version: 1 });
  expect(f.Avatar.create.mock.calls[0][0][0]).toMatchObject({ _id: 'pet:' + PET, present: true, body: expect.any(Buffer) });
});

// SRS: UC-14/15; SRS III.5 Pet profile dòng 3944–3945: khách cập nhật ảnh pet; GBR-02.
test("AVATAR-02-UTCID02 [A] Không đổi ảnh pet của khách khác", async () => {
  const f = fixture();
  await expect(f.service.change({ actor: { ...f.actor, userId: OTHER }, petId: PET, body: Buffer.from('photo'), contentType: 'image/png', expectedVersion: 0, idempotencyKey: 'report5-avatar-change' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  expect(f.Avatar.create).not.toHaveBeenCalled();
});
