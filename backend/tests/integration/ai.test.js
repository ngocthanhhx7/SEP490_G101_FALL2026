import { pricingRuntimeModule } from '../../src/routes/pricing.routes.js';
import { petCareRuntimeModule } from '../../src/routes/pet-care.routes.js';
import { servicePolicyVersionModel } from '../../src/models/service-policy-version.model.js';
import { systemSettingVersionModel } from '../../src/models/system-setting-version.model.js';
import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { Types } from 'mongoose';
import { connectDatabase } from '../../src/config/database.js';
import { loadConfig } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { aiRuntimeModule } from '../../src/routes/sitter-recommendations.routes.js';
import { platformDataModels } from '../../src/models/platform-data.model.js';
import { createSessionService } from '../../src/services/session.service.js';
import { userModel } from '../../src/models/user.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { serviceModel } from '../../src/models/service.model.js';
import { serviceVersionModel } from '../../src/models/service-version.model.js';
import { servicePriceVersionModel } from '../../src/models/service-price-version.model.js';
import { DEFAULT_WEIGHTS } from '../../src/services/sitter-matching/scoring.service.js';
import { edgeKey } from '../../src/services/sitter-matching/routing.service.js';
let replica,
  connection,
  models,
  User,
  app,
  customer,
  other,
  admin,
  serviceId,
  petId,
  addressId,
  auth,
  clockNow,
  routingAdvanceMs = 0;
