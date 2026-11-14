import { Types } from 'mongoose';
import { payrollModels } from '../../models/payroll.model.js';
import { employeeSchedulingModels } from '../../models/employee-scheduling.model.js';
import { windowsCover, schedulingDate } from '../employee-scheduling/schedule-policy.service.js';

const MAX_SITTERS = 200;
const ACTIVE_VISITS = ['ASSIGNED', 'IN_PROGRESS'];
const oid = value => new Types.ObjectId(String(value));

// TEMPORARY SOURCE OF SHOP SHIFTS (GBR-45).
// The Shift Schedule screen does not exist yet, so a pet sitter counts as "on a shop shift" when all of these hold:
//   - an active PET_SITTER account with an ACTIVE sitter status;
//   - a verified, signed FULL_TIME contract covering the slot;
//   - an active capability record (aisitterprofiles) listing every requested service;
//   - the self-registered working hours (EmployeeAvailability revisions) cover the slot, and no day off;
//   - no assigned or running home visit overlaps the slot.
// This is the only place that decides it. Replace this file when Shift Schedule data exists.
export function createShopShiftSource({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name);
  const { EmploymentContract } = payrollModels(connection);
  const { EmployeeAvailability, EmployeeAvailabilityRevision } = employeeSchedulingModels(connection);

  // Loads everything for [from, to) once; `sittersFor(start, end)` is then a pure, synchronous filter.
  async function openRoster({ serviceIds, from, to }) {
    const now = new Date(clock());
    const fullTime = await EmploymentContract.distinct('employeeId', { supersededAt: null, employmentType: 'FULL_TIME', verifiedBy: { $ne: null } });
    if (!fullTime.length) return { sittersFor: () => [] };
    const ids = fullTime.slice(0, MAX_SITTERS).map(String), objectIds = ids.map(oid);
    const [contracts, users, statuses, capabilities, availability, revisions, visits] = await Promise.all([
      EmploymentContract.find({ employeeId: { $in: objectIds }, supersededAt: null }).sort({ effectiveAt: -1, version: -1 }).lean(),
      col('users').find({ _id: { $in: objectIds }, state: 'ACTIVE', roles: 'PET_SITTER', synthetic: { $ne: true } }, { projection: { _id: 1 } }).toArray(),
      col('sitterstatuses').find({ userId: { $in: objectIds }, status: 'ACTIVE' }, { projection: { userId: 1 } }).toArray(),
      col('aisitterprofiles').find({ userId: { $in: objectIds }, active: true, serviceIds: { $all: serviceIds.map(oid) } },
        { projection: { userId: 1, dayOffDates: 1 } }).toArray(),
      EmployeeAvailability.find({ _id: { $in: ids } }).select('dayOffDates').lean(),
      EmployeeAvailabilityRevision.find({ sitterId: { $in: ids }, effectiveFrom: { $lte: schedulingDate(to) } }).sort({ effectiveFrom: -1, version: -1 }).lean(),
      col('visits').find({ sitterId: { $in: objectIds }, state: { $in: ACTIVE_VISITS }, startAt: { $lt: to }, endAt: { $gt: from } },
        { projection: { sitterId: 1, startAt: 1, endAt: 1 } }).toArray()
    ]);
    const active = new Set(users.map(row => String(row._id)));
    const enabled = new Set(statuses.map(row => String(row.userId)));
    const capability = new Map(capabilities.map(row => [String(row.userId), row]));
    const group = (rows, key) => rows.reduce((map, row) => map.set(String(row[key]), [...(map.get(String(row[key])) ?? []), row]), new Map());
    const contractsBySitter = group(contracts, 'employeeId'), revisionsBySitter = group(revisions, 'sitterId'), visitsBySitter = group(visits, 'sitterId');
    const availabilityBySitter = new Map(availability.map(row => [String(row._id), row]));
    const candidates = ids.filter(id => active.has(id) && enabled.has(id) && capability.has(id));

    function onShift(id, start, end) {
      // Same contract choice as the scheduling repository: the newest contract effective at the slot start.
      const contract = (contractsBySitter.get(id) ?? []).find(row => row.effectiveAt <= start);
      if (!contract || contract.employmentType !== 'FULL_TIME' || !contract.verifiedBy || contract.signedAt > now || (contract.endsAt && contract.endsAt < end)) return false;
      const date = schedulingDate(start), lastDate = schedulingDate(new Date(end.getTime() - 1));
      const off = [...(availabilityBySitter.get(id)?.dayOffDates ?? []), ...(capability.get(id).dayOffDates ?? [])];
      if (off.some(day => day >= date && day <= lastDate)) return false;
      const revision = (revisionsBySitter.get(id) ?? []).find(row => row.effectiveFrom <= date);
      if (!windowsCover(revision?.workingWindows, start, end)) return false;
      return !(visitsBySitter.get(id) ?? []).some(row => row.startAt < end && row.endAt > start);
    }
    return { sittersFor: (start, end) => candidates.filter(id => onShift(id, start, end)) };
  }
  return { openRoster };
}
