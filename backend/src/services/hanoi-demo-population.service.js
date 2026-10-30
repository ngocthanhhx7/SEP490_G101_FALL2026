import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { HANOI_DEMO_KEY, hanoiDemoZones, demoSitterNames, demoCustomerNames } from '../constants/hanoi-demo-population.js';
import { userModel } from '../models/user.model.js';
import { petCareModels } from '../models/pet-care.model.js';
import { matchingModels } from '../models/sitter-matching.model.js';
import { sitterApplicationModels } from '../models/sitter-application.model.js';
import { sitterPublicProfileModels } from '../models/sitter-public-profile.model.js';
import { employeeSchedulingModels } from '../models/employee-scheduling.model.js';
import { payrollModels } from '../models/payroll.model.js';
import { createContactCrypto } from './contact-crypto.service.js';

const fixtureId = key => new Types.ObjectId(createHash('sha256').update(HANOI_DEMO_KEY+':'+key).digest('hex').slice(0, 24));
const point = coordinates => ({ type: 'Point', coordinates });
const origin = new Date('2026-10-30T00:00:00+07:00');
export const hanoiDemoSummary = () => ({ key: HANOI_DEMO_KEY, zones: hanoiDemoZones.length,
  sitters: demoSitterNames.length, customers: demoCustomerNames.length, pets: demoCustomerNames.length * 2,
  contacts: 0, bookings: 0, payments: 0, ratings: 0, outcomes: 0, trainingEligible: false,
  scheduleFrom: '2026-10-30', scheduleUntil: '2026-12-28', source: 'USER_AUTHORIZED_COURSEWORK_FIXTURE' });