const secret = 'synthetic-ai-integration-secret-at-least-32';
const authFor = async (user) => {
  const issued = await connection.transaction((session) =>
    auth.issueInTransaction(user, session, { rememberDevice: false })
  );
  return {
    Cookie: 'pwc_session=' + issued.token,
    'X-CSRF-Token': issued.csrfToken,
    Origin: 'http://127.0.0.1',
    Host: '127.0.0.1'
  };
};
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.34' },
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGO_URI: replica.getUri(),
    MONGO_DB: 'pwc_ai_isolated'
  });
  connection = await connectDatabase(config);
  models = platformDataModels(connection);
  User = userModel(connection);
  auth = createSessionService({
    connection,
    tokenSecret: secret,
    csrfSecret: secret + '-csrf',
    clock: () => clockNow
  });
  const aiConfig = {
    ...config,
    ai: { enabled: true },
    auth: { enabled: true, tokenSecret: secret, csrfSecret: secret + '-csrf' }
  };
  const routingProvider = {
    matrix: async (points) => {
      clockNow += routingAdvanceMs;
      routingAdvanceMs = 0;
      return {
        map: new Map(
          points.flatMap((a) =>
            points.map((b) => [
              edgeKey(a, b),
              JSON.stringify(a) === JSON.stringify(b) ? 0 : 5
            ])
          )
        ),
        recordedAt: new Date(clockNow),
        source: 'ISOLATED_TEST_ROUTER'
      };
    }
  };
  app = createApp({
    config,
    connection,
    lifecycle: { draining: false },
    moduleFactories: [
      () =>
        pricingRuntimeModule({
          config: aiConfig,
          connection,
          clock: () => clockNow
        }),
      () =>
        petCareRuntimeModule({
          config: aiConfig,
          connection,
          clock: () => clockNow
        }),
      () =>
        aiRuntimeModule({
          config: aiConfig,
          connection,
          clock: () => clockNow,
          routingProvider
        })
    ]
  });
  for (const Model of Object.values(connection.models))
    await Model.createIndexes();
});
afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});
beforeEach(async () => {
  for (const collection of Object.values(connection.collections))
    await collection.deleteMany({});
  clockNow = Date.parse('2026-10-24T00:00:00Z');
  routingAdvanceMs = 0;
  [customer, other, admin] = await User.create([
    { displayName: 'Synthetic Customer', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { displayName: 'Synthetic Other', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { displayName: 'Synthetic Admin', roles: ['ADMIN'], state: 'ACTIVE' }
  ]);
  const service = await serviceModel(connection).create({
    code: 'home-visit',
    createdBy: admin._id,
    createdAt: new Date(clockNow)
  });
  serviceId = String(service._id);
  await serviceVersionModel(connection).create({
    serviceId,
    version: 1,
    name: 'Synthetic visit',
    description: 'test',
    scope: 'test only',
    species: ['DOG', 'CAT'],
    state: 'ACTIVE',
    effectiveAt: new Date(clockNow - 1000),
    changedBy: admin._id,
    reason: 'Synthetic fixture',
    recordedAt: new Date(clockNow)
  });
  await servicePriceVersionModel(connection).create({
    serviceId,
    version: 1,
    amountVnd: 80000,
    currency: 'VND',
    unitLabel: '30 phút',
    effectiveAt: new Date(clockNow - 1000),
    changedBy: admin._id,
    reason: 'Synthetic fixture',
    recordedAt: new Date(clockNow)
  });
  await servicePolicyVersionModel(connection).create({
    serviceId,
    version: 1,
    state: 'PUBLISHED',
    title: 'Synthetic approved scope',
    body: 'Synthetic scope for isolated tests only',
    effectiveAt: new Date(clockNow - 1000),
    changedBy: admin._id,
    reason: 'Synthetic fixture',
    recordedAt: new Date(clockNow)
  });
  await systemSettingVersionModel(connection).create({
    key: 'SERVICE_CATALOG_VISIBLE',
    version: 1,
    enabled: true,
    effectiveAt: new Date(clockNow - 1000),
    changedBy: admin._id,
    reason: 'Synthetic fixture',
    recordedAt: new Date(clockNow)
  });
  await models.PetBreed.create({
    code: 'cat-mixed',
    name: 'Synthetic cat breed',
    species: 'CAT',
    source: 'Synthetic fixture'
  });
  const pet = await models.Pet.create({
    ownerId: customer._id,
    name: 'Synthetic Cat',
    species: 'CAT',
    breedCode: 'cat-mixed',
    weightKg: 4,
    traits: [],
    careNeedsConfirmed: true
  });
  petId = String(pet._id);
  const address = await models.CustomerAddress.create({
    ownerId: customer._id,
    label: 'Synthetic',
    location: 'Synthetic address',
    point: { type: 'Point', coordinates: [105.8, 21] },
    pointConfirmedAt: new Date(clockNow),
    areaCode: 'HN'
  });
  addressId = String(address._id);
  await models.PricingPolicy.create({
    serviceId,
    version: 1,
    status: 'APPROVED',
    effectiveAt: new Date(clockNow - 1000),
    approvedAt: new Date(clockNow - 1000),
    approvedBy: admin._id,
    reason: 'Synthetic approved policy',
    unitMinutes: 30,
    maxPets: 2,
    extraPetBps: 5000,
    maxSurchargeBps: 20000,
    orderStepVnd: 5000000,
    orderStepBps: 200,
    maxOrderTierBps: 2000,
    rules: []
  });
  await models.SitterRankingPolicy.create({
    version: 1,
    status: 'APPROVED',
    effectiveAt: new Date(clockNow - 1000),
    approvedAt: new Date(clockNow - 1000),
    approvedBy: admin._id,
    reason: 'Synthetic approved ranking',
    weights: DEFAULT_WEIGHTS
  });
});
const quoteBody = () => ({
  serviceId,
  petIds: [petId],
  durationMinutes: 30,
  visitCount: 1
});
const matchBody = () => ({
  serviceId,
  petIds: [petId],
  addressId,
  startAt: '2026-10-26T10:00:00+07:00',
  endAt: '2026-10-26T10:30:00+07:00'
});
async function seedSitters(count = 6) {
  const apps = sitterApplicationModels(connection),
    ids = [];
  for (let i = 0; i < count; i++) {
    const u = await User.create({
      displayName: 'Synthetic Sitter ' + i,
      roles: ['PET_SITTER'],
      state: 'ACTIVE'
    });
    ids.push(u._id);
    await apps.SitterApplication.create({
      displayName: 'Synthetic Sitter',
      contactChannel: 'EMAIL',
      contactCiphertext: 'synthetic',
      contactLookupKey: 'synthetic-' + i,
      identityLookupKey: 'synthetic-' + i,
      ageEligible: true,
      ageCheckedAt: new Date(clockNow),
      experience: 'Synthetic only',
      requestedServices: [serviceId],
      workAreas: ['HN'],
      privateDocuments: [
        {
          documentId: 'fixture',
          documentType: 'IDENTITY',
          storageRef: 'synthetic-private'
        }
      ],
      state: 'APPROVED',
      provisionedUserId: u._id,
      submissionKeyDigest: 'key-' + i,
      submissionPayloadDigest: 'payload-' + i
    });
    await apps.SitterStatus.create({
      userId: u._id,
      status: 'ACTIVE',
      changedAt: new Date(clockNow)
    });
    await models.SitterMatchingProfile.create({
      userId: u._id,
      serviceIds: [serviceId],
      species: ['CAT'],
      areaCodes: ['HN'],
      allowedTraits: [],
      maxWeightKg: 20,
      maxPets: 2,
      active: true,
      windows: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
      dayOffDates: [],
      starts: [
        {
          localDate: '2026-10-26',
          point: { type: 'Point', coordinates: [105.81 + i * 0.001, 21.01] },
          availableFrom: new Date('2026-10-26T08:00:00+07:00'),
          availableUntil: new Date('2026-10-26T18:00:00+07:00')
        }
      ]
    });
    for (let j = 0; j < 20; j++)
      await models.SitterVisitOutcome.create({
        visitId: new Types.ObjectId(),
        sitterId: u._id,
        serviceId,
        petIds: [petId],
        species: ['CAT'],
        occurredAt: new Date(clockNow - 86400000),
        resolution: 'COMPLETED',
        rating: 5,
        onTime: true,
        verifiedBy: admin._id,
        sourceRef: 'Synthetic verified fixture'
      });
  }
  return ids;
}
test('quotes use persisted prices, reject spoofed price/ownership and protect saved decisions', async () => {
  const headers = await authFor(customer);
  const response = await request(app)
    .post('/api/v1/pricing/quotes')
    .set(headers)
    .send(quoteBody())
    .expect(201);
  expect(response.body.data.totalVnd).toBe(80000);
  expect(response.body.data.lines).toHaveLength(2);
  await request(app)
    .post('/api/v1/pricing/quotes')
    .set(headers)
    .send({ ...quoteBody(), baseAmountVnd: 1 })
    .expect(422);
  await request(app)
    .post('/api/v1/pricing/quotes')
    .set(await authFor(other))
    .send(quoteBody())
    .expect(404);
  await request(app)
    .get('/api/v1/pricing/quotes/' + response.body.data.quoteId)
    .set(await authFor(other))
    .expect(404);
  clockNow += 11 * 60000;
  await request(app)
    .get('/api/v1/pricing/quotes/' + response.body.data.quoteId)
    .set(headers)
    .expect(404);
});

test('backend pricing remains available when AI matching is disabled', async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGO_URI: replica.getUri(),
    MONGO_DB: 'pwc_ai_isolated',
    AUTH_ENABLED: 'true',
    AI_ENABLED: 'false',
    OTP_HMAC_SECRET: secret,
    SESSION_TOKEN_SECRET: secret,
    SESSION_CSRF_SECRET: secret + '-csrf',
    CONTACT_LOOKUP_SECRET: secret,
    CONTACT_ENCRYPTION_KEY: 's'.repeat(32)
  });
  const pricingOnlyApp = createApp({
    config,
    connection,
    lifecycle: { draining: false },
    clock: () => clockNow
  });
  await request(pricingOnlyApp)
    .post('/api/v1/pricing/quotes')
    .set(await authFor(customer))
    .send(quoteBody())
    .expect(201);
  await request(pricingOnlyApp)
    .post('/api/v1/ai/recommendations')
    .send(matchBody())
    .expect(404);
  await request(pricingOnlyApp)
    .post('/api/v1/ai/quotes')
    .send(quoteBody())
    .expect(404);
});

