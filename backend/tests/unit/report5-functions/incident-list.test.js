// INCIDENT-02 — chỉ kiểm thử list; mỗi UTCID là một test riêng.
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
test("INCIDENT-02-UTCID01 [N] Staff xem danh sách sự cố và trạng thái hiện tại", async () => {
  const f = fixture();
  const actual = await f.service.list({ actor: f.staff });
  expect(actual.items).toEqual([expect.objectContaining({ id: 'incident-1', state: 'UNDER_REVIEW' })]);
  expect(f.repository.listIncidents).toHaveBeenCalledWith(expect.objectContaining({ actor: f.staff }));
});

// SRS: UC-47/86/48; SRS III.16.1 dòng 5217–5312; GBR-26.
test("INCIDENT-02-UTCID02 [N] Chưa có sự cố trả danh sách rỗng", async () => {
  const f = fixture(); f.repository.listIncidents.mockResolvedValue({ items: [], nextCursor: null });
  await expect(f.service.list({ actor: f.staff })).resolves.toEqual({ items: [], nextCursor: null });
});

// SRS: UC-47/86/48; SRS III.16.1 dòng 5217–5312; GBR-26.
test("INCIDENT-02-UTCID03 [A] Chưa đăng nhập không được xem danh sách", async () => {
  const f = fixture();
  await expect(f.service.list({ actor: null })).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
});
