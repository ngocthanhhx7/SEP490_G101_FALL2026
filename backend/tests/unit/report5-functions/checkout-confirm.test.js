import { test, expect, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { createBookingCheckoutService } from '../../../src/services/booking-proposals/booking-checkout.service.js';

// CHECKOUT-02: mỗi test khớp một UTCID trong CHECKOUT-02_confirm.
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
      distinct: jest.fn(async () => []),
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
    if (name === 'users') collections[name].findOneAndUpdate.mockResolvedValue({
      _id: oid('owner'), state: 'ACTIVE', roles: ['CUSTOMER']
    });
    return collections[name];
  }
  const modelNames = ['DecisionSnapshot', 'Pet', 'CustomerAddress', 'PetCareCommand', 'PetTrait', 'PetBreed',
    'Notification', 'NotificationEvent', 'FinanceSourceCommand', 'FinanceSourceEvent', 'EarningAccrualTask',
    'CareMediaBinding', 'ServiceVersion', 'ServicePolicyVersion', 'ServicePriceVersion', 'ServicePresentation',
    'SystemSettingVersion', 'PricingPolicy', 'Service', 'ServiceArea', 'ServiceAreaCommand'];
  const models = Object.fromEntries(modelNames.map(name => [name, {
    modelName: name, findOne: jest.fn(() => query(null)), find: jest.fn(() => query([])),
    findById: jest.fn(() => query(null)), exists: jest.fn(() => query(null)), create: jest.fn(async rows => rows),
    updateOne: jest.fn(async () => ({ matchedCount: 1 })),
    collection: { listIndexes: jest.fn(() => query([
      { name: '_id_', key: { _id: 1 } },
      ...(name === 'CareMediaBinding' ? [{ name: 'visitId_1_kind_1', key: { visitId: 1, kind: 1 }, unique: true }] : [])
    ])), updateOne: jest.fn(async () => ({ matchedCount: 1 })) }
  }]));
  const version = { state: 'ACTIVE', version: 1, name: 'Synthetic care', scope: 'Synthetic scope' };
  const pricing = { version: 1, billingMode: 'PER_VISIT' };
  const presentation = { locations: ['FACILITY', 'HOME'], durationMinutes: 60 };
  models.Service.findById.mockImplementation(() => query({ presentation }));
  models.ServiceArea.findById.mockImplementation(() => query({ _id: 'coverage-policy' }));
  models.ServiceArea.exists.mockImplementation(() => query(true));
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
  const connection = { models, model: jest.fn(name => (models[name] ??= {
    modelName: name, collection: { countDocuments: jest.fn(async () => 0) }
  })),
    db: { collection: jest.fn(collection) }, transaction: jest.fn(async work => work(session)) };
  const provider = { createPaymentLink: jest.fn(async () => ({ checkoutUrl: 'https://pay.payos.vn/web/synthetic-link',
    orderCode: Number(intent.providerReference), amount: intent.amountVnd, currency: 'VND', paymentLinkId: 'synthetic-link' })) };
  const selectionGuard = jest.fn(async () => {});
  const service = createBookingCheckoutService({ connection, clock: () => NOW, provider, webOrigin: 'https://app.example.test',
    facilityAddress: 'Synthetic facility', facilityCoordinates: [105.85, 21.02], selectionGuard, ...serviceOptions });
  return { service, actor, body, quote, selection, pet, address, booking, intent, storedVisit, version, pricing, presentation,
    connection, models, collection, session, provider, selectionGuard, stores };
}


function noBookingWrites(f) {
  expect(f.collection('bookings').insertOne).not.toHaveBeenCalled();
  expect(f.collection('visits').insertMany).not.toHaveBeenCalled();
  expect(f.collection('paymentintents').insertOne).not.toHaveBeenCalled();
}

// SRS: UC-25 bước 3–7; GBR-17: every checkout, including one visit, is PREPAY.
test("CHECKOUT-02-UTCID01 [N] Tạo booking một lượt và giữ bản sao giá địa chỉ chính sách", async () => {
  const f = fixture();

  const actual = await f.service.confirm(f.actor, f.body, 'srs-confirm-normal');

  expect(actual).toMatchObject({ totalVnd: 100000, paymentMode: 'PREPAY', paymentState: 'UNPAID' });
  const saved = f.collection('bookings').insertOne.mock.calls[0][0];
  const visit = f.collection('visits').insertMany.mock.calls[0][0][0];
  expect(saved.checkoutSnapshot).toMatchObject({ consentAt: new Date(NOW), quote: { totalVnd: 100000 } });
  expect(visit.snapshots).toMatchObject({ serviceAddress: f.address.location, priceVersion: 1, servicePolicyVersion: 1 });
  expect(visit.sitterId).toBeNull();
});

// SRS: GBR-34; III.7.1 Responsibility policy.
test("CHECKOUT-02-UTCID02 [A] Chưa chấp nhận chính sách trách nhiệm bị từ chối", async () => {
  const f = fixture(); f.body.acceptServicePolicies = false;

  await expect(f.service.confirm(f.actor, f.body, 'srs-confirm-consent')).rejects.toMatchObject({
    name: 'AppError', status: 422, code: 'SERVICE_POLICY_CONSENT_REQUIRED',
  });
  noBookingWrites(f);
});

// SRS: GBR-09; MSG19: tối thiểu 2 giờ; 1 lượt PREPAY.
test("CHECKOUT-02-UTCID03 [B] Chấp nhận giờ bắt đầu đúng biên 2 giờ", async () => {
  const f = fixture(); f.body.visits[0].startAt = new Date(NOW + 2 * 3600000).toISOString();

  await expect(f.service.confirm(f.actor, f.body, 'srs-confirm-2h')).resolves.toMatchObject({ paymentMode: 'PREPAY' });
  expect(f.collection('bookings').insertOne).toHaveBeenCalledTimes(1);
});