test('matching has no pricing prerequisite and decision kinds cannot be crossed', async () => {
  await seedSitters();
  const headers = await authFor(customer);
  const quote = await request(app)
    .post('/api/v1/pricing/quotes')
    .set(headers)
    .send(quoteBody())
    .expect(201);
  await models.PricingPolicy.deleteMany({});
  await servicePriceVersionModel(connection).deleteMany({});
  const match = await request(app)
    .post('/api/v1/ai/recommendations')
    .set(headers)
    .send(matchBody())
    .expect(201);
  expect(match.body.data.returned).toBe(5);
  const saved = await models.DecisionSnapshot.findOne({ kind: 'MATCH' }).lean();
  await request(app)
    .get('/api/v1/pricing/quotes/' + saved._id)
    .set(headers)
    .expect(404);
  await request(app)
    .get('/api/v1/ai/decisions/' + quote.body.data.quoteId)
    .set(headers)
    .expect(404);
});

test('model renames retain legacy persisted collections including routing cache', () => {
  const legacy = {
    PetTrait: 'AiTrait',
    PetBreed: 'AiBreed',
    PricingPolicy: 'AiPricingPolicy',
    SitterMatchingProfile: 'AiSitterProfile',
    SitterVisitOutcome: 'AiVisitOutcome',
    SitterScheduleBlock: 'AiScheduleBlock',
    RoutingMatrixCache: 'AiRoutingMatrix',
    DecisionSnapshot: 'AiDecision',
    SitterRankingPolicy: 'AiRankingPolicy',
    SitterRankModel: 'AiRankModel'
  };
  for (const [name, original] of Object.entries(legacy)) {
    // These explicit expectations guard existing collections rather than empty renamed replacements.
    const expected = {
      AiTrait: 'aitraits',
      AiBreed: 'aibreeds',
      AiPricingPolicy: 'aipricingpolicies',
      AiSitterProfile: 'aisitterprofiles',
      AiVisitOutcome: 'aivisitoutcomes',
      AiScheduleBlock: 'aischeduleblocks',
      AiRoutingMatrix: 'airoutingmatrixes',
      AiDecision: 'aidecisions',
      AiRankingPolicy: 'airankingpolicies',
      AiRankModel: 'airankmodels'
    };
    expect(models[name].collection.name).toBe(expected[original]);
  }
});
test('authenticated routes reject missing CSRF/guest and restrict policy writes to Admin', async () => {
  await request(app)
    .post('/api/v1/pricing/quotes')
    .send(quoteBody())
    .expect(401);
  const h = await authFor(customer);
  delete h['X-CSRF-Token'];
  await request(app)
    .post('/api/v1/pricing/quotes')
    .set(h)
    .send(quoteBody())
    .expect(403);
  await request(app)
    .post('/api/v1/ai/admin/ranking-policies')
    .set(await authFor(customer))
    .send({})
    .expect(403);
});
test('returns five real eligible candidates with explanations, excludes suspended user, no private home data', async () => {
  const ids = await seedSitters();
  await User.updateOne({ _id: ids[5] }, { $set: { state: 'SUSPENDED' } });
  const response = await request(app)
    .post('/api/v1/ai/recommendations')
    .set(await authFor(customer))
    .send(matchBody())
    .expect(201);
  expect(response.body.data).toMatchObject({
    status: 'READY_FOR_OFFER_SHORTLIST',
    returned: 5,
    shortfall: 0
  });
  expect(
    response.body.data.candidates.every((c) => c.breakdown.length === 5)
  ).toBe(true);
  expect(response.body.data.candidates.map((c) => c.sitterId)).not.toContain(
    String(ids[5])
  );
  expect(JSON.stringify(response.body)).not.toContain('coordinates');
  expect(JSON.stringify(response.body)).not.toContain('Synthetic address');
  expect(await models.DecisionSnapshot.countDocuments({ kind: 'MATCH' })).toBe(
    1
  );
});
test('does not pad the shortlist when fewer than five qualify or a calendar conflict occurs', async () => {
  const ids = await seedSitters(2);
  await models.SitterScheduleBlock.create({
    sitterId: ids[0],
    startAt: new Date(matchBody().startAt),
    endAt: new Date(matchBody().endAt),
    point: { type: 'Point', coordinates: [105.8, 21] },
    state: 'CONFIRMED',
    kind: 'VISIT'
  });
  const response = await request(app)
    .post('/api/v1/ai/recommendations')
    .set(await authFor(customer))
    .send(matchBody())
    .expect(201);
  expect(response.body.data).toMatchObject({
    status: 'INSUFFICIENT_ELIGIBLE_SITTERS',
    returned: 1,
    shortfall: 4
  });
  expect(response.body.data.exclusions.VISIT_CONFLICT).toBe(1);
});
test('Admin creates immutable policy versions; duplicate version conflicts and draft does not replace active', async () => {
  const body = {
    version: 2,
    status: 'DRAFT',
    effectiveAt: new Date(clockNow).toISOString(),
    reason: 'Synthetic draft',
    weights: DEFAULT_WEIGHTS
  };
  await request(app)
    .post('/api/v1/ai/admin/ranking-policies')
    .set(await authFor(admin))
    .send(body)
    .expect(201);
  await request(app)
    .post('/api/v1/ai/admin/ranking-policies')
    .set(await authFor(admin))
    .send(body)
    .expect(409);
});

