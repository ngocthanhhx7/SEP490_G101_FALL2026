// Mỗi UTCID gọi riêng decline; xem phạm vi và giới hạn trong README.
import { test, expect, jest } from '@jest/globals';
import { createSitterOfferService } from '../../../src/services/sitter-offer.service.js';

const SITTER = 'sitter-srs-01';
const OTHER = 'sitter-srs-02';
const OFFER = 'offer-srs-01';
const VISIT = 'visit-srs-01';
const NOW = Date.parse('2026-11-12T03:00:00.000Z');
const HOUR = 3600000;
function fixture() {
  const actor = { userId: SITTER, state: 'ACTIVE', roles: ['PET_SITTER'] };
  const store = { now: NOW,
    offer: { id: OFFER, visitId: VISIT, sitterId: SITTER, state: 'PENDING', version: 1,
      offeredAt: new Date(NOW - HOUR).toISOString(), deadline: new Date(NOW + HOUR).toISOString() },
    visit: { id: VISIT, state: 'UNASSIGNED', sitterId: null, paymentRequired: false,
      paymentStatus: 'UNPAID', startAt: new Date(NOW + 30 * HOUR).toISOString(),
      endAt: new Date(NOW + 31 * HOUR).toISOString() },
    eligibility: { eligible: true }, slotAvailable: true, assignments: [], events: [], writes: 0 };
  const tx = {
    getOffer: jest.fn(async ({ offerId }) => offerId === store.offer.id ? globalThis.structuredClone(store.offer) : null),
    getVisit: jest.fn(async ({ visitId }) => visitId === store.visit.id ? globalThis.structuredClone(store.visit) : null),
    recheckEligibility: jest.fn(async () => globalThis.structuredClone(store.eligibility)),
    checkSlotAvailability: jest.fn(async () => store.slotAvailable),
    acceptOffer: jest.fn(async ({ offer, sitterId, expectedVersion }) => {
      // Double thực sự ghi trạng thái. Không mô phỏng khóa/transaction MongoDB.
      if (store.offer.id !== offer.id || store.offer.state !== 'PENDING' || store.offer.version !== expectedVersion)
        throw new Error('Fixture CAS rejected');
      store.offer.state = 'ACCEPTED'; store.offer.version += 1;
      store.visit.state = 'ASSIGNED'; store.visit.sitterId = sitterId; store.writes += 1;
      store.assignments.push({ id: 'assignment-srs-01', visitId: VISIT, sitterId });
      return { state: 'ACCEPTED', sitterId, version: store.offer.version, assignmentId: 'assignment-srs-01' };
    }),
    declineOffer: jest.fn(async ({ offer, expectedVersion }) => {
      if (store.offer.id !== offer.id || store.offer.state !== 'PENDING' || store.offer.version !== expectedVersion)
        throw new Error('Fixture CAS rejected');
      store.offer.state = 'DECLINED'; store.offer.version += 1; store.writes += 1;
      return { state: 'DECLINED', version: store.offer.version };
    }),
    appendAuditAndOutbox: jest.fn(async event => { store.events.push(globalThis.structuredClone(event)); }),
  };
  const repository = { listOffers: jest.fn(), getOffer: jest.fn(), listAssignedVisits: jest.fn(),
    runOfferCommand: jest.fn(async command => command.execute(tx)) };
  const subject = createSitterOfferService({ repository, clock: () => store.now }).decline;
  return { actor, store, tx, repository, decline: subject };
}
function urgentOffer(f) {
  // GBR-12: lượt bắt đầu trong 24 h có answer time 30 phút.
  f.store.offer.offeredAt = new Date(NOW - 15 * 60000).toISOString();
  f.store.offer.deadline = new Date(NOW + 15 * 60000).toISOString();
  f.store.visit.startAt = new Date(NOW + 2 * HOUR).toISOString();
  f.store.visit.endAt = new Date(NOW + 3 * HOUR).toISOString();
}
function expectNoDecisionWrite(f) {
  expect(f.tx.acceptOffer).not.toHaveBeenCalled();
  expect(f.tx.declineOffer).not.toHaveBeenCalled();
  expect(f.store.writes).toBe(0);
  expect(f.store.assignments).toEqual([]);
  expect(f.store.events).toEqual([]);
}

