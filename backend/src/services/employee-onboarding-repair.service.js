import { Types } from 'mongoose';
import { digest, fail } from '../validators/pet-care.validator.js';
import { payrollModels } from '../models/payroll.model.js';
import { employeeSchedulingModels } from '../models/employee-scheduling.model.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { windowsCover } from './employee-scheduling/schedule-policy.service.js';

export const ONBOARDING_REPAIR = 'OWNER_FOUR_EMPLOYEES_2026_11_09';
const effectiveAt = new Date('2026-11-08T17:00:00Z');
export const ownerWorkingWindows = Object.freeze(Array.from({ length: 5 }, (_, i) => [
  { weekday: i + 1, startLocalTime: '08:00', endLocalTime: '12:00' },
  { weekday: i + 1, startLocalTime: '13:00', endLocalTime: '17:00' }
]).flat());

// Operator-only, exact owner-confirmed population. No runtime migration or automatic skill grant.
export function createEmployeeOnboardingRepair({ connection, clock = Date.now }) {
  const payroll = payrollModels(connection), scheduling = employeeSchedulingModels(connection), col = name => connection.db.collection(name);
  async function inspect(session) {
    const users = await col('users').find({ roles: 'PET_SITTER', synthetic: { $ne: true } }, { session, projection: { _id: 1, state: 1, roles: 1, authEpoch: 1 } }).sort({ _id: 1 }).limit(5).toArray();
    if (users.length !== 4 || users.some(user => user.state !== 'ACTIVE' || user.roles.length !== 1)) fail('REPAIR_BLOCKED', 'Exactly four active employees required', 409);
    const ids = users.map(user => user._id), strings = ids.map(String);
    const [applications, statuses, contracts, profiles, availability, revisions, services, assigned, offers] = await Promise.all([
      col('sitterapplications').find({ provisionedUserId: { $in: ids }, state: 'APPROVED' }, { session, projection: { provisionedUserId: 1 } }).limit(5).toArray(),
      col('sitterstatuses').find({ userId: { $in: ids } }, { session, projection: { userId: 1, status: 1 } }).limit(5).toArray(),
      col('employmentcontracts').find({ employeeId: { $in: ids } }, { session }).sort({ employeeId: 1, version: 1 }).limit(101).toArray(),
      col('aisitterprofiles').find({ userId: { $in: ids } }, { session }).sort({ userId: 1 }).limit(5).toArray(),
      col('employeeavailabilities').find({ _id: { $in: strings } }, { session }).sort({ _id: 1 }).limit(5).toArray(),
      col('employeeavailabilityrevisions').find({ sitterId: { $in: strings } }, { session }).sort({ sitterId: 1, effectiveFrom: 1, version: 1 }).limit(101).toArray(),
      col('services').find({}, { session, projection: { _id: 1, code: 1 } }).sort({ _id: 1 }).limit(61).toArray(),
      col('visits').find({ sitterId: { $in: [...ids, ...strings] }, state: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }, { session, projection: { sitterId: 1, startAt: 1, endAt: 1 } }).limit(101).toArray(),
      col('employeevisitoffers').find({ sitterId: { $in: strings }, state: 'PENDING', deadline: { $gt: new Date(clock()) } }, { session, projection: { _id: 1 } }).limit(1).toArray()
    ]);
    if (contracts.length > 100 || revisions.length > 100 || assigned.length > 100 || services.length < 1 || services.length > 60 || offers.length || assigned.some(visit => !windowsCover(ownerWorkingWindows, visit.startAt, visit.endAt))) fail('REPAIR_BLOCKED', 'Resolve population, pending offers or assigned schedule conflicts first', 409);
    if (ids.some(id => !applications.some(row => String(row.provisionedUserId) === String(id)) || !statuses.some(row => String(row.userId) === String(id) && row.status === 'ACTIVE'))) fail('REPAIR_BLOCKED', 'Approved active employees required', 409);
    const plan = { contract: ONBOARDING_REPAIR, users, applications, statuses, contracts, profiles, availability, revisions, services, assigned };
    return { ...plan, digest: digest(plan) };
  }
  return { inspect,
    async apply({ actorId, expectedDigest, confirmation }) {
      if (confirmation !== ONBOARDING_REPAIR || !Types.ObjectId.isValid(actorId)) fail('REPAIR_CONFIRMATION_REQUIRED', 'Exact owner confirmation required', 409);
      return connection.transaction(async session => {
        const commandId = digest([ONBOARDING_REPAIR, expectedDigest]);
        const replay = await scheduling.EmployeeScheduleCommand.findById(commandId).session(session).lean();
        if (replay) return replay.result;
        const actor = await col('users').findOneAndUpdate({ _id: new Types.ObjectId(actorId), roles: 'ADMIN', state: 'ACTIVE' }, { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
        if (!actor || actor.roles.length !== 1) fail('FORBIDDEN', 'Current Admin required', 403);
        const plan = await inspect(session); if (plan.digest !== expectedDigest) fail('REPAIR_PLAN_CHANGED', 'Inspect the current population again', 409);
        const now = new Date(clock()), areas = DEMO_WORK_AREAS.map(row => row.code), reason = 'Owner confirmed four signed full-time employees and all services on 2026-11-09; 40h weekday schedule, 1h lunch, weekends off; replaces erroneous future configuration.';
        for (const user of plan.users) {
          const uid = user._id, sitterId = String(uid);
          await payroll.PayrollMonthGuard.findOneAndUpdate({ _id: 'employee:' + sitterId }, { $inc: { version: 1 } }, { upsert: true, session });
          const locked = await col('users').updateOne({ _id: uid, state: 'ACTIVE', roles: 'PET_SITTER', authEpoch: user.authEpoch ?? 0 }, { $inc: { schedulingGuardVersion: 1 } }, { session });
          if (!locked.matchedCount) fail('REPAIR_PLAN_CHANGED', 'Employee changed', 409);
          await col('sitterstatuses').updateOne({ userId: uid, status: 'ACTIVE' }, { $inc: { schedulingGuardVersion: 1 } }, { session });
          const previous = plan.contracts.filter(row => String(row.employeeId) === sitterId), latest = previous.at(-1);
          // Preserve the erroneous future row; mark only that row superseded so it cannot reactivate later.
          await payroll.EmploymentContract.updateMany({ employeeId: uid, effectiveAt: { $gte: effectiveAt }, supersededAt: null },
            { $set: { supersededAt: now, supersededBy: actor._id, supersededReason: reason } }, { session });
          const [contract] = await payroll.EmploymentContract.create([{ employeeId: uid, version: (latest?.version ?? 0) + 1,
            employmentType: 'FULL_TIME', salaryBasis: 'GROSS', monthlyBaseVnd: 10000000, payCycle: 'MONTHLY', weeklyMinutes: 2400,
            workScheduleMode: 'SELF_REGISTERED', minimumWeeklyMinutes: 2400,
            signedAt: latest?.signedAt && latest.signedAt <= effectiveAt ? latest.signedAt : effectiveAt, effectiveAt,
            ...(latest?.endsAt && latest.endsAt > effectiveAt ? { endsAt: latest.endsAt } : {}),
            contractReference: ONBOARDING_REPAIR + ':owner-attestation:' + sitterId,
            workplaceRegion: latest?.workplaceRegion ?? 1, workplaceReference: latest?.workplaceReference ?? 'Owner confirmed Hanoi service coverage',
            verifiedBy: actor._id, recordedAt: now }], { session });
          await payroll.PayrollEvent.create([{ employeeId: uid, resourceId: contract._id, actorId: actor._id, type: 'CONTRACT_RECORDED', reason, at: now }], { session });
          const prior = plan.availability.find(row => row._id === sitterId), version = (prior?.version ?? 0) + 1;
          if (prior?.effectiveFrom > '2026-11-09') fail('REPAIR_BLOCKED', 'Resolve a future employee calendar first', 409);
          await col('employeeavailabilities').updateOne({ _id: sitterId }, { $set: { zone: 'Asia/Ho_Chi_Minh', workingWindows: ownerWorkingWindows, areas,
            dayOffDates: prior?.dayOffDates ?? [], state: 'ACTIVE', version, effectiveFrom: '2026-11-09' } }, { upsert: true, session });
          await scheduling.EmployeeAvailabilityRevision.create([{ sitterId, effectiveFrom: '2026-11-09', version, workingWindows: ownerWorkingWindows }], { session });
          const capability = plan.profiles.find(row => String(row.userId) === sitterId);
          await col('aisitterprofiles').updateOne({ userId: uid }, { $set: { serviceIds: plan.services.map(row => row._id), species: ['DOG', 'CAT'],
            areaCodes: areas, maxPets: 1, maxWeightKg: 25, allowedTraits: capability?.allowedTraits ?? [], active: true,
            changedBy: actor._id, version: (capability?.version ?? 0) + 1 }, $setOnInsert: { windows: [], dayOffDates: [], starts: [], timeZone: 'Asia/Ho_Chi_Minh' } }, { upsert: true, session });
          await scheduling.EmployeeScheduleEvent.create([{ type: 'OwnerEmployeeOnboardingRepaired', actorId, sitterId, at: now,
            detail: { reason, contractVersion: contract.version, availabilityVersion: version, capabilityVersion: (capability?.version ?? 0) + 1, serviceCount: plan.services.length, areas: areas.length,
              conservativeCapacity: { maxPets: 1, maxWeightKg: 25 }, actualSignatureDateNotIndependentlyInspected: true } }], { session });
        }
        const result = { employees: 4, weeklyMinutes: 2400, effectiveFrom: '2026-11-09', services: plan.services.length, areas: areas.length, contract: ONBOARDING_REPAIR };
        await scheduling.EmployeeScheduleCommand.create([{ _id: commandId, fingerprint: expectedDigest, result, createdAt: now }], { session }); return result;
      });
    }
  };
}
