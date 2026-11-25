// INCIDENT-01 — chỉ kiểm thử report; mỗi UTCID là một test riêng.
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
test("INCIDENT-01-UTCID01 [N] Khách của visit báo sự cố không cần ảnh", async () => {
  const f = fixture();
  await expect(f.service.report(f.report)).resolves.toMatchObject({ state: 'OPEN', incident: { description: f.record.description } });
  expect(f.tx.appendAuditAndOutbox).toHaveBeenCalledWith(expect.objectContaining({ type: 'IncidentReported' }));
});

// SRS: UC-47/86/48; SRS III.16.1 dòng 5217–5312; GBR-26.
test("INCIDENT-01-UTCID02 [N] Sitter đang phụ trách có thể báo sự cố", async () => {
  const f = fixture();
  await expect(f.service.report({ ...f.report, actor: f.sitter, category: 'HEALTH_OBSERVATION' })).resolves.toMatchObject({ state: 'OPEN' });
});

// SRS: Report 3 23/11; UC-47; GBR-17/26/30: sự cố ROUTINE mở hồ sơ xử lý, không đặt hold tài chính tự động.
test("INCIDENT-01-UTCID03 [N] Sự cố thông thường ghi nhận OPEN không treo thanh toán", async () => {
  const f = fixture();
  await f.service.report(f.report);
  expect(f.tx.createIncident.mock.calls[0][0].financialHold).toBeNull();
});

// SRS: UC-47/86/48; SRS III.16.1 dòng 5217–5312; GBR-26.
test("INCIDENT-01-UTCID04 [A] Thiếu mô tả không gửi sự cố", async () => {
  const f = fixture(); f.report.description = '';
  await expect(f.service.report(f.report)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
});

// SRS: UC-47/86/48; SRS III.16.1 dòng 5217–5312; GBR-26.
test("INCIDENT-01-UTCID05 [A] Khách khác không báo sự cố thay chủ visit", async () => {
  const f = fixture(); f.report.actor = { ...f.customer, userId: 'other-customer' };
  await expect(f.service.report(f.report)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});
