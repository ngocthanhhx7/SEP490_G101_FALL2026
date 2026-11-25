import { test, expect, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { createBookingCheckoutService } from '../../../src/services/booking-proposals/booking-checkout.service.js';

// CHECKOUT-04: mỗi test khớp một UTCID trong CHECKOUT-04_paymentLink.
// Chỉ tình huống SRS ghi bên cạnh test; không kiểm tra các nhánh kỹ thuật ngoài SRS.
// Model/provider/index/transaction giả. Không chứng minh MongoDB, rollback hoặc payOS thật.

function same(a, b) {
  const absentA = a === null || a === undefined;
  const absentB = b === null || b === undefined;
  if (absentA || absentB) return absentA && absentB;
  return String(a) === String(b);
}
function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, wanted]) => {
    if (key === '$or') return wanted.some(value => matches(row, value));
    const actual = key.split('.').reduce((value, part) => value?.[part], row);
    const member = value => Array.isArray(actual) ? actual.some(item => same(item, value)) : same(actual, value);
    if (wanted && typeof wanted === 'object' && !(wanted instanceof Date) && !wanted.toHexString) {
      return Object.entries(wanted).every(([op, value]) => {
        if (op === '$in') return value.some(member);
        if (op === '$nin') return !value.some(member);
        if (op === '$ne') return !member(value);
        if (op === '$exists') return (actual !== undefined) === value;
        if (op === '$gt') return actual > value;
        if (op === '$gte') return actual >= value;
        if (op === '$lt') return actual < value;
        if (op === '$lte') return actual <= value;
        throw new Error('Query double thiếu toán tử ' + op);
      });
    }
    return member(wanted);
  });
}

const NOW = Date.parse('2026-11-12T03:00:00.000Z');
const IDS = Object.fromEntries(['owner', 'quote', 'service', 'pet', 'address', 'booking', 'visit', 'sitter', 'intent', 'other']
  .map((name, index) => [name, (index + 1).toString(16).padStart(24, '0')]));
const oid = name => new Types.ObjectId(IDS[name]);

