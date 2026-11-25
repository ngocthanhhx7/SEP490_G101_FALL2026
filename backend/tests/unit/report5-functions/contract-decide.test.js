// CONTRACT-02 — chỉ kiểm thử decide; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
jest.unstable_mockModule('../../../src/models/employment-document.model.js', () => ({ employmentDocumentModels: c => c.models }));
jest.unstable_mockModule('../../../src/models/payroll.model.js', () => ({ payrollModels: c => c.models }));
jest.unstable_mockModule('../../../src/models/sitter-application.model.js', () => ({ sitterApplicationModels: c => c.models }));
jest.unstable_mockModule('../../../src/models/identity.model.js', () => ({ identityModels: () => ({ Contact: {} }) }));
const { createEmploymentDocumentService } = await import('../../../src/services/payroll/employment-document.service.js');
const ADMIN = '111111111111111111111111', APPLICATION = '222222222222222222222222';
function query(value) { const q = { select: () => q, session: () => q, sort: () => q, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) }; return q; }
function fixture() {
  const terms = { employmentType: 'FULL_TIME', monthlyBaseVnd: 9000000, monthlyAllowanceVnd: 500000, payCycle: 'MONTHLY', weeklyMinutes: 2400, effectiveOn: '2026-12-01', endsOn: '2027-12-01', weekdays: [1,2,3,4,5], dailyMinutes: 480 };
  const row = { _id: '444444444444444444444444', applicationId: APPLICATION, applicationVersion: 1, state: 'SIGNED', encryptedTerms: JSON.stringify(terms), termsHash: createHash('sha256').update(JSON.stringify(terms)).digest('hex'), signedAt: new Date('2026-11-17'), reference: 'SYNTHETIC-CONTRACT', verifiedBy: ADMIN, employeeCode: 'SYNTHETIC-EMPLOYEE' };
  const EmploymentDocument = { findOne: () => query(row), updateOne: jest.fn(async () => ({ modifiedCount: 1 })) };
  const EmploymentContract = { exists: jest.fn(() => query(null)), create: jest.fn(async () => []) };
  const models = { EmploymentDocument, EmploymentContract, EmploymentDocumentCounter: {}, EmploymentDocumentCommand: {}, SitterApplication: {}, PayrollEvent: { create: jest.fn(async () => {}) } };
  const service = createEmploymentDocumentService({ connection: { models, transaction: async work => work({}) }, crypto: { encrypt: text => text, decrypt: text => text }, lookupSecret: 'synthetic-only-lookup-secret-32-characters', clock: () => Date.parse('2026-11-18T03:00:00Z') });
  return { actor: { userId: ADMIN, roles: ['ADMIN'], state: 'ACTIVE' }, row, terms, EmploymentContract, EmploymentDocument, service };
}

// SRS: UC-21; SRS III.7.2.1 dòng 4142–4170: Admin quản lý hợp đồng, thời hạn và mức lương.
test("CONTRACT-02-UTCID01 [A] STAFF không được quản lý hợp đồng", async () => {
  const f = fixture(); f.actor.roles = ['STAFF'];
  await expect(f.service.decide(f.actor, APPLICATION, f.row._id, {}, 'report5-contract-key')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});

// SRS: UC-21; SRS III.7.2.1 dòng 4142–4170: Admin quản lý hợp đồng, thời hạn và mức lương.
test("CONTRACT-02-UTCID02 [A] CUSTOMER không được quản lý hợp đồng", async () => {
  const f = fixture(); f.actor.roles = ['CUSTOMER'];
  await expect(f.service.decide(f.actor, APPLICATION, f.row._id, {}, 'report5-contract-key')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});
