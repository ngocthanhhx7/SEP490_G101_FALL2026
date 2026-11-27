// Mỗi UTCID gọi riêng accept; xem phạm vi và giới hạn trong README.
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
  const subject = createSitterOfferService({ repository, clock: () => store.now }).accept;
  return { actor, store, tx, repository, accept: subject };
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

// SRS: UC-35 bước 4–7 và Postconditions; UC-25 Postconditions — trả sau booking.
test("OFFER-01-UTCID01 [N] Nhận lời mời còn mở và phân công lượt chưa thanh toán", async () => {
  const f = fixture();

  const actual = await f.accept(f.actor, OFFER, 1, 'srs-accept-normal');

  expect(actual).toMatchObject({ offerId: OFFER, visitId: VISIT, sitterId: SITTER, state: 'ASSIGNED' });
  expect(f.store.offer.state).toBe('ACCEPTED');
  expect(f.store.visit).toMatchObject({ state: 'ASSIGNED', sitterId: SITTER, paymentStatus: 'UNPAID' });
  expect(f.store.assignments).toEqual([{ id: 'assignment-srs-01', visitId: VISIT, sitterId: SITTER }]);
  expect(f.tx.recheckEligibility).toHaveBeenCalledTimes(1);
  expect(f.tx.checkSlotAvailability).toHaveBeenCalledTimes(1);
  expect(f.store.events).toEqual([expect.objectContaining({ type: 'OfferAccepted', actorId: SITTER, offerId: OFFER, visitId: VISIT })]);
  expect(f.tx.declineOffer).not.toHaveBeenCalled();
});

// SRS: GBR-01; UC-35 Preconditions — sitter signed in.
test("OFFER-01-UTCID02 [A] Guest không được nhận lời mời", async () => {
  const f = fixture();

  await expect(f.accept(null, OFFER, 1, 'srs-accept-guest')).rejects.toMatchObject({
    name: 'AppError', status: 401, code: 'UNAUTHENTICATED', message: 'Authentication required',
  });
  expect(f.repository.runOfferCommand).not.toHaveBeenCalled();
  expectNoDecisionWrite(f);
});

// SRS: UC-35 Primary actor; I.4.4 Accept/Decline offers; GBR-02.
test("OFFER-01-UTCID03 [A] Customer không được nhận lời mời qua cổng Pet Sitter", async () => {
  const f = fixture();
  f.actor.roles = ['CUSTOMER'];

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 403, code: 'FORBIDDEN', message: "Pet sitter access is required",
  });
  expectNoDecisionWrite(f);
});

// SRS: I.4.4 ghi chú 7 — chỉ visits offered to the pet sitter; UC-35 Description.
test("OFFER-01-UTCID04 [A] Pet Sitter không nhận được lời mời của người khác", async () => {
  const f = fixture();
  f.store.offer.sitterId = OTHER;

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 404, code: 'RESOURCE_NOT_FOUND', message: "Offer not found",
  });
  expectNoDecisionWrite(f);
});

// SRS: GBR-12; UC-35 Description — before deadline; III.11.1 Offers.
test("OFFER-01-UTCID05 [B] Còn 1 mili giây trước hạn 2 giờ vẫn nhận được", async () => {
  const f = fixture();
  f.store.now = Date.parse(f.store.offer.deadline) - 1;

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-2h-before')).resolves.toMatchObject({ state: 'ASSIGNED' });
  expect(f.store.offer.state).toBe('ACCEPTED');
});

// SRS: GBR-12; UC-35 Alternative Step 5 — answer time passed; III.11.1.
test("OFFER-01-UTCID06 [B] Đúng hạn trả lời 2 giờ không được nhận nữa", async () => {
  const f = fixture();
  f.store.now = Date.parse(f.store.offer.deadline);

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'OFFER_EXPIRED', message: "Offer deadline has passed",
  });
  expectNoDecisionWrite(f);
});

// SRS: GBR-12; UC-35 Alternative Step 5 — answer time passed.
test("OFFER-01-UTCID07 [B] Quá hạn trả lời 2 giờ 1 mili giây bị từ chối", async () => {
  const f = fixture();
  f.store.now = Date.parse(f.store.offer.deadline) + 1;

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'OFFER_EXPIRED', message: "Offer deadline has passed",
  });
  expectNoDecisionWrite(f);
});

// SRS: UC-35 Preconditions / bước 5 — offer still open.
test("OFFER-01-UTCID08 [A] Lời mời đã đóng không được nhận lại", async () => {
  const f = fixture();
  f.store.offer.state = 'DECLINED';

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'OFFER_NOT_PENDING', message: "Offer is no longer pending",
  });
  expectNoDecisionWrite(f);
});

// SRS: UC-35 Alternative Step 5.2; GBR-13 — first saved keeps the visit.
test("OFFER-01-UTCID09 [A] Staff hoặc sitter khác đã nhận trước thì không phân công đè", async () => {
  const f = fixture();
  f.store.visit.state = 'ASSIGNED';
  f.store.visit.sitterId = OTHER;

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'VISIT_ALREADY_ASSIGNED', message: "Visit already has another sitter",
  });
  expectNoDecisionWrite(f);
});

// SRS: UC-35 Preconditions — not suspended; GBR-04 — no new visits.
test("OFFER-01-UTCID10 [A] Sitter bị đình chỉ sau khi nhận offer không được Accept", async () => {
  const f = fixture();
  f.store.eligibility = { eligible: false, code: 'SITTER_NOT_ELIGIBLE' };

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'SITTER_NOT_ELIGIBLE', message: "Sitter is no longer eligible",
  });
  expectNoDecisionWrite(f);
});

// SRS: UC-35 bước 5 / Alternative Step 5.3; GBR-12.
test("OFFER-01-UTCID11 [A] Có visit trùng giờ kể cả thời gian di chuyển thì không được Accept", async () => {
  const f = fixture();
  f.store.slotAvailable = false;

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'SLOT_UNAVAILABLE', message: "Visit slot is no longer available",
  });
  expectNoDecisionWrite(f);
});

// SRS: GBR-12; III.11.1 — answer time 30 min for visits starting within 24 h.
test("OFFER-01-UTCID12 [B] Lượt sắp bắt đầu còn 1 mili giây trước hạn 30 phút vẫn nhận được", async () => {
  const f = fixture();
  urgentOffer(f);
  f.store.now = Date.parse(f.store.offer.deadline) - 1;

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-30m-before')).resolves.toMatchObject({ state: 'ASSIGNED' });
  expect(f.store.offer.state).toBe('ACCEPTED');
});

// SRS: GBR-12; UC-35 Alternative Step 5; III.11.1 — hạn 30 phút.
test("OFFER-01-UTCID13 [B] Lượt sắp bắt đầu đúng hạn 30 phút không được nhận nữa", async () => {
  const f = fixture();
  urgentOffer(f);
  f.store.now = Date.parse(f.store.offer.deadline);

  await expect(f.accept(f.actor, OFFER, 1, 'srs-accept-guard')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'OFFER_EXPIRED', message: "Offer deadline has passed",
  });
  expectNoDecisionWrite(f);
});