// Query doubles và bộ lọc trong bộ nhớ; không mô phỏng transaction/rollback thật.
function query(value) {
  const result = {
    select: jest.fn(() => result), sort: jest.fn(() => result), limit: jest.fn(() => result),
    session: jest.fn(() => result), lean: jest.fn(async () => value), toArray: jest.fn(async () => value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return result;
}

const financeIndexes = {
  cases: [{ name: 'booking_source_lookup', key: { bookingId: 1 } }],
  refunds: [{ name: 'booking_source_lookup', key: { bookingId: 1 } }],
  visits: [{ name: 'booking_source_lookup', key: { bookingId: 1 } }],
  payments: [
    { name: 'verified_provider_event', key: { provider: 1, providerEventId: 1 }, unique: true },
    { name: 'one_verified_booking_receipt', key: { bookingId: 1 }, unique: true, partialFilterExpression: { state: 'VERIFIED' } },
    { name: 'one_verified_bank_reference', key: { provider: 1, providerTransactionReference: 1 }, unique: true,
      partialFilterExpression: { state: 'VERIFIED', providerTransactionReference: { $type: 'string' } } },
    { name: 'booking_receipt_state', key: { bookingId: 1, state: 1 } }
  ],
  taxassessments: [{ name: 'one_confirmed_booking_assessment', key: { bookingId: 1 }, unique: true, partialFilterExpression: { state: 'CONFIRMED' } }],
  paymentintents: [
    { name: 'payment_intent_provider_reference', key: { providerReference: 1 }, unique: true },
    { name: 'booking_payment_intent_state', key: { bookingId: 1, provider: 1, state: 1 } }
  ]
};

function fixture({ count = 1, serviceOptions = {} } = {}) {
  const actor = { userId: IDS.owner, state: 'ACTIVE', roles: ['CUSTOMER'] };
  const session = { id: 'synthetic-transaction' };
  const pet = { _id: oid('pet'), ownerId: IDS.owner, state: 'ACTIVE', version: 1, name: 'Synthetic pet', species: 'DOG', weightKg: 5, traits: [],
    careNeedsConfirmed: true, careProfile: { allergies: { status: 'UNKNOWN' } } };
  const address = { _id: oid('address'), ownerId: IDS.owner, state: 'ACTIVE', pointConfirmedAt: new Date(NOW - 3600000), version: 2, location: 'Synthetic customer address', areaCode: 'TEST_AREA',
    point: { type: 'Point', coordinates: [105.85, 21.02] }, privateAccessNotes: 'Synthetic private entry note' };
  const selection = { serviceId: IDS.service, petIds: [IDS.pet], durationMinutes: 60, visitCount: count };
  const quote = { _id: oid('quote'), ownerId: IDS.owner, kind: 'QUOTE', expiresAt: new Date(NOW + 3600000), snapshot: { input: { items: [selection] }, result: {
    currency: 'VND', baseVnd: 100000 * count, discountVnd: 0, subtotalVnd: 100000 * count,
    orderFeeVnd: 0, totalVnd: 100000 * count,
    items: [{ visitCount: count, lines: [{ code: 'BASE', amountVnd: 100000 * count }], subtotalVnd: 100000 * count,
      serviceVersion: 1, priceVersion: 1, policyVersion: 1, servicePolicyVersion: 1,
      petVersions: [{ id: IDS.pet, version: 1 }] }]
  } } };
  const body = { quoteId: IDS.quote, acceptServicePolicies: true, visits: Array.from({ length: count }, (_, index) => ({
    itemIndex: 0, startAt: new Date(NOW + 25 * 3600000 + index * 86400000).toISOString(), location: 'HOME', addressId: IDS.address
  })) };
  const storedVisit = { _id: oid('visit'), state: 'SCHEDULED', startAt: new Date(NOW + 3600000),
    endAt: new Date(NOW + 7200000), location: 'FACILITY', requestedSitterId: null,
    snapshots: { serviceName: 'Synthetic care', serviceAddress: 'Synthetic facility', care: { privateAccessNotes: 'private' } } };
  const booking = { _id: oid('booking'), customerId: oid('owner'), quoteId: oid('quote'), state: 'DISPATCH_PENDING',
    version: 0, paymentState: 'UNPAID', paymentMode: 'POSTPAY', paymentDeadlineAt: new Date(NOW + 900000),
    paymentSnapshot: { amountVnd: 100000 }, visitIds: [oid('visit')], checkoutSnapshot: { customerVisits: [storedVisit] } };
  const intent = { _id: oid('intent'), bookingId: oid('booking'), provider: 'PAYOS', providerReference: '1234567890123',
    amountVnd: 100000, expiresAt: booking.paymentDeadlineAt, state: 'PENDING' };
  const collections = {};
  const stores = { bookings: [booking], visits: [], paymentintents: [intent], cases: [] };
  function collection(name) {
    if (!collections[name]) collections[name] = {
      listIndexes: jest.fn(() => query(financeIndexes[name] ?? [])),
      find: jest.fn(filter => query((stores[name] ?? []).filter(row => matches(row, filter)))),
      findOne: jest.fn(async filter => (stores[name] ?? []).find(row => matches(row, filter)) ?? null),
      aggregate: jest.fn(() => query([])), insertOne: jest.fn(async document => { (stores[name] ??= []).push(document); return { acknowledged: true }; }),
      insertMany: jest.fn(async documents => { (stores[name] ??= []).push(...documents); return { acknowledged: true }; }),
      updateOne: jest.fn(async (filter, change) => {
        const row = (stores[name] ?? []).find(value => matches(value, filter));
        if (row && change.$set) Object.assign(row, change.$set);
        return { matchedCount: row ? 1 : 0 };
      }),
      findOneAndUpdate: jest.fn(async (filter, change) => {
        const row = (stores[name] ?? []).find(value => matches(value, filter));
        if (row && change.$set) Object.assign(row, change.$set);
        return row ?? null;
      })
    };
    return collections[name];
  }
  const modelNames = ['DecisionSnapshot', 'Pet', 'CustomerAddress', 'PetCareCommand', 'PetTrait', 'PetBreed',
    'Notification', 'NotificationEvent', 'FinanceSourceCommand', 'FinanceSourceEvent', 'EarningAccrualTask',
    'CareMediaBinding', 'ServiceVersion', 'ServicePolicyVersion', 'ServicePriceVersion', 'ServicePresentation',
    'SystemSettingVersion', 'PricingPolicy'];
  const models = Object.fromEntries(modelNames.map(name => [name, {
    modelName: name, findOne: jest.fn(() => query(null)), find: jest.fn(() => query([])),
    findById: jest.fn(() => query(null)), exists: jest.fn(() => query(null)), create: jest.fn(async rows => rows),
    collection: { listIndexes: jest.fn(() => query([
      { name: '_id_', key: { _id: 1 } },
      ...(name === 'CareMediaBinding' ? [{ name: 'visitId_1_kind_1', key: { visitId: 1, kind: 1 }, unique: true }] : [])
    ])), updateOne: jest.fn(async () => ({ matchedCount: 1 })) }
  }]));
  const version = { state: 'ACTIVE', version: 1, name: 'Synthetic care', scope: 'Synthetic scope' };
  const pricing = { version: 1, billingMode: 'PER_VISIT' };
  const presentation = { locations: ['FACILITY', 'HOME'], durationMinutes: 60 };
  models.DecisionSnapshot.findOne.mockImplementation(filter => query(matches(quote, filter) ? quote : null));
  models.ServiceVersion.findOne.mockImplementation(() => query(version));
  models.ServicePolicyVersion.findOne.mockImplementation(() => query({ state: 'PUBLISHED', version: 1 }));
  models.ServicePriceVersion.findOne.mockImplementation(() => query({ version: 1 }));
  models.ServicePresentation.findOne.mockImplementation(() => query(presentation));
  models.PricingPolicy.findOne.mockImplementation(() => query(pricing));
  models.SystemSettingVersion.findOne.mockImplementation(() => query({ enabled: true }));
  models.Pet.find.mockImplementation(filter => query(matches(pet, filter) ? [pet] : []));
  models.CustomerAddress.findOne.mockImplementation(filter => query(matches(address, filter) ? address : null));
  for (const name of ['sitterpublicprofiles', 'users', 'sitterstatuses']) collection(name).findOne.mockResolvedValue({});
  const connection = { models, model: jest.fn(() => { throw new Error('Unexpected model registration'); }),
    db: { collection: jest.fn(collection) }, transaction: jest.fn(async work => work(session)) };
  const provider = { createPaymentLink: jest.fn(async () => ({ checkoutUrl: 'https://pay.payos.vn/web/synthetic-link',
    orderCode: Number(intent.providerReference), amount: intent.amountVnd, currency: 'VND', paymentLinkId: 'synthetic-link' })) };
  const selectionGuard = jest.fn(async () => {});
  const service = createBookingCheckoutService({ connection, clock: () => NOW, provider, webOrigin: 'https://app.example.test',
    facilityAddress: 'Synthetic facility', facilityCoordinates: [105.85, 21.02], selectionGuard, ...serviceOptions });
  return { service, actor, body, quote, selection, pet, address, booking, intent, storedVisit, version, pricing, presentation,
    connection, models, collection, session, provider, selectionGuard, stores };
}


function payableFixture() {
  const f = fixture();
  // AWAITING_PAYMENT là trạng thái bill chờ trả; visits đã kết thúc, mode POSTPAY.
  f.booking.state = 'AWAITING_PAYMENT';
  f.booking.paymentMode = 'POSTPAY';
  f.booking.paymentDeadlineAt = new Date(NOW + 48 * 3600000);
  f.intent.expiresAt = f.booking.paymentDeadlineAt;
  f.storedVisit.state = 'COMPLETED';
  f.storedVisit.startAt = new Date(NOW - 2 * 3600000);
  f.storedVisit.endAt = new Date(NOW - 3600000);
  f.stores.visits.push({ ...f.storedVisit, bookingId: f.booking._id, petIds: [oid('pet')] });
  return f;
}

// SRS: UC-49 Preconditions/Normal Flow 2–3; GBR-17/18.
test("CHECKOUT-04-UTCID01 [N] Bill sau booking kết thúc tạo được link payOS", async () => {
  const f = payableFixture();

  const actual = await f.service.paymentLink(f.actor, IDS.booking, 'srs-payment-normal');

  expect(actual.checkoutUrl).toBe('https://pay.payos.vn/web/synthetic-link');
  expect(f.provider.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amount: 100000 }));
  expect(f.booking.paymentState).toBe('UNPAID');
});