// SRS: UC-35 Alternative 4.1 bước 1; GBR-12: từ chối lời mời khi truyền reason rỗng phải bị chặn 422.
test("OFFER-02-UTCID01 [A] Truyền lý do rỗng thì không được đóng offer thành Declined", async () => {
  const f = fixture();
  let error = null;
  try {
    await f.decline(f.actor, OFFER, 1, 'srs-decline-empty-reason', '');
  } catch (caught) {
    error = { name: caught.name, status: caught.status, code: caught.code };
  }

  expect({ error, offerState: f.store.offer.state, writes: f.store.writes, events: f.store.events.length }).toMatchObject({
    error: { name: 'AppError', status: 422, code: 'VALIDATION_FAILED' }, offerState: 'PENDING', writes: 0, events: 0,
  });
});

// SRS: GBR-01; UC-35 Preconditions — sitter signed in.
test("OFFER-02-UTCID02 [A] Guest không được từ chối lời mời", async () => {
  const f = fixture();

  await expect(f.decline(null, OFFER, 1, 'srs-decline-guest')).rejects.toMatchObject({
    name: 'AppError', status: 401, code: 'UNAUTHENTICATED', message: 'Authentication required',
  });
  expect(f.repository.runOfferCommand).not.toHaveBeenCalled();
  expectNoDecisionWrite(f);
});

// SRS: UC-35 Primary actor; I.4.4 Accept/Decline offers; GBR-02.
test("OFFER-02-UTCID03 [A] Customer không được từ chối qua cổng Pet Sitter", async () => {
  const f = fixture();
  f.actor.roles = ['CUSTOMER'];

  await expect(f.decline(f.actor, OFFER, 1, 'srs-decline-guard')).rejects.toMatchObject({
    name: 'AppError', status: 403, code: 'FORBIDDEN', message: "Pet sitter access is required",
  });
  expectNoDecisionWrite(f);
});

// SRS: I.4.4 ghi chú 7 — chỉ visits offered to the pet sitter.
test("OFFER-02-UTCID04 [A] Pet Sitter không từ chối được lời mời của người khác", async () => {
  const f = fixture();
  f.store.offer.sitterId = OTHER;

  await expect(f.decline(f.actor, OFFER, 1, 'srs-decline-guard')).rejects.toMatchObject({
    name: 'AppError', status: 404, code: 'RESOURCE_NOT_FOUND', message: "Offer not found",
  });
  expectNoDecisionWrite(f);
});

// SRS: UC-35 Description; I.4.4 ghi chú 7; GBR-12 — chỉ trả lời trước deadline.
test("OFFER-02-UTCID05 [B] Đúng hạn trả lời 2 giờ không được gửi Decline nữa", async () => {
  const f = fixture();
  f.store.now = Date.parse(f.store.offer.deadline);

  await expect(f.decline(f.actor, OFFER, 1, 'srs-decline-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'OFFER_EXPIRED', message: "Offer deadline has passed",
  });
  expectNoDecisionWrite(f);
});

// SRS: GBR-12; III.11.1 — deadline 30 min; I.4.4 ghi chú 7.
test("OFFER-02-UTCID06 [B] Lượt sắp bắt đầu đúng hạn 30 phút không được gửi Decline nữa", async () => {
  const f = fixture();
  urgentOffer(f);
  f.store.now = Date.parse(f.store.offer.deadline);

  await expect(f.decline(f.actor, OFFER, 1, 'srs-decline-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'OFFER_EXPIRED', message: "Offer deadline has passed",
  });
  expectNoDecisionWrite(f);
});

// SRS: UC-35 Preconditions — offer still open.
test("OFFER-02-UTCID07 [A] Offer đã Accepted không còn mở để Decline", async () => {
  const f = fixture();
  f.store.offer.state = 'ACCEPTED';

  await expect(f.decline(f.actor, OFFER, 1, 'srs-decline-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'OFFER_NOT_PENDING', message: "Offer is no longer pending",
  });
  expectNoDecisionWrite(f);
});
