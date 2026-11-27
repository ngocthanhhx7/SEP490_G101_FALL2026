// AVATAR-01 — chỉ kiểm thử get; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';

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

// SRS: UC-14/15; SRS III.5 Pet profile dòng 3944–3945: ảnh pet tùy chọn; GBR-02.
test("AVATAR-01-UTCID01 [N] Pet chưa có ảnh trả trạng thái không có ảnh", async () => {
  const f = fixture();
  await expect(f.service.get({ actor: f.actor, petId: PET })).resolves.toEqual({ version: 0, present: false });
});

// SRS: UC-14/15; SRS III.5 Pet profile dòng 3944–3945: ảnh pet tùy chọn; GBR-02.
test("AVATAR-01-UTCID02 [N] Đọc được ảnh pet thuộc mình", async () => {
  const f = fixture(); f.data.row = { present: true, version: 1, body: Buffer.from('synthetic-photo') };
  await expect(f.service.get({ actor: f.actor, petId: PET, content: true })).resolves.toEqual(f.data.row.body);
});

// SRS: UC-14/15; SRS III.5 Pet profile dòng 3944–3945: ảnh pet tùy chọn; GBR-02.
test("AVATAR-01-UTCID03 [A] Khách khác không đọc ảnh pet", async () => {
  const f = fixture();
  await expect(f.service.get({ actor: { ...f.actor, userId: OTHER }, petId: PET })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});
