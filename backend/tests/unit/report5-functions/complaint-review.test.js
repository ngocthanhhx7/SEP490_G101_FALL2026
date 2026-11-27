// COMPLAINT-02 — chỉ kiểm thử review; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createComplaintService } from '../../../src/services/complaints/complaint.service.js';
const NOW = Date.parse('2026-11-18T03:00:00Z'), DAY = 86400000;
function fixture() {
  const customer = { userId: 'customer-1', roles: ['CUSTOMER'], state: 'ACTIVE', expiresAt: NOW + DAY };
  const staff = { ...customer, userId: 'staff-1', roles: ['STAFF'] };
  const admin = { ...customer, userId: 'admin-1', roles: ['ADMIN'] };
  const booking = { id: 'booking-1', customerId: customer.userId, version: 4 };
  const visit = { id: 'visit-1', bookingId: booking.id, sitterId: 'sitter-1', state: 'COMPLETED', completedAt: new Date(NOW - DAY), version: 1 };
  const record = { id: 'complaint-1', kind: 'COMPLAINT', complaintSchemaVersion: 2, scope: 'VISIT', bookingId: booking.id, visitId: visit.id, customerId: customer.userId, sitterId: visit.sitterId, description: 'Chất lượng chưa đúng thỏa thuận', state: 'OPEN', version: 0, objectionCount: 0, createdAt: new Date(NOW - 3600000) };
  const data = { records: [] };
  const tx = {
    getBooking: async () => booking, getVisit: async () => visit, getVisits: async () => [visit],
    bookingComplaints: async () => data.records, guardBooking: async b => b,
    getComplaint: async () => record, assertEvidence: jest.fn(async () => {}), changeHold: jest.fn(async () => {}),
    createComplaint: jest.fn(async r => { data.records.push(r); return r; }),
    updateComplaint: jest.fn(async ({ expectedVersion, changes }) => Object.assign(record, changes, { version: expectedVersion + 1 })),
    getIdempotencyResult: async () => null, saveIdempotencyResult: async () => {}, recordEvent: jest.fn(async () => {})
  };
  const billing = { read: jest.fn(async () => ({ basis: 'ISSUED', basisAmountVnd: 100000, approvedTotalVnd: 20000, billTotalVnd: 100000, paidInFull: false })), applyAdjustment: jest.fn(async () => ({ applied: true })) };
  const service = createComplaintService({ repository: { run: async work => work(tx) }, billing, clock: () => NOW });
  const submission = { actor: customer, visitId: visit.id, expectedVersion: 1, idempotencyKey: 'report5-submit-01', description: record.description };
  const command = { actor: staff, complaintId: record.id, expectedVersion: 0, idempotencyKey: 'report5-mutate-01' };
  return { customer, staff, admin, booking, visit, record, data, tx, billing, service, submission, command };
}

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-02-UTCID01 [N] Staff lưu ghi chú xử lý và giữ hồ sơ mở", async () => {
  const f = fixture();
  await expect(f.service.review({ ...f.command, handlingNotes: 'Đã liên hệ hai bên xác minh' })).resolves.toMatchObject({ state: 'OPEN' });
  expect(f.record.handlingNotes).toBe('Đã liên hệ hai bên xác minh');
});

// SRS: UC-52/53; SRS III.18.2 dòng 5430–5500; GBR-26 dòng 6605–6606.
test("COMPLAINT-02-UTCID02 [A] Customer không được ghi nhận xử lý của Staff", async () => {
  const f = fixture();
  await expect(f.service.review({ ...f.command, actor: f.customer, handlingNotes: 'Tự xử lý' })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});