// SRS: UC-25/49; GBR-17/18 R3: booking AWAITING_PAYMENT/PREPAY, visit SCHEDULED tạo được link payOS.
test("CHECKOUT-04-UTCID02 [N] Booking PREPAY chờ thanh toán khi visit SCHEDULED tạo link payOS", async () => {
  const f = payableFixture(); f.booking.paymentMode = 'PREPAY';
  f.storedVisit.state = 'SCHEDULED';
  f.stores.visits[0].state = 'SCHEDULED';
  f.stores.visits[0].startAt = new Date(NOW + 86400000);
  f.stores.visits[0].endAt = new Date(NOW + 90000000);
  f.storedVisit.startAt = f.stores.visits[0].startAt;
  f.storedVisit.endAt = f.stores.visits[0].endAt;

  const actual = await f.service.paymentLink(f.actor, IDS.booking, 'srs-payment-prepay-scheduled');
  expect(actual.checkoutUrl).toBe('https://pay.payos.vn/web/synthetic-link');
  expect(f.provider.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amount: 100000 }));
});

// SRS: R3 CHECKOUT-04-UTCID03: Booking chờ thanh toán tổng giá 100000 VND truyền đúng amount cho provider.
test("CHECKOUT-04-UTCID03 [B] Booking tổng giá 100000 tạo link thu đúng số tiền", async () => {
  const f = payableFixture();

  const actual = await f.service.paymentLink(f.actor, IDS.booking, 'srs-payment-exact-amount');
  expect(actual.checkoutUrl).toBe('https://pay.payos.vn/web/synthetic-link');
  expect(f.provider.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amount: 100000 }));
});

