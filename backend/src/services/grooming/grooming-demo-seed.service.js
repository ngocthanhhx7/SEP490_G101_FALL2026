import { userModel } from '../../models/user.model.js';
import { payrollModels } from '../../models/payroll.model.js';
import { employeeSchedulingModels } from '../../models/employee-scheduling.model.js';
import { serviceModel } from '../../models/service.model.js';
import { GROOMING_CATEGORIES } from '../../constants/grooming.js';
import { provisionGroomingStorage } from './grooming-storage.service.js';

// Demo-only shop pet sitters. The Hà Nội demo population has part-time sitters only, so without these the temporary
// shop shift source (shop-shift-source.service.js) finds no slot. Accounts are fixture accounts (synthetic:false with a
// fixtureKey, like the Hà Nội demo), never real employment evidence. Re-running changes nothing.
export const GROOMING_DEMO_KEY = 'grooming-demo:2026-11-14-v1';
const DAY = 86400000;
const sitters = [['sitter-1', 'Nguyễn Đức Anh (Demo cửa hàng)'], ['sitter-2', 'Phạm Quang Minh (Demo cửa hàng)']];
// Shop shifts: every day 08:00-12:00 and 14:00-17:00.
const workingWindows = [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => [
  { weekday, startLocalTime: '08:00', endLocalTime: '12:00' }, { weekday, startLocalTime: '14:00', endLocalTime: '17:00' }
]);

export async function provisionGroomingDemo({ connection, clock = Date.now }) {
  const now = new Date(clock()), db = connection.db;
  const User = userModel(connection), { EmploymentContract } = payrollModels(connection);
  const { EmployeeAvailability, EmployeeAvailabilityRevision } = employeeSchedulingModels(connection);
  const shop = await serviceModel(connection).find({ 'presentation.locations': 'FACILITY', 'presentation.category': { $in: GROOMING_CATEGORIES } }).select('_id').lean();
  if (!shop.length) throw new Error('Provision the demo service catalog first');
  await provisionGroomingStorage(connection);
  for (const model of [...Object.values(employeeSchedulingModels(connection)), ...Object.values(payrollModels(connection))]) await model.createCollection();
  const created = [];
  async function account(key, displayName, role, state) {
    const fixtureKey = `${GROOMING_DEMO_KEY}:${key}`;
    const found = await User.findOne({ fixtureKey }).select('_id').lean();
    if (found) return found._id;
    const [user] = await User.create([{ displayName, roles: [role], state, synthetic: false, fixtureKey, authEpoch: 0, version: 0 }]);
    created.push(key);
    return user._id;
  }
  const operator = await account('operator', 'Điều phối dữ liệu mẫu cửa hàng', 'STAFF', 'LOCKED');
  for (const [key, name] of sitters) {
    const userId = await account(key, name, 'PET_SITTER', 'ACTIVE'), id = String(userId);
    await db.collection('sitterstatuses').updateOne({ userId }, { $setOnInsert: { userId, status: 'ACTIVE', changedAt: now, version: 0, statusReason: 'GROOMING_DEMO_ONLY' } }, { upsert: true });
    await db.collection('aisitterprofiles').updateOne({ userId }, { $setOnInsert: { userId, serviceIds: shop.map(row => row._id), species: ['DOG', 'CAT'],
      areaCodes: [], allowedTraits: [], maxWeightKg: 40, maxPets: 2, active: true, windows: [], dayOffDates: [], starts: [], version: 0, changedBy: operator } }, { upsert: true });
    if (!await EmploymentContract.exists({ employeeId: userId, version: 1 })) {
      await EmploymentContract.create({ employeeId: userId, version: 1, employmentType: 'FULL_TIME', salaryBasis: 'GROSS', monthlyBaseVnd: 10000000, payCycle: 'MONTHLY',
        weeklyMinutes: 2400, signedAt: new Date(now.getTime() - DAY), effectiveAt: new Date(now.getTime() - DAY), endsAt: new Date(now.getTime() + 60 * DAY),
        contractReference: `DEMO-NOT-LEGAL:${GROOMING_DEMO_KEY}:${key}`, workplaceRegion: 1, workplaceReference: 'DEMO: cửa hàng Paw World', verifiedBy: operator, recordedAt: now });
    }
    if (!await EmployeeAvailability.exists({ _id: id })) {
      await EmployeeAvailability.create({ _id: id, zone: 'Asia/Ho_Chi_Minh', workingWindows, areas: [], dayOffDates: [], state: 'ACTIVE', version: 1, effectiveFrom: '2000-01-01' });
      await EmployeeAvailabilityRevision.create({ sitterId: id, effectiveFrom: '2000-01-01', version: 1, workingWindows });
    }
  }
  return { state: created.length ? 'APPLIED' : 'ALREADY_APPLIED', key: GROOMING_DEMO_KEY, created, shopServices: shop.length, sitters: sitters.length };
}