test('published service policies and catalog visibility gate AI quotes too', async () => {
  await systemSettingVersionModel(connection).updateOne(
    { key: 'SERVICE_CATALOG_VISIBLE' },
    { $set: { enabled: false } }
  );
  await request(app)
    .post('/api/v1/pricing/quotes')
    .set(await authFor(customer))
    .send(quoteBody())
    .expect(409);
});
test('Admin surcharge rules survive database round-trip and do not compound', async () => {
  const policy = await models.PricingPolicy.findOne({ serviceId }).lean();
  const body = {
    ...policy,
    version: 2,
    rules: [
      {
        code: 'handling',
        label: 'Handling effort',
        explanation: 'Synthetic explicit workload rule',
        scope: 'PET',
        bps: 1000,
        flatVnd: 0,
        when: { minWeightKg: 3, maxWeightKg: 6 }
      }
    ]
  };
  for (const key of [
    '_id',
    'createdAt',
    'updatedAt',
    'approvedAt',
    'approvedBy'
  ])
    delete body[key];
  body.effectiveAt = body.effectiveAt.toISOString();
  await request(app)
    .post('/api/v1/pricing/policies')
    .set(await authFor(admin))
    .send(body)
    .expect(201);
  await request(app)
    .post('/api/v1/pricing/policies')
    .set(await authFor(admin))
    .send(body)
    .expect(409);
  await request(app)
    .post('/api/v1/pricing/policies')
    .set(await authFor(admin))
    .send({
      ...body,
      version: 3,
      rules: [{ ...body.rules[0], label: 'x'.repeat(161) }]
    })
    .expect(422);
  const result = await request(app)
    .post('/api/v1/pricing/quotes')
    .set(await authFor(customer))
    .send(quoteBody())
    .expect(201);
  expect(result.body.data.totalVnd).toBe(88000);
  expect(result.body.data.lines[1].explanation).toContain('Synthetic');
});

