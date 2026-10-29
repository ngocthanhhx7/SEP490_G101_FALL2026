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

export function assertDemoDatabase(connection) {
  if (
    connection.name !== DEMO_DATABASE ||
    !['127.0.0.1', 'localhost'].includes(connection.host)
  ) {
    throw new Error(
      'Demo fixtures require the dedicated loopback demo database'
    );
  }
}

export async function seedDemo(connection, config, clock = Date.now) {
  assertDemoDatabase(connection);
  const models = platformDataModels(connection),
    User = userModel(connection);
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
      fixtureKey: `ai-demo:${key}`,
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
        location:
          'Địa chỉ tổng hợp phục vụ kiểm thử; không phải nhà khách hàng',
        point: point([105.8 + i * 0.002, 21]),
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
    const [key, label, visits, rating, faults] = descriptions[i];
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
          point: point([105.801 + i * 0.001, 21.002]),
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
        point: point([105.8005, 21.0005]),
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
    location: 'Địa chỉ phòng khám tổng hợp, không phải cơ sở thật',
    point: point([105.805, 21.001]),
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
  return {
    database: DEMO_DATABASE,
    date,
    routing: 'SIMULATED_FIXTURE_NOT_OSRM',
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
