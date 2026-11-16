import { Types } from 'mongoose';
import { payrollModels } from '../../models/payroll.model.js';
import { employeeSchedulingModels } from '../../models/employee-scheduling.model.js';
import { windowsCover, schedulingDate, schedulingWeekStart, occupiedMinutes } from '../employee-scheduling/schedule-policy.service.js';
import { groomingOccupancy } from '../employee-scheduling/grooming-occupancy.service.js';
import { fail } from '../../validators/pet-care.validator.js';

const oid = value => new Types.ObjectId(String(value)), DAY = 86400000;
const budget = rows => { if (rows.length > 2000) fail('GROOMING_ROSTER_REVIEW_REQUIRED', 'Shop roster exceeds review budget', 503); return rows; };

// Explicit employee-registered SHOP windows are authoritative. Legacy windows
// remain HOME; an available employee is never implicitly assigned to the shop.
export function createShopShiftSource({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name);
  const { EmploymentContract } = payrollModels(connection);
  const { EmployeeAvailability, EmployeeAvailabilityRevision } = employeeSchedulingModels(connection);
  async function openRoster({ serviceIds = [], from, to, session = null }) {
    const now = new Date(clock());
    const candidates = await EmployeeAvailabilityRevision.aggregate([
      { $match: { 'workingWindows.workLocation': 'SHOP', effectiveFrom: { $lte: schedulingDate(to) } } },
      { $group: { _id: '$sitterId' } }, { $sort: { _id: 1 } }, { $limit: 201 }
    ]).session(session).option({ maxTimeMS: 5000 });
    if (candidates.length > 200) fail('GROOMING_ROSTER_REVIEW_REQUIRED', 'More than 200 shop employees require roster review', 503);
    const ids = candidates.map(row => row._id), objectIds = ids.map(oid);
    if (!ids.length) return { sittersFor: () => [] };
    const week = schedulingWeekStart(from), until = new Date(+schedulingWeekStart(to) + 7 * DAY);
    const [contracts, users, statuses, capabilities, availability, revisions, visits, blocks, shop] = await Promise.all([
      EmploymentContract.find({ employeeId: { $in: objectIds }, supersededAt: null }).sort({ effectiveAt: -1, version: -1 }).limit(2001).maxTimeMS(5000).session(session).lean(),
      col('users').find({ _id: { $in: objectIds }, state: 'ACTIVE', roles: 'PET_SITTER', synthetic: { $ne: true } }, { session, projection: { _id: 1 }, maxTimeMS: 5000 }).limit(201).toArray(),
      col('sitterstatuses').find({ userId: { $in: objectIds }, status: 'ACTIVE' }, { session, projection: { userId: 1 }, maxTimeMS: 5000 }).limit(201).toArray(),
      col('aisitterprofiles').find({ userId: { $in: objectIds }, active: true }, { session, maxTimeMS: 5000 }).limit(201).toArray(),
      EmployeeAvailability.find({ _id: { $in: ids } }).select('dayOffDates state').limit(201).session(session).lean(),
      EmployeeAvailabilityRevision.find({ sitterId: { $in: ids }, effectiveFrom: { $lte: schedulingDate(to) } }).sort({ effectiveFrom: -1, version: -1 }).limit(2001).maxTimeMS(5000).session(session).lean(),
      col('visits').find({ sitterId: { $in: objectIds }, state: { $in: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] }, startAt: { $lt: until }, endAt: { $gt: week } },
        { session, projection: { sitterId: 1, startAt: 1, endAt: 1 }, maxTimeMS: 5000 }).limit(2001).toArray(),
      col('aischeduleblocks').find({ sitterId: { $in: objectIds }, startAt: { $lt: to }, endAt: { $gt: from },
        $or: [{ state: 'CONFIRMED' }, { state: 'HOLD', holdExpiresAt: { $gt: now } }] }, { session, maxTimeMS: 5000 }).limit(2001).toArray(),
      groomingOccupancy({ connection, sitterIds: ids, from: week, to: until, session })
    ]);
    [contracts, revisions, visits, blocks].forEach(budget);
    const active = new Set(users.map(row => String(row._id))), enabled = new Set(statuses.map(row => String(row.userId)));
    const capability = new Map(capabilities.map(row => [String(row.userId), row]));
    const group = (rows, key) => rows.reduce((map, row) => map.set(String(row[key]), [...(map.get(String(row[key])) ?? []), row]), new Map());
    const contractsBySitter = group(contracts, 'employeeId'), revisionsBySitter = group(revisions, 'sitterId');
    const visitsBySitter = group(visits, 'sitterId'), shopBySitter = group(shop, 'sitterId'), blocksBySitter = group(blocks, 'sitterId');
    const availabilityBySitter = new Map(availability.map(row => [String(row._id), row]));
    function onShift(id, start, end, requirement = {}) {
      if (!active.has(id) || !enabled.has(id) || availabilityBySitter.get(id)?.state !== 'ACTIVE') return false;
      const cap = capability.get(id), requested = requirement.serviceIds ?? serviceIds, pet = requirement.pet;
      if (!cap || requested.some(service => !cap.serviceIds?.some(value => String(value) === String(service)))) return false;
      if (pet && (!cap.species?.includes(pet.species) || !Number.isFinite(pet.weightKg) || pet.weightKg > cap.maxWeightKg
        || !(cap.maxPets >= 1) || !Array.isArray(pet.traits) || pet.traits.some(trait => !cap.allowedTraits?.includes(trait)))) return false;
      const history = contractsBySitter.get(id) ?? [], contract = history.find(row => row.effectiveAt <= start);
      if (!contract || contract.employmentType !== 'FULL_TIME' || !contract.verifiedBy || !(contract.signedAt instanceof Date)
        || contract.signedAt > now || contract.endsAt && contract.endsAt < end || history.some(row => row.effectiveAt > start && row.effectiveAt < end)) return false;
      const date = schedulingDate(start), lastDate = schedulingDate(new Date(+end - 1));
      const off = [...(availabilityBySitter.get(id)?.dayOffDates ?? []), ...(cap.dayOffDates ?? [])];
      if (off.some(day => day >= date && day <= lastDate)) return false;
      const revision = (revisionsBySitter.get(id) ?? []).find(row => row.effectiveFrom <= date);
      if (!windowsCover(revision?.workingWindows, start, end, 'SHOP')) return false;
      const next = (revisionsBySitter.get(id) ?? []).find(row => row.effectiveFrom <= lastDate);
      if (next !== revision && !windowsCover(next?.workingWindows, new Date(`${lastDate}T00:00:00+07:00`), end, 'SHOP')) return false;
      const home = visitsBySitter.get(id) ?? [], reserved = requirement.ignoreReservations ? [] : shopBySitter.get(id) ?? [];
      if ([...home, ...reserved, ...(blocksBySitter.get(id) ?? [])].some(row => row.startAt < end && row.endAt > start)) return false;
      // No authoritative shop coordinates/route source is configured yet. A
      // same-day home visit requires travel verification, not guessed zero travel.
      if (home.some(row => schedulingDate(row.startAt) <= lastDate && schedulingDate(new Date(+row.endAt - 1)) >= date)) return false;
      const occupied = [...home, ...reserved, { startAt: start, endAt: end }];
      if (occupiedMinutes(occupied, +schedulingWeekStart(start), +schedulingWeekStart(start) + 7 * DAY) > contract.weeklyMinutes) return false;
      for (let at = Date.parse(`${date}T00:00:00+07:00`); at < +end; at += DAY)
        if (occupiedMinutes(occupied, at, at + DAY) > 480) return false;
      return true;
    }
    return { sittersFor: (start, end, requirement) => ids.filter(id => onShift(id, start, end, requirement)) };
  }
  return { openRoster };
}
