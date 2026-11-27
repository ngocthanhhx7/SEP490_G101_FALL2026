// INCIDENT-03 — chỉ kiểm thử detail; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createIncidentService } from '../../../src/services/incidents/incident.service.js';
const NOW = Date.parse('2026-11-18T03:00:00Z');
function fixture() {
  const customer = { userId: 'customer-1', roles: ['CUSTOMER'], state: 'ACTIVE', expiresAt: NOW + 86400000 };
  const sitter = { ...customer, userId: 'sitter-1', roles: ['PET_SITTER'] }, staff = { ...customer, userId: 'staff-1', roles: ['STAFF'] };
  const visit = { id: 'visit-1', customerId: customer.userId, sitterId: sitter.userId, state: 'IN_PROGRESS', startAt: new Date(NOW - 3600000).toISOString(), version: 1 };
  const record = { id: 'incident-1', kind: 'INCIDENT', visitId: visit.id, customerId: customer.userId, sitterId: sitter.userId, state: 'UNDER_REVIEW', version: 1, category: 'ACCESS', severity: 'MEDIUM', urgency: 'ROUTINE', description: 'Không mở được cửa nhà', staffNotes: 'Ghi chú nội bộ' };
  const tx = { getVisit: async () => visit, getCase: async () => record, getIdempotencyResult: async () => null,
    saveIdempotencyResult: async () => {}, createIncident: jest.fn(async r => r),
    resolveIncident: jest.fn(async ({ incident, resolution }) => ({ ...incident, ...resolution, resolution })), appendAuditAndOutbox: jest.fn(async () => {}) };
  const repository = { runForVisitActor: async (a, id, work) => work(tx), runForCase: async (a, id, work) => work(tx), listIncidents: jest.fn(async () => ({ items: [record], nextCursor: null })) };
  const service = createIncidentService({ repository, clock: () => NOW });
  const report = { actor: customer, visitId: visit.id, expectedVersion: 1, idempotencyKey: 'report5-incident', category: 'ACCESS', urgency: 'ROUTINE', description: record.description };
  return { customer, sitter, staff, visit, record, tx, repository, service, report };
}

// SRS: UC-47/86/48; SRS III.16.1 dòng 5217–5312; GBR-26.
test("INCIDENT-03-UTCID01 [N] Staff đọc chi tiết hồ sơ liên quan visit", async () => {
  const f = fixture();
  await expect(f.service.detail({ actor: f.staff, caseId: f.record.id })).resolves.toMatchObject({ id: f.record.id, visitId: f.visit.id, state: 'UNDER_REVIEW' });
});

// SRS: UC-47/86/48; SRS III.16.1 dòng 5217–5312; GBR-26.
test("INCIDENT-03-UTCID02 [N] Chủ visit đọc nội dung mà không nhận ghi chú Staff", async () => {
  const f = fixture();
  const actual = await f.service.detail({ actor: f.customer, caseId: f.record.id });
  expect(actual.description).toBe(f.record.description); expect(actual).not.toHaveProperty('staffNotes');
});

// SRS: UC-47/86/48; SRS III.16.1 dòng 5217–5312; GBR-26.
test("INCIDENT-03-UTCID03 [A] Khách khác không đọc chi tiết sự cố", async () => {
  const f = fixture();
  await expect(f.service.detail({ actor: { ...f.customer, userId: 'other-customer' }, caseId: f.record.id })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});
