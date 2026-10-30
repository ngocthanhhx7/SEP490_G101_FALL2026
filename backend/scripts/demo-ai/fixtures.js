// Explicit development fixtures. Never import from the production runtime.
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { userModel } from '../../src/models/user.model.js';
import { identityModels } from '../../src/models/identity.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { platformDataModels } from '../../src/models/platform-data.model.js';
import { serviceModel } from '../../src/models/service.model.js';
import { localDay } from '../../src/services/sitter-matching/scheduling.service.js';
import { edgeKey } from '../../src/services/sitter-matching/routing.service.js';

export const DEMO_DATABASE = 'paw_world_care_ai_demo';
export const GROUNDED_DEMO_DATABASE = 'paw_world_care_ai_grounded_demo';
export const GROUNDED_ROUTING_SOURCE = 'OSRM_STATIC_PUBLIC_SAMPLE_NOT_LIVE';

export function validateGroundedSnapshot(input) {
  // JSON data only. This validates an operator's captured evidence, not the
  // truth of its provenance or the accuracy of OSRM against real journeys.
  const snapshot = JSON.parse(JSON.stringify(input));
  const fields = ['kind', 'source', 'observedAt', 'graphSha256', 'osmSha256',
    'profile', 'bounds', 'points', 'durations', 'distances', 'snappingDistances',
    'groundTruthTravelTimes', 'customerData', 'attribution', 'purpose', 'requestedPoints'];
  if (!snapshot || Object.keys(snapshot).some(key => !fields.includes(key))
    || snapshot.kind !== 'PWC_PUBLIC_OSRM_SAMPLE_V1' || snapshot.source !== 'OSRM_STATIC_ROAD_ETA'
    || snapshot.profile !== 'OSRM_CAR_V2610' || snapshot.customerData !== false
    || snapshot.groundTruthTravelTimes !== false
    || ![snapshot.graphSha256, snapshot.osmSha256].every(hash => /^[a-f0-9]{64}$/.test(hash))
    || typeof snapshot.observedAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(snapshot.observedAt)
    || !Number.isFinite(Date.parse(snapshot.observedAt)) || Date.parse(snapshot.observedAt) > Date.now()
    || ![snapshot.attribution, snapshot.purpose].every(value => typeof value === 'string' && value.length > 0 && value.length <= 1000)
    || !Array.isArray(snapshot.bounds) || snapshot.bounds.length !== 4
    || snapshot.bounds.some(value => typeof value !== 'number' || !Number.isFinite(value))
    || snapshot.bounds[0] < 105.15 || snapshot.bounds[1] < 20.45
    || snapshot.bounds[2] > 106.15 || snapshot.bounds[3] > 21.55
    || snapshot.bounds[0] >= snapshot.bounds[2] || snapshot.bounds[1] >= snapshot.bounds[3]
    || !Array.isArray(snapshot.points) || snapshot.points.length < 3 || snapshot.points.length > 50) {
    throw new TypeError('Invalid grounded public OSRM provenance');
  }
  const validPoint = point => Array.isArray(point) && point.length === 2
    && point.every(value => typeof value === 'number' && Number.isFinite(value))
    && point[0] >= snapshot.bounds[0] && point[0] <= snapshot.bounds[2]
    && point[1] >= snapshot.bounds[1] && point[1] <= snapshot.bounds[3];
  const size = snapshot.points.length;
  if (!snapshot.points.every(validPoint) || new Set(snapshot.points.map(point => JSON.stringify(point))).size !== size
    || (snapshot.requestedPoints !== undefined && (!Array.isArray(snapshot.requestedPoints)
      || snapshot.requestedPoints.length !== size || !snapshot.requestedPoints.every(validPoint)))
    || !Array.isArray(snapshot.snappingDistances) || snapshot.snappingDistances.length !== size
    || snapshot.snappingDistances.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000)) {
    throw new TypeError('Invalid grounded public OSRM coordinates');
  }
  for (const [key, max] of [['durations', 86400], ['distances', 1000000]]) {
    if (!Array.isArray(snapshot[key]) || snapshot[key].length !== size
      || snapshot[key].some((row, i) => !Array.isArray(row) || row.length !== size || row[i] !== 0
        || row.some(value => value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)))) {
      throw new TypeError('Invalid grounded public OSRM matrix');
    }
  }
  if (snapshot.durations.some((row, i) => row.some((value, j) => (value === null) !== (snapshot.distances[i][j] === null)))) {
    throw new TypeError('Inconsistent grounded unreachable evidence');
  }
  return snapshot;
}