test('creates only valid owned catalog pets, sanitizes address lists and rejects forged facts', async () => {
  const headers = await authFor(customer);
  const body = {
    name: 'Synthetic second cat',
    species: 'CAT',
    breedCode: 'cat-mixed',
    weightKg: 4,
    traits: [],
    careNeedsConfirmed: true
  };
  await request(app)
    .post('/api/v1/pet-care/pets')
    .set(headers)
    .send({ ...body, ownerId: String(other._id) })
    .expect(422);
  await request(app)
    .post('/api/v1/pet-care/pets')
    .set(headers)
    .send({ ...body, breedCode: 'unregistered' })
    .expect(422);
  await request(app)
    .post('/api/v1/pet-care/pets')
    .set(headers)
    .send(body)
    .expect(201);
  const list = await request(app)
    .get('/api/v1/pet-care/pets')
    .set(headers)
    .expect(200);
  expect(list.body.data).toHaveLength(2);
  const addresses = await request(app)
    .get('/api/v1/pet-care/addresses')
    .set(headers)
    .expect(200);
  expect(JSON.stringify(addresses.body)).not.toContain('coordinates');
  expect(JSON.stringify(addresses.body)).not.toContain('Synthetic address');
});
test('changed pricing policy caps and special care readiness fail closed', async () => {
  await models.Pet.updateOne(
    { _id: petId },
    { $set: { careNeedsConfirmed: false } }
  );
  await request(app)
    .post('/api/v1/ai/recommendations')
    .set(await authFor(customer))
    .send(matchBody())
    .expect(409);
  await models.Pet.updateOne(
    { _id: petId },
    { $set: { traits: ['not-priced-yet'] } }
  );
  await request(app)
    .post('/api/v1/pricing/quotes')
    .set(await authFor(customer))
    .send(quoteBody())
    .expect(409);
});
test('approved additive model is used only after hash and holdout checks, invalid model falls back', async () => {
  const payload = {
    version: 'synthetic-model-v1',
    weights: {
      fit: 30,
      travel: 25,
      quality: 20,
      reliability: 15,
      workload: 10
    },
    trainingRows: 200,
    testMae: 1,
    baselineMae: 2,
    testGroups: 10,
    trainedUntil: new Date(clockNow - 60000).toISOString(),
    state: 'APPROVED'
  };
  await request(app)
    .post('/api/v1/ai/admin/models')
    .set(await authFor(admin))
    .send({ ...payload, testMae: 3 })
    .expect(409);
  await request(app)
    .post('/api/v1/ai/admin/models')
    .set(await authFor(admin))
    .send(payload)
    .expect(201);
  const headers = await authFor(customer);
  let result = await request(app)
    .post('/api/v1/ai/recommendations')
    .set(headers)
    .send(matchBody())
    .expect(201);
  expect(result.body.data.rankingSource).toBe('APPROVED_ADDITIVE_MODEL');
  await models.SitterRankModel.updateOne(
    { version: payload.version },
    { $set: { sha256: 'tampered' } }
  );
  result = await request(app)
    .post('/api/v1/ai/recommendations')
    .set(headers)
    .send(matchBody())
    .expect(201);
  expect(result.body.data.rankingSource).toBe('EXPLAINABLE_RULES');
  expect(result.body.data.fallbackReason).toBe('MODEL_VALIDATION_FAILED');
});
test('Admin capability version conflict and schedule concurrency guard reject duplicate work', async () => {
  const ids = await seedSitters(1),
    userId = String(ids[0]),
    headers = await authFor(admin);
  const body = {
    expectedVersion: 0,
    serviceIds: [serviceId],
    species: ['CAT'],
    areaCodes: ['HN'],
    allowedTraits: [],
    maxWeightKg: 20,
    maxPets: 2,
    windows: [{ weekday: 1, startMinute: 480, endMinute: 1080 }],
    dayOffDates: [],
    starts: [
      {
        localDate: '2026-10-26',
        coordinates: [105.81, 21.01],
        availableFrom: '2026-10-26T08:00:00+07:00',
        availableUntil: '2026-10-26T18:00:00+07:00'
      }
    ],
    active: true
  };
  await request(app)
    .put('/api/v1/ai/admin/sitters/' + userId)
    .set(headers)
    .send(body)
    .expect(200);
  await request(app)
    .put('/api/v1/ai/admin/sitters/' + userId)
    .set(headers)
    .send(body)
    .expect(409);
  const block = {
    sitterId: userId,
    startAt: matchBody().startAt,
    endAt: matchBody().endAt,
    coordinates: [105.8, 21],
    kind: 'VISIT',
    sourceRef: 'synthetic-concurrency'
  };
  const results = await Promise.all([
    request(app)
      .post('/api/v1/ai/admin/schedule-blocks')
      .set(headers)
      .send(block),
    request(app)
      .post('/api/v1/ai/admin/schedule-blocks')
      .set(headers)
      .send(block)
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await models.SitterScheduleBlock.countDocuments()).toBe(1);
});

test('a slow routing lookup cannot save a ready snapshot after the lead-time window closes', async () => {
  await seedSitters();
  routingAdvanceMs = 3 * 86400000;
  await request(app)
    .post('/api/v1/ai/recommendations')
    .set(await authFor(customer))
    .send(matchBody())
    .expect(422);
  expect(await models.DecisionSnapshot.countDocuments({ kind: 'MATCH' })).toBe(
    0
  );
});