// SRS: R3 CHECKOUT-04-UTCID04: Booking PREPAY chưa thực hiện tạo được link trả trước.
test("CHECKOUT-04-UTCID04 [N] Booking PREPAY chưa thực hiện trả link thanh toán", async () => {
  const f = payableFixture(); f.booking.paymentMode = 'PREPAY';

  const actual = await f.service.paymentLink(f.actor, IDS.booking, 'srs-payment-prepay-open');
  expect(actual.checkoutUrl).toBe('https://pay.payos.vn/web/synthetic-link');
  expect(f.provider.createPaymentLink).toHaveBeenCalledTimes(1);
});

// SRS: UC-49 Alternative Step 3; MSG33.
test("CHECKOUT-04-UTCID05 [A] payOS không tạo được link giữ bill chưa thanh toán", async () => {
  const f = payableFixture();
  const unavailable = new Error('Synthetic provider refused before creating a link');
  f.provider.createPaymentLink.mockRejectedValueOnce(unavailable);

  await expect(f.service.paymentLink(f.actor, IDS.booking, 'srs-payment-provider-fail')).rejects.toBe(unavailable);
  expect(f.booking.paymentState).toBe('UNPAID');
  expect(f.provider.createPaymentLink).toHaveBeenCalledTimes(1);
});

// SRS: UC-49 Alternative Step 3: customer can try again; MSG33.
test("CHECKOUT-04-UTCID06 [N] Có thể thử lại sau khi provider từ chối rõ ràng tạo link", async () => {
  const f = payableFixture();
  const refused = Object.assign(new Error('Synthetic provider refused before creating a link'), {
    code: 'PAYOS_REQUEST_REJECTED',
    details: { uncertain: false }
  });
  f.provider.createPaymentLink.mockRejectedValueOnce(refused);
  await expect(f.service.paymentLink(f.actor, IDS.booking, 'srs-payment-retry-first')).rejects.toBe(refused);

  const actual = await f.service.paymentLink(f.actor, IDS.booking, 'srs-payment-retry-second');

  expect(actual.checkoutUrl).toBe('https://pay.payos.vn/web/synthetic-link');
  expect(f.provider.createPaymentLink).toHaveBeenCalledTimes(2);
  expect(f.booking.paymentState).toBe('UNPAID');
});

// SRS: I.4.4 Booking pay/view Restricted; note 5; GBR-02.
test("CHECKOUT-04-UTCID07 [A] Không tạo link trả bill của Customer khác", async () => {
  const f = payableFixture(); f.actor.userId = IDS.other;

  await expect(f.service.paymentLink(f.actor, IDS.booking, 'srs-payment-foreign')).rejects.toMatchObject({
    name: 'AppError', status: 404, code: 'RESOURCE_NOT_FOUND',
  });
  expect(f.provider.createPaymentLink).not.toHaveBeenCalled();
});

// SRS: GBR-01; UC-49 Customer; IV.2.3 Sign-in required.
test("CHECKOUT-04-UTCID08 [A] Guest không tạo được link thanh toán", async () => {
  const f = payableFixture();

  await expect(f.service.paymentLink(null, IDS.booking, 'srs-payment-guest')).rejects.toMatchObject({
    name: 'AppError', status: 401, code: 'UNAUTHENTICATED',
  });
  expect(f.provider.createPaymentLink).not.toHaveBeenCalled();
});