// SRS: GBR-09; MSG19: từ chối giờ bắt đầu ngay dưới 2 giờ.
test("CHECKOUT-02-UTCID04 [B] Từ chối giờ bắt đầu ngay dưới 2 giờ", async () => {
  const f = fixture(); f.body.visits[0].startAt = new Date(NOW + 2 * 3600000 - 60000).toISOString();

  await expect(f.service.confirm(f.actor, f.body, 'srs-confirm-too-soon')).rejects.toMatchObject({ name: 'AppError' });
  noBookingWrites(f);
});

// SRS: GBR-09; III.7.1 From date/To date; MSG20.
test("CHECKOUT-02-UTCID05 [B] Chấp nhận lịch từ ngày đầu đến ngày cuối trong 30 ngày", async () => {
  const f = fixture({ count: 31 });

  const actual = await f.service.confirm(f.actor, f.body, 'srs-confirm-30days');

  expect(actual.visits).toHaveLength(31);
  expect(f.collection('bookings').insertOne).toHaveBeenCalledTimes(1);
});

// SRS: GBR-09; III.7.1 From date/To date; MSG20.
test("CHECKOUT-02-UTCID06 [B] Từ chối lịch vượt giới hạn 30 ngày", async () => {
  const f = fixture({ count: 32 });

  await expect(f.service.confirm(f.actor, f.body, 'srs-confirm-31days')).rejects.toMatchObject({ name: 'AppError', code: 'MSG20' });
  noBookingWrites(f);
});

// SRS: GBR-09; III.7.1 Visits per day: R3 bỏ giới hạn 2 visit/ngày, chấp nhận 3 lượt không chồng lấn.
test("CHECKOUT-02-UTCID07 [N] Chấp nhận ba lượt trong cùng một ngày không chồng lấn", async () => {
  const f = fixture({ count: 3 });
  for (const [index, visit] of f.body.visits.entries()) visit.startAt = new Date(NOW + (25 + 2 * index) * 3600000).toISOString();

  const actual = await f.service.confirm(f.actor, f.body, 'srs-confirm-three-day');
  expect(actual.visits).toHaveLength(3);
});

// SRS: GBR-33; III.7.1 Confirm booking; MSG68.
test("CHECKOUT-02-UTCID08 [A] Pet đã có lượt khác trùng giờ không được đặt tiếp", async () => {
  const f = fixture();
  f.stores.visits.push({ _id: oid('visit'), petIds: [oid('pet')], state: 'ASSIGNED',
    startAt: new Date(NOW + 25 * 3600000 + 60000), endAt: new Date(NOW + 26 * 3600000) });

  await expect(f.service.confirm(f.actor, f.body, 'srs-confirm-overlap')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'VISIT_SCHEDULE_OVERLAP',
  });
  noBookingWrites(f);
});

// SRS: UC-25 bước 2–3; III.7.1 Pets: pet của Customer.
test("CHECKOUT-02-UTCID09 [A] Không dùng pet của Customer khác", async () => {
  const f = fixture(); f.pet.ownerId = IDS.other;

  await expect(f.service.confirm(f.actor, f.body, 'srs-confirm-foreign-pet')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'QUOTE_CHANGED',
  });
  noBookingWrites(f);
});

// SRS: UC-25 bước 2–3; III.7.1 Address: saved address của Customer.
test("CHECKOUT-02-UTCID10 [A] Không dùng địa chỉ của Customer khác", async () => {
  const f = fixture(); f.address.ownerId = IDS.other;

  await expect(f.service.confirm(f.actor, f.body, 'srs-confirm-foreign-address')).rejects.toMatchObject({
    name: 'AppError', status: 404, code: 'RESOURCE_NOT_FOUND',
  });
  noBookingWrites(f);
});

// SRS: UC-25 Description/Postconditions; III.7.1; GBR-17/18 R3: nhiều lượt trả trước PREPAY.
test("CHECKOUT-02-UTCID11 [N] Hai lượt thanh toán PREPAY và tạo intent", async () => {
  const f = fixture({ count: 2 });

  const actual = await f.service.confirm(f.actor, f.body, 'srs-confirm-multi-prepay');

  expect(actual.totalVnd).toBe(200000);
  expect(actual.paymentMode).toBe('PREPAY');
  expect(f.collection('paymentintents').insertOne).toHaveBeenCalledTimes(1);
});

// SRS: UC-23 Alternative Step 6.1: lấy giá có hiệu lực lúc Confirm.
test("CHECKOUT-02-UTCID12 [A] Giá đã đổi trước Confirm phải yêu cầu xác nhận lại giá", async () => {
  const f = fixture();
  f.models.ServicePriceVersion.findOne.mockReturnValue(query({ version: 2 }));

  await expect(f.service.confirm(f.actor, f.body, 'srs-confirm-price-change')).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'QUOTE_CHANGED',
  });
  noBookingWrites(f);
});

// SRS: GBR-01; UC-25 Preconditions.
test("CHECKOUT-02-UTCID13 [A] Guest không được xác nhận booking", async () => {
  const f = fixture();

  await expect(f.service.confirm(null, f.body, 'srs-confirm-guest')).rejects.toMatchObject({
    name: 'AppError', status: 401, code: 'UNAUTHENTICATED',
  });
  noBookingWrites(f);
});