export function groundedRoutingProvider(input) {
  const snapshot = validateGroundedSnapshot(input);
  const indexes = new Map(snapshot.points.map((point, i) => [JSON.stringify(point), i]));
  const validatePoints = points => {
    if (!Array.isArray(points) || !points.length || points.length > 50
      || points.some(point => !indexes.has(JSON.stringify(point)))) {
      const error = new Error('Public snapshot has no route evidence for these exact points');
      error.code = 'ROUTING_UNAVAILABLE'; error.status = 503; throw error;
    }
  };
  return Object.freeze({
    validatePoints,
    async matrix(points) {
      validatePoints(points);
      const map = new Map();
      for (const a of points) for (const b of points) {
        const seconds = snapshot.durations[indexes.get(JSON.stringify(a))][indexes.get(JSON.stringify(b))];
        map.set(edgeKey(a, b), seconds === null ? null : seconds / 60);
      }
      return { map, source: GROUNDED_ROUTING_SOURCE, recordedAt: new Date(snapshot.observedAt) };
    }
  });
}
const fixtureId = (key) =>
  new Types.ObjectId(
    createHash('sha256')
      .update('pwc-ai-demo-v1:' + key)
      .digest('hex')
      .slice(0, 24)
  );
const point = (coordinates) => ({ type: 'Point', coordinates });
const put = (Model, key, data) =>
  Model.findOneAndUpdate(
    { _id: fixtureId(key) },
    { $set: data },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );

export function assertDemoDatabase(connection, grounded = false) {
  if (
    connection.name !== (grounded ? GROUNDED_DEMO_DATABASE : DEMO_DATABASE) ||
    !['127.0.0.1', 'localhost'].includes(connection.host)
  ) {
    throw new Error(
      'Demo fixtures require the dedicated loopback demo database'
    );
  }
}