export async function provisionHanoiDemo({ connection, auth }) {
  const models = { User: userModel(connection), ...petCareModels(connection), ...matchingModels(connection),
    ...sitterApplicationModels(connection), ...sitterPublicProfileModels(connection), ...employeeSchedulingModels(connection), ...payrollModels(connection) };
  const crypto = createContactCrypto({ lookupSecret: auth.contactLookupSecret, encryptionKey: auth.contactEncryptionKey });
  const services = await connection.collection('services').find({ code: { $in: ['home-care', 'dog-walking'] } }).toArray();
  if (services.length !== 2) throw new Error('DEMO_CATALOG_REQUIRED');
  const breeds = await models.PetBreed.find({ active: true }).lean();
  if (!breeds.some(row => row.species === 'DOG') || !breeds.some(row => row.species === 'CAT')) throw new Error('PET_BREEDS_REQUIRED');
  for (const model of Object.values(models)) { await model.createCollection(); await model.createIndexes(); }
  const runs = connection.collection('demopopulationruns');
  return connection.transaction(async session => {
    const previous = await runs.findOne({ _id: HANOI_DEMO_KEY }, { session });
    if (previous) return { state: 'ALREADY_APPLIED', ...previous.summary };
    const records = [];
    async function put(name, key, data) {
      const Model = models[name], _id = fixtureId(key);
      if (await Model.exists({ _id }).session(session)) throw new Error('DEMO_ID_COLLISION');
      const [record] = await Model.create([{ _id, ...data }], { session });
      records.push({ collection: Model.collection.collectionName, id: record._id });
      return record;
    }
    async function user(key, name, role, locked = false) {
      return put('User', key, { displayName: name+' (Demo)', roles: [role], state: locked ? 'LOCKED' : 'ACTIVE',
        // synthetic is a legacy non-login sentinel. fixtureKey identifies the authorized demo population.
        synthetic: false, fixtureKey: HANOI_DEMO_KEY+':'+key, authEpoch: 0, version: 0 });
    }
    const operator = await user('operator', 'Điều phối dữ liệu mẫu', 'STAFF', true);
    for (let i = 0; i < demoSitterNames.length; i++) {
      const zone = hanoiDemoZones[Math.floor(i / 2)], key = 'sitter-'+(i+1), sitter = await user(key, demoSitterNames[i], 'PET_SITTER');
      const species = i % 7 === 0 ? ['CAT'] : i % 5 === 0 ? ['DOG'] : ['DOG', 'CAT'];
      const serviceIds = services.filter(row => species.includes('DOG') || row.code === 'home-care').map(row => row._id);
      const bio = `Hồ sơ demo: ${demoSitterNames[i]}, khu vực ${zone.neighbourhood}. `+
        `Kịch bản kinh nghiệm ${[8, 12, 18, 24, 30, 36][i % 6]} tháng chăm sóc ${species.length === 2 ? 'chó và mèo' : species[0] === 'CAT' ? 'mèo' : 'chó'} gia đình. `+
        'Nhận cho ăn, vệ sinh khay/bát và theo dõi thói quen theo hướng dẫn; không thực hiện điều trị thú y.';
      const weekdays = i % 3 === 0 ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
      const startHour = i % 2 ? 13 : 8, endHour = startHour+4;
      const workingWindows = weekdays.map(weekday => ({ weekday, startLocalTime: `${startHour.toString().padStart(2,'0')}:00`, endLocalTime: `${endHour}:00` }));
      const email = key+'@pawworld-demo.example';
      await put('SitterApplication', 'application-'+key, { displayName: sitter.displayName, contactChannel: 'EMAIL',
        contactCiphertext: crypto.encrypt(email), contactLookupKey: crypto.lookup('EMAIL', email).lookupKey,
        identityLookupKey: HANOI_DEMO_KEY+':NOT-A-REAL-IDENTITY:'+key, ageEligible: true, ageCheckedAt: origin,
        experience: bio, requestedServices: serviceIds.map(String), workAreas: [zone.areaCode],
        privateDocuments: [{ documentId: 'DEMO-NO-IDENTITY-DOCUMENT', documentType: 'OTHER', storageRef: 'demo-only/no-real-document' }],
        state: 'APPROVED', provisionedUserId: sitter._id, version: 0,
        decisionReason: 'Mô phỏng được chủ đồ án cho phép; không phải hồ sơ tuyển dụng đã xác minh.',
        submissionKeyDigest: HANOI_DEMO_KEY+':'+key, submissionPayloadDigest: HANOI_DEMO_KEY+':payload:'+key });
      await put('SitterStatus', 'status-'+key, { userId: sitter._id, status: 'ACTIVE', changedAt: origin, version: 0, statusReason: 'COURSEWORK_DEMO_ONLY' });
      await put('SitterPublicProfile', 'public-'+key, { userId: sitter._id, bio, areas: [zone.areaCode], state: 'APPROVED',
        version: 1, reviewedBy: operator._id, reviewedAt: origin });
      const starts = [];
      for (let day = 0; day < 60; day++) {
        const date = new Date(origin.getTime() + day*86400000 + 7*3600000).toISOString().slice(0,10);
        const weekday = new Date(date+'T00:00:00Z').getUTCDay() || 7;
        if (weekdays.includes(weekday)) starts.push({ localDate: date, point: point(zone.coordinates),
          availableFrom: new Date(date+`T${startHour.toString().padStart(2,'0')}:00:00+07:00`), availableUntil: new Date(date+`T${endHour}:00:00+07:00`) });
      }
      await put('SitterMatchingProfile', 'capability-'+key, { userId: sitter._id, serviceIds, species, areaCodes: [zone.areaCode],
        allowedTraits: [], maxWeightKg: [10, 15, 25][i%3], maxPets: i % 4 ? 2 : 1, active: true,
        windows: weekdays.map(weekday => ({ weekday: weekday%7, startMinute: startHour*60, endMinute: endHour*60 })),
        dayOffDates: [], starts, version: 0, changedBy: operator._id });
      // Sample contracts have explicit demo references and a fixed expiry, never real employment evidence.
      await put('EmploymentContract', 'contract-'+key, { employeeId: sitter._id, version: 1, employmentType: 'PART_TIME', salaryBasis: 'GROSS',
        monthlyBaseVnd: 3000000, payCycle: i%2 ? 'MONTHLY' : 'WEEKLY', weeklyMinutes: 1200, signedAt: origin, effectiveAt: origin,
        endsAt: new Date('2026-12-29T00:00:00+07:00'), contractReference: 'DEMO-NOT-LEGAL:'+HANOI_DEMO_KEY+':'+key,
        workplaceRegion: 1, workplaceReference: 'DEMO: '+zone.neighbourhood+', Hà Nội', verifiedBy: operator._id, recordedAt: origin });
      // Employee availability uses a string user ID, unlike the other ObjectId models.
      const availabilityId = String(sitter._id);
      if (await models.EmployeeAvailability.exists({ _id: availabilityId }).session(session)) throw new Error('DEMO_ID_COLLISION');
      await models.EmployeeAvailability.create([{ _id: availabilityId, zone: 'Asia/Ho_Chi_Minh', workingWindows,
        areas: [zone.areaCode], dayOffDates: [], state: 'ACTIVE', version: 1, effectiveFrom: '2026-10-30' }], { session });
      records.push({ collection: models.EmployeeAvailability.collection.collectionName, id: availabilityId });
      await put('EmployeeAvailabilityRevision', 'revision-'+key, { sitterId: availabilityId, effectiveFrom: '2026-10-30', version: 1, workingWindows });
    }
    for (let i = 0; i < demoCustomerNames.length; i++) {
      const customer = await user('customer-'+(i+1), demoCustomerNames[i], 'CUSTOMER'), zone = hanoiDemoZones[i];
      await put('CustomerAddress', 'address-'+i, { ownerId: customer._id, label: 'Địa chỉ demo · '+zone.neighbourhood,
        location: 'Điểm mẫu gần '+zone.neighbourhood+', Hà Nội; không phải nhà riêng của khách hàng.', point: point(zone.coordinates),
        areaCode: zone.areaCode, pointConfirmedAt: origin, privateAccessNotes: 'Dữ liệu mô phỏng; không đến địa điểm để thực hiện dịch vụ.', state: 'ACTIVE', version: 0 });
      for (const [j, species] of ['DOG', 'CAT'].entries()) {
        const choices = j ? [['cat-domestic-short',3.4],['cat-british-short',4.8],['cat-persian',4.3],['cat-mixed',3.8]]
          : [['dog-poodle',4.5],['dog-corgi',10],['dog-shiba',9],['dog-beagle',11],['dog-mixed',7.5]];
        const [code, weightKg] = choices[i%choices.length];
        const breed = breeds.find(row => row.code === code) ?? breeds.find(row => row.species === species);
        await put('Pet', 'pet-'+i+'-'+j, { ownerId: customer._id, name: (j ? ['Miu','Mít','Mochi','Bơ'] : ['Bông','Đậu','Milo','Bin'])[i%4], species,
          breedCode: breed.code, weightKg, ageMonths: 12+(i%6)*6,
          sex: i%2 ? 'MALE' : 'FEMALE', traits: [], careNeedsConfirmed: true,
          careProfile: { allergies: { status: 'UNKNOWN' }, feeding: { status: 'KNOWN', value: 'Khẩu phần demo: dùng thức ăn và lượng đã được chủ chuẩn bị.' } },
          state: 'ACTIVE', version: 0 });
      }
    }
    const summary = hanoiDemoSummary();
    await runs.insertOne({ _id: HANOI_DEMO_KEY, summary, records, appliedAt: new Date(), authorization: 'User requested sample sitters/customers on local and VPS on 2026-10-30' }, { session });
    return { state: 'APPLIED', ...summary };
  });
}