export async function seedDemo(connection, config, clock = Date.now, { groundedSnapshot } = {}) {
  const grounded = groundedSnapshot !== undefined;
  assertDemoDatabase(connection, grounded);
  if (config.nodeEnv !== 'development') throw new Error('Demo seed requires development mode');
  const snapshot = grounded ? validateGroundedSnapshot(groundedSnapshot) : null;
  const samplePoint = index => [...snapshot.points[index % snapshot.points.length]];
  const models = platformDataModels(connection),
    User = userModel(connection);
  if (grounded && (await models.SitterVisitOutcome.exists({}) || await models.SitterRankModel.exists({}))) {
    throw new Error('Grounded demo refuses existing outcome/model history; use a clean dedicated database');
  }
  if (grounded) await models.RoutingMatrixCache.deleteMany({});
  const identity = identityModels(connection),
    apps = sitterApplicationModels(connection);
  const crypto = createContactCrypto({
    lookupSecret: config.auth.contactLookupSecret,
    encryptionKey: config.auth.contactEncryptionKey
  });
  for (const Model of [
    User,
    ...Object.values(identity),
    ...Object.values(apps),
    ...Object.values(models)
  ])
    await Model.createIndexes();
  const now = new Date(clock());
  const date = localDay(clock() + 3 * 86400000);
  const at = (time) => new Date(`${date}T${time}:00+07:00`);
  const services = await serviceModel(connection).find({}).lean();
  const home = services.find((s) => s.code === 'home-visit');
  const walk = services.find((s) => s.code === 'dog-walking');
  if (!home || !walk)
    throw new Error('Provision the three-service catalogue first');
  const accounts = [];
  async function account(key, name, role) {
    // synthetic:true is reserved for non-login fixtures by the session service.
    // These login-capable DEMO users exist only in the guarded dedicated DB.
    const user = await put(User, key, {
      displayName: `[DEMO] ${name}`,
      roles: [role],
      state: 'ACTIVE',
      synthetic: false,
      fixtureKey: `${grounded ? 'ai-grounded-demo' : 'ai-demo'}:${key}`,
      authEpoch: 0,
      version: 0
    });
    const email = `${key}@pwc-demo.example`;
    await put(identity.Contact, `contact:${key}`, {
      userId: user._id,
      channel: 'EMAIL',
      canonicalCiphertext: crypto.encrypt(email),
      lookupKey: crypto.lookup('EMAIL', email).lookupKey,
      state: 'VERIFIED',
      verifiedAt: now
    });
    accounts.push({
      key,
      id: String(user._id),
      name: user.displayName,
      role,
      email
    });
    return user;
  }
  const admin = await account('admin', 'Quản trị thử nghiệm', 'ADMIN');
  await account('staff', 'Nhân viên thử nghiệm', 'STAFF');
  const customers = [];
  for (const [key, name] of [
    ['customer-an', 'Khách An'],
    ['customer-binh', 'Khách Bình'],
    ['customer-chi', 'Khách Chi']
  ])
    customers.push(await account(key, name, 'CUSTOMER'));
  const pets = [];
  for (let i = 0; i < customers.length; i++) {
    for (const [kind, breed, weight] of [
      ['DOG', 'dog-poodle', 6],
      ['CAT', 'cat-british-short', 4]
    ]) {
      const p = await put(models.Pet, `pet:${i}:${kind}`, {
        ownerId: customers[i]._id,
        name: `[DEMO] ${kind === 'DOG' ? 'Bông' : 'Miu'} ${i + 1}`,
        species: kind,
        breedCode: breed,
        weightKg: weight,
        traits: [],
        careNeedsConfirmed: true,
        state: 'ACTIVE',
        version: 0
      });
      pets.push({
        id: String(p._id),
        ownerId: String(customers[i]._id),
        name: p.name,
        species: kind
      });
    }
  }
  const addresses = [];
  for (let i = 0; i < customers.length; i++) {
    for (const [suffix, areaCode] of [
      ['many', 'DEMO-HN'],
      ['two', 'DEMO-TWO']
    ]) {
      const a = await put(models.CustomerAddress, `address:${i}:${suffix}`, {
        ownerId: customers[i]._id,
        label: `[DEMO] ${suffix === 'many' ? 'Khu nhiều sitter' : 'Khu chỉ hai sitter'}`,
        location: grounded ? 'Điểm đường công khai từ snapshot OSRM; không phải nhà khách'
          : 'Địa chỉ tổng hợp phục vụ kiểm thử; không phải nhà khách hàng',
        point: point(grounded ? samplePoint(i) : [105.8 + i * 0.002, 21]),
        areaCode,
        pointConfirmedAt: now,
        state: 'ACTIVE',
        version: 0
      });
      addresses.push({
        id: String(a._id),
        ownerId: String(customers[i]._id),
        label: a.label,
        areaCode
      });
    }
  }
  const descriptions = [
    ['lan', 'Lan — quen pet, kinh nghiệm tốt', 30, 5, 0],
    ['minh', 'Minh — gần, đánh giá tốt', 24, 5, 0],
    ['ha', 'Hà — nhiều kinh nghiệm', 40, 4, 0],
    ['nam', 'Nam — ít kinh nghiệm hơn', 12, 5, 0],
    ['linh', 'Linh — nhận nhiều dịch vụ', 20, 4, 0],
    ['phuc', 'Phúc — xa hơn nhưng đủ lịch', 25, 5, 0],
    ['trang', 'Trang — đang trùng giờ 10:00', 30, 5, 0],
    ['duc', 'Đức — bị tạm ngưng nhận việc', 30, 5, 0],
    ['mai', 'Mai — chỉ nhận mèo', 25, 5, 0],
    ['khoa', 'Khoa — lịch có sẵn gần nhà khách', 30, 5, 0],
    ['huy', 'Huy — có lỗi đã đối soát', 24, 4, 6]
  ];
  const sitters = [];
  for (let i = 0; i < descriptions.length; i++) {
    const [key, fixtureLabel, fixtureVisits, fixtureRating, fixtureFaults] = descriptions[i];
    const label = grounded ? `${key} — năng lực/lịch khai báo mô phỏng, chưa có lịch sử` : fixtureLabel;
    const visits = grounded ? 0 : fixtureVisits, rating = grounded ? null : fixtureRating, faults = grounded ? 0 : fixtureFaults;
    const user = await account(`sitter-${key}`, label, 'PET_SITTER');
    await put(apps.SitterApplication, `application:${key}`, {
      displayName: user.displayName,
      contactChannel: 'EMAIL',
      contactCiphertext: crypto.encrypt(`sitter-${key}@pwc-demo.example`),
      contactLookupKey: crypto.lookup('EMAIL', `sitter-${key}@pwc-demo.example`)
        .lookupKey,
      identityLookupKey: `DEMO-NOT-A-REAL-ID-${key}`,
      ageEligible: true,
      ageCheckedAt: now,
      experience: 'Dữ liệu demo tổng hợp, không phải kinh nghiệm cá nhân thật',
      requestedServices: services.map((s) => String(s._id)),
      workAreas: ['DEMO-HN'],
      privateDocuments: [
        {
          documentId: 'demo-placeholder',
          documentType: 'OTHER',
          storageRef: 'demo-only/no-real-document'
        }
      ],
      state: 'APPROVED',
      provisionedUserId: user._id,
      submissionKeyDigest: `demo-key-${key}`,
      submissionPayloadDigest: `demo-payload-${key}`
    });
    await put(apps.SitterStatus, `status:${key}`, {
      userId: user._id,
      status: key === 'duc' ? 'SUSPENDED' : 'ACTIVE',
      changedAt: now,
      statusReason: 'DEMO scenario',
      version: 0
    });
    await put(models.SitterMatchingProfile, `profile:${key}`, {
      userId: user._id,
      serviceIds: services.map((s) => s._id),
      species: key === 'mai' ? ['CAT'] : ['DOG', 'CAT'],
      areaCodes: i < 2 ? ['DEMO-HN', 'DEMO-TWO'] : ['DEMO-HN'],
      allowedTraits: [],
      maxWeightKg: 35,
      maxPets: 2,
      active: true,
      windows: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        startMinute: 480,
        endMinute: 1080
      })),
      dayOffDates: [],
      starts: [
        {
          localDate: date,
          point: point(grounded ? samplePoint(i + 3) : [105.801 + i * 0.001, 21.002]),
          availableFrom: at('08:00'),
          availableUntil: at('18:00')
        }
      ],
      changedBy: admin._id,
      version: 1
    });
    // One outcome per unique visit; deterministic IDs keep reruns idempotent.
    for (const service of services) {
      for (let j = 0; j < visits + faults; j++) {
        const fault = j >= visits;
        const petIds = [
          new Types.ObjectId(pets[j < 4 && key === 'lan' ? 0 : 4].id),
          ...(service.code === 'dog-walking'
            ? []
            : [new Types.ObjectId(pets[5].id)])
        ];
        await put(
          models.SitterVisitOutcome,
          `outcome:${key}:${service.code}:${j}`,
          {
            visitId: fixtureId(`visit:${key}:${service.code}:${j}`),
            sitterId: user._id,
            serviceId: service._id,
            petIds,
            species: service.code === 'dog-walking' ? ['DOG'] : ['DOG', 'CAT'],
            occurredAt: new Date(clock() - (j + 1) * 86400000),
            resolution: fault ? 'SITTER_FAULT' : 'COMPLETED',
            ...(!fault ? { rating, onTime: j % 11 !== 0 } : {}),
            verifiedBy: admin._id,
            sourceRef: 'DEMO SYNTHETIC — never use for production training'
          }
        );
      }
    }
    if (['trang', 'khoa'].includes(key)) {
      const occupied = key === 'trang';
      await put(models.SitterScheduleBlock, `block:${key}`, {
        sitterId: user._id,
        visitId: fixtureId(`scheduled:${key}`),
        startAt: at(occupied ? '10:00' : '09:00'),
        endAt: at(occupied ? '10:30' : '09:15'),
        point: point(grounded ? samplePoint(1) : [105.8005, 21.0005]),
        state: 'CONFIRMED',
        kind: 'VISIT',
        sourceRef: 'DEMO SYNTHETIC calendar',
        changedBy: admin._id,
        version: 0
      });
    }
    sitters.push({
      id: String(user._id),
      name: user.displayName,
      status: key === 'duc' ? 'SUSPENDED' : 'ACTIVE',
      species: key === 'mai' ? ['CAT'] : ['DOG', 'CAT'],
      visits,
      rating,
      faults,
      note: label,
      scenario: key
    });
  }
  const first = String(customers[0]._id);
  const dog = pets.find((p) => p.ownerId === first && p.species === 'DOG');
  const cat = pets.find((p) => p.ownerId === first && p.species === 'CAT');
  const clinic = await put(models.CustomerAddress, 'address:clinic', {
    ownerId: customers[0]._id,
    label: '[DEMO] Phòng khám tổng hợp',
    location: grounded ? 'Điểm đường công khai dùng mô phỏng điểm đến; không xác nhận cơ sở thú y'
      : 'Địa chỉ phòng khám tổng hợp, không phải cơ sở thật',
    point: point(grounded ? samplePoint(1) : [105.805, 21.001]),
    areaCode: 'DEMO-HN',
    pointConfirmedAt: now,
    state: 'ACTIVE',
    version: 0
  });
  addresses.push({
    id: String(clinic._id),
    ownerId: first,
    label: clinic.label,
    areaCode: 'DEMO-HN'
  });
  const scenarios = [
    {
      key: 'many',
      label: 'Nhiều sitter: chọn Top 5, loại trùng lịch và tạm ngưng',
      ownerId: first,
      serviceId: String(home._id),
      petIds: [dog.id],
      addressId: addresses[0].id,
      startAt: at('10:00').toISOString(),
      endAt: at('10:30').toISOString(),
      limit: 5
    },
    {
      key: 'two',
      label: 'Chỉ 2 sitter ở khu vực: báo thiếu 3 người',
      ownerId: first,
      serviceId: String(home._id),
      petIds: [dog.id],
      addressId: addresses[1].id,
      startAt: at('10:00').toISOString(),
      endAt: at('10:30').toISOString(),
      limit: 5
    },
    {
      key: 'cat',
      label: 'Đổi sang mèo: Mai đủ điều kiện; mất ưu tiên quen chó của Lan',
      ownerId: first,
      serviceId: String(home._id),
      petIds: [cat.id],
      addressId: addresses[0].id,
      startAt: at('10:00').toISOString(),
      endAt: at('10:30').toISOString(),
      limit: 10
    },
    {
      key: 'later',
      label: 'Chuyển 14:00: Trang hết trùng; đường/tải thay đổi',
      ownerId: first,
      serviceId: String(home._id),
      petIds: [dog.id],
      addressId: addresses[0].id,
      startAt: at('14:00').toISOString(),
      endAt: at('14:30').toISOString(),
      limit: 10
    }
  ];
  scenarios.push(
    {
      ...scenarios[0],
      key: 'walking',
      label: 'Dắt chó đi dạo: cùng pet, đổi dịch vụ và lịch sử tương ứng',
      serviceId: String(walk._id)
    },
    {
      ...scenarios[0],
      key: 'vet',
      label: 'Đưa đến thú y: lịch 10:00–12:00, hẹn 10:45, chờ 30 phút, đưa về',
      serviceId: String(services.find((s) => s.code === 'vet-escort')._id),
      endAt: at('12:00').toISOString(),
      clinicAddressId: String(clinic._id),
      appointmentAt: at('10:45').toISOString(),
      waitingMinutes: 30,
      returnToHome: true
    }
  );
  if (grounded) {
    scenarios.find(row => row.key === 'cat').label = 'Đổi sang mèo: lọc năng lực khai báo, không có lịch sử/rating';
  }
  return {
    database: grounded ? GROUNDED_DEMO_DATABASE : DEMO_DATABASE,
    date,
    routing: grounded ? GROUNDED_ROUTING_SOURCE : 'SIMULATED_FIXTURE_NOT_OSRM',
    ...(grounded ? { mode: 'GROUNDED_PUBLIC_ROADS',
      routingEvidence: { snapshotCanonicalSha256: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        graphSha256: snapshot.graphSha256, osmSha256: snapshot.osmSha256, profile: snapshot.profile,
        observedAt: snapshot.observedAt, attribution: snapshot.attribution, groundTruthTravelTimes: false },
      simulation: 'Accounts, pets, capabilities and schedules are declared simulations, not observed people or work.',
      warnings: ['NO_VERIFIED_HISTORY_OR_SATISFACTION_LABELS', 'COLD_START_MAY_BE_BELOW_AUTOMATIC_THRESHOLD'],
      trainingObservations: 0 } : {}),
    accounts,
    pets,
    addresses,
    sitters,
    services: services.map((s) => ({ id: String(s._id), code: s.code })),
    scenarios
  };
}

export function demoRoutingProvider() {
  return {
    async matrix(points) {
      // Controlled symmetric fixture, NOT road distance or live traffic.
      const map = new Map();
      for (const a of points)
        for (const b of points) {
          const distance = Math.hypot((a[0] - b[0]) * 100, (a[1] - b[1]) * 111);
          map.set(
            edgeKey(a, b),
            distance === 0 ? 0 : Math.ceil(3 + distance * 7)
          );
        }
      return { map, source: 'DEMO_SIMULATED_NOT_OSRM', recordedAt: new Date() };
    }
  };
}
