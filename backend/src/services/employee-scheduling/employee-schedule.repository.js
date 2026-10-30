import { Types } from 'mongoose';
import { employeeSchedulingModels } from '../../models/employee-scheduling.model.js';
import { payrollModels } from '../../models/payroll.model.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { createSitterAvailabilityService } from '../sitter-availability.service.js';
import { createSitterWorkAreasService } from '../sitter-work-areas.service.js';
import { fail, digest } from '../../validators/pet-care.validator.js';
import { assertEmployeeSchedulingStorage } from './scheduling-storage.service.js';
import { schedulingDate, windowsCover, schedulingWeekStart, occupiedMinutes, workAreaKeys } from './schedule-policy.service.js';
import { edgeKey, cachedMatrix } from '../sitter-matching/routing.service.js';
import { matchingModels } from '../../models/sitter-matching.model.js';
import { SCHEDULE_RULES } from '../sitter-matching/scheduling.service.js';

const oid = value => new Types.ObjectId(value), DAY = 86400000;
const ACTIVE_VISITS = ['ASSIGNED', 'IN_PROGRESS'];
export function createEmployeeScheduleRepository({ connection, clock = Date.now, coverageAreas = [], routingProvider }) {
  const models = employeeSchedulingModels(connection), payroll = payrollModels(connection), uow = createUnitOfWork(connection);
  const col = name => connection.db.collection(name);
  async function employeeGuard(sitterId, session, authEpoch) {
    if (!Types.ObjectId.isValid(sitterId)) fail('UNAUTHENTICATED', 'Invalid employee identity', 401);
    await payroll.PayrollMonthGuard.findOneAndUpdate({ _id: `employee:${sitterId}` }, { $inc: { version: 1 } }, { upsert: true, session });
    const user = await col('users').findOneAndUpdate({ _id: oid(sitterId), state: 'ACTIVE', roles: 'PET_SITTER', synthetic: { $ne: true },
      ...(authEpoch !== undefined ? { authEpoch } : {}) }, { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
    const status = await col('sitterstatuses').findOneAndUpdate({ userId: oid(sitterId), status: 'ACTIVE' },
      { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
    if (!user || !status) fail('SITTER_NOT_ELIGIBLE', 'Active approved employee required', 409);
    return user;
  }
  async function contractAt(sitterId, start, end, session) {
    const contract = await payroll.EmploymentContract.findOne({ employeeId: sitterId, effectiveAt: { $lte: start } })
      .sort({ effectiveAt: -1, version: -1 }).session(session ?? null).lean();
    if (!contract || contract.signedAt > new Date(clock()) || (contract.endsAt && contract.endsAt < end))
      fail('CONTRACT_REQUIRED', 'Signed contract must cover the requested work', 409);
    if (await payroll.EmploymentContract.exists({ employeeId: sitterId, effectiveAt: { $gt: start, $lt: end } }).session(session ?? null))
      fail('CONTRACT_REQUIRED', 'Split work at a contract change', 409);
    return contract;
  }
  async function runGuard({ sitterId, authEpoch }, work) {
    await assertEmployeeSchedulingStorage(connection);
    for (let attempt = 0; ; attempt++) {
      try { return await uow.run(async session => { await employeeGuard(sitterId, session, authEpoch); return work(session); }); }
      catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
    }
  }
  async function ensure(sitterId, session) {
    await models.EmployeeAvailability.updateOne({ _id: sitterId }, { $setOnInsert: { zone: 'Asia/Ho_Chi_Minh',
      workingWindows: [], areas: [], dayOffDates: [], state: 'ACTIVE', version: 0 } }, { upsert: true, session });
  }
  const find = (sitterId, session) => models.EmployeeAvailability.findById(sitterId).session(session ?? null).lean();
  async function revisionAt(sitterId, date, session) {
    return models.EmployeeAvailabilityRevision.findOne({ sitterId, effectiveFrom: { $lte: date } })
      .sort({ effectiveFrom: -1, version: -1 }).session(session ?? null).lean();
  }
  async function assignments(sitterId, from, session) {
    const rows = await col('visits').find({ sitterId: oid(sitterId), state: { $in: ACTIVE_VISITS }, endAt: { $gt: from } }, { session })
      .sort({ startAt: 1 }).limit(201).toArray();
    if (rows.length > 200) fail('CONFIRMED_VISIT_CONFLICT', 'Staff review required for a large schedule', 409);
    return rows;
  }
  const commandId = (sitterId, key, kind = 'availability') => digest([sitterId, kind, key]);
  const availabilityRepository = {
    findBySitterId: ({ sitterId, transaction }) => find(sitterId, transaction),
    async listCalendar({ sitterId, fromLocalDate, toLocalDate }) {
      const result = [];
      const [current, capability] = await Promise.all([find(sitterId), col('aisitterprofiles').findOne({ userId: oid(sitterId) })]);
      const offDates = new Set([...(current?.dayOffDates ?? []), ...(capability?.dayOffDates ?? [])]);
      for (let at = Date.parse(`${fromLocalDate}T00:00:00Z`); at <= Date.parse(`${toLocalDate}T00:00:00Z`); at += DAY) {
        const localDate = new Date(at).toISOString().slice(0, 10), weekday = new Date(at).getUTCDay() || 7;
        const revision = await revisionAt(sitterId, localDate);
        const windows = (revision?.workingWindows ?? []).filter(row => row.weekday === weekday);
        result.push({ localDate, available: windows.length > 0 && !offDates.has(localDate), windows, isDayOff: offDates.has(localDate) });
      }
      return result;
    },
    findCommand: ({ sitterId, idempotencyKey, transaction }) => models.EmployeeScheduleCommand.findById(commandId(sitterId, idempotencyKey)).session(transaction).lean(),
    createIfAbsent: ({ sitterId, transaction }) => ensure(sitterId, transaction),
    async replaceIfVersion({ sitterId, expectedVersion, patch, transaction }) {
      const effective = new Date(Math.max(Date.parse(`${patch.effectiveFrom}T00:00:00+07:00`), clock()));
      await contractAt(sitterId, effective, effective, transaction);
      const current = await find(sitterId, transaction);
      if (current.effectiveFrom && patch.effectiveFrom < current.effectiveFrom) fail('VERSION_CONFLICT', 'Reload and resolve the future schedule before editing an earlier date', 409);
      const result = await models.EmployeeAvailability.findOneAndUpdate({ _id: sitterId, version: expectedVersion },
        { $set: patch, $inc: { version: 1 } }, { session: transaction, returnDocument: 'after' }).lean();
      if (result) await models.EmployeeAvailabilityRevision.create([{ sitterId, effectiveFrom: patch.effectiveFrom,
        workingWindows: patch.workingWindows, version: result.version }], { session: transaction });
      return result;
    },
    async saveCommand({ sitterId, idempotencyKey, fingerprint, result, transaction }) {
      await models.EmployeeScheduleCommand.create([{ _id: commandId(sitterId, idempotencyKey), fingerprint, result, createdAt: new Date(clock()) }], { session: transaction });
      await models.EmployeeScheduleEvent.create([{ type: 'AvailabilityChanged', sitterId, actorId: sitterId, at: new Date(clock()), detail: { version: result.expectedVersion } }], { session: transaction });
    }
  };
  const availability = createSitterAvailabilityService({ availabilityRepository, clock: () => new Date(clock()), withEligibilityGuard: runGuard,
    assignmentRepository: { async findConflicts({ sitterId, workingWindows, effectiveFrom, transaction }) {
      const rows = await assignments(sitterId, new Date(`${effectiveFrom}T00:00:00+07:00`), transaction);
      const items = rows.filter(row => !windowsCover(workingWindows, row.startAt, row.endAt));
      return { items: items.slice(0, 50), hasMore: items.length > 50 };
    } } });
  const areas = createSitterWorkAreasService({ listCoverageAreas: async () => coverageAreas, getSitterAvailability: find,
    replaceSitterAreas: input => runGuard(input, async session => {
      const { sitterId, expectedVersion, idempotencyKey, areas } = input, key = commandId(sitterId, idempotencyKey, 'areas'), fingerprint = digest({ areas, expectedVersion });
      const previous = await models.EmployeeScheduleCommand.findById(key).session(session).lean();
      if (previous) { if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Operation key already used', 409); return previous.result; }
      await contractAt(sitterId, new Date(clock()), new Date(clock()), session); await ensure(sitterId, session);
      const current = await find(sitterId, session);
      if (current.version !== expectedVersion) fail('VERSION_CONFLICT', 'Schedule changed; reload', 409);
      const rows = await assignments(sitterId, new Date(clock()), session);
      if (rows.some(row => !workAreaKeys(row.areaCode, coverageAreas).some(code => areas.includes(code)))) fail('CONFIRMED_VISIT_CONFLICT', 'Staff must review assigned work before removing its area', 409);
      const result = await models.EmployeeAvailability.findOneAndUpdate({ _id: sitterId, version: expectedVersion },
        { $set: { areas }, $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
      await models.EmployeeScheduleCommand.create([{ _id: key, fingerprint, result, createdAt: new Date(clock()) }], { session });
      await models.EmployeeScheduleEvent.create([{ type: 'WorkAreasChanged', sitterId, actorId: sitterId, at: new Date(clock()), detail: { areas } }], { session });
      return result;
    }) });
  async function eligible(sitterId, visit, session) {
    const start = new Date(visit.startAt), end = new Date(visit.endAt), date = schedulingDate(start);
    if (start <= new Date(clock()) || end <= start || end - start > 480 * 60000) fail('SHIFT_REVIEW_REQUIRED', 'Future care shifts must not exceed eight hours', 409);
    const contract = await contractAt(sitterId, start, end, session), record = await find(sitterId, session);
    const capabilityFilter = { userId: oid(sitterId), active: true };
    const capability = session
      ? await col('aisitterprofiles').findOneAndUpdate(capabilityFilter, { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' })
      : await col('aisitterprofiles').findOne(capabilityFilter);
    if (!capability || !capability.serviceIds?.some(value => String(value) === String(visit.serviceId)))
      fail('SERVICE_CAPABILITY_REQUIRED', 'Staff verified service capability required', 409);
    const pets = visit.snapshots?.pets;
    if (!Array.isArray(pets) || !pets.length || pets.length > capability.maxPets || pets.some(pet =>
      !capability.species?.includes(pet.species) || !Number.isFinite(pet.weightKg) || pet.weightKg > capability.maxWeightKg ||
      !Array.isArray(pet.traits) || pet.traits.some(trait => !capability.allowedTraits?.includes(trait))))
      fail('PET_CAPABILITY_MISMATCH', 'Employee capability does not cover the pets on this visit', 409);
    const offDates = [...(record?.dayOffDates ?? []), ...(capability.dayOffDates ?? [])];
    if (offDates.some(day => day >= date && day <= schedulingDate(new Date(end.getTime() - 1))))
      fail('DAY_OFF', 'Employee has approved time off', 409);
    if (await col('aischeduleblocks').findOne({ sitterId: oid(sitterId), startAt: { $lt: end }, endAt: { $gt: start },
      $or: [{ state: 'CONFIRMED' }, { state: 'HOLD', holdExpiresAt: { $gt: new Date(clock()) } }] }, { session }))
      fail('SLOT_UNAVAILABLE', 'Employee has another confirmed schedule block', 409);
    const revision = await revisionAt(sitterId, date, session);
    if (!workAreaKeys(visit.areaCode, coverageAreas).some(code => record?.areas.includes(code))) fail('WORK_AREA_MISMATCH', 'Visit is outside registered work areas', 409);
    if (!windowsCover(revision?.workingWindows, start, end)) fail('OUTSIDE_WORKING_HOURS', 'Visit is outside registered shifts', 409);
    const lastDate = schedulingDate(new Date(end.getTime() - 1));
    if (lastDate !== date) {
      const next = await revisionAt(sitterId, lastDate, session);
      if (next?.version !== revision?.version && !windowsCover(next?.workingWindows, new Date(`${lastDate}T00:00:00+07:00`), end))
        fail('OUTSIDE_WORKING_HOURS', 'Shift crosses an availability change', 409);
    }
    const week = schedulingWeekStart(start), until = new Date(schedulingWeekStart(new Date(end.getTime() - 1)).getTime() + 7 * DAY);
    const rows = await col('visits').find({ sitterId: oid(sitterId), state: { $in: [...ACTIVE_VISITS, 'COMPLETED'] },
      startAt: { $lt: new Date(until.getTime() + DAY) }, endAt: { $gt: new Date(week.getTime() - DAY) } }, { session }).limit(201).toArray();
    if (rows.length > 200) fail('SHIFT_REVIEW_REQUIRED', 'Staff schedule review required', 409);
    if (rows.some(row => row.startAt < end && row.endAt > start)) fail('SLOT_UNAVAILABLE', 'Employee already has work in this slot', 409);
    const samePlace = (a, b) => a.location === 'FACILITY' && b.location === 'FACILITY'
      ? a.snapshots?.serviceAddress === b.snapshots?.serviceAddress
      : a.addressId && b.addressId && String(a.addressId) === String(b.addressId);
    const neighbours = rows.filter(row => schedulingDate(row.startAt) === date || schedulingDate(new Date(row.endAt.getTime() - 1)) === date);
    const before = neighbours.filter(row => row.endAt <= start).sort((a, b) => b.endAt - a.endAt)[0];
    const after = neighbours.filter(row => row.startAt >= end).sort((a, b) => a.startAt - b.startAt)[0];
    let adjacentTravelMinutes = 0, verifiedLegs = 0;
    for (const [from, to] of [[before, visit], [visit, after]]) {
      if (!from || !to) continue;
      let travel = 0;
      if (!samePlace(from, to)) {
        const a = from.snapshots?.point?.coordinates, b = to.snapshots?.point?.coordinates;
        if (!a || !b) fail('TRAVEL_REVIEW_REQUIRED', 'Confirmed route evidence required between work locations', 409);
        let route;
        if (routingProvider) {
          try {
            const matrix = await cachedMatrix({ points: [a, b], Routing: matchingModels(connection).RoutingMatrixCache, provider: routingProvider, clock });
            route = { minutes: matrix(a, b) };
          } catch (error) {
            if (!['ROUTING_UNAVAILABLE', 'ROUTING_LIMIT'].includes(error.code)) throw error;
            fail('TRAVEL_REVIEW_REQUIRED', 'Routing provider must verify travel before dispatch', 409);
          }
        } else route = await col('airoutingmatrixes').findOne({ key: edgeKey(a, b), source: 'OSRM_STATIC_ROAD_ETA',
          recordedAt: { $lte: new Date(clock()) }, expiresAt: { $gt: new Date(clock()) } }, { session });
        if (!route || !Number.isFinite(route.minutes) || route.minutes < 0 || route.minutes > SCHEDULE_RULES.maxLegMinutes)
          fail('TRAVEL_REVIEW_REQUIRED', 'Current route evidence required between work locations', 409);
        travel = Math.ceil(route.minutes) + Math.max(SCHEDULE_RULES.travelBufferMinutes, Math.ceil(route.minutes * SCHEDULE_RULES.travelBufferRatio));
      }
      const handover = samePlace(from, to) ? 0 : SCHEDULE_RULES.handoverMinutes;
      if (new Date(from.endAt).getTime() + (travel + handover) * 60000 > new Date(to.startAt).getTime())
        fail('TRAVEL_TIME_CONFLICT', 'Not enough time to travel and hand over between visits', 409);
      adjacentTravelMinutes += travel; verifiedLegs++;
    }
    const all = [...rows, { startAt: start, endAt: end }];
    for (let at = week.getTime(); at < until.getTime(); at += 7 * DAY)
      if (occupiedMinutes(all, at, at + 7 * DAY) > contract.weeklyMinutes) fail('CONTRACT_HOURS_EXCEEDED', 'Contract weekly hours exceeded', 409);
    for (let at = Date.parse(`${date}T00:00:00+07:00`); at < end.getTime(); at += DAY)
      if (occupiedMinutes(all, at, at + DAY) > 480) fail('CONTRACT_HOURS_EXCEEDED', 'Eight ordinary work hours per day exceeded', 409);
    return { eligible: true, adjacentTravelMinutes: verifiedLegs ? adjacentTravelMinutes : null,
      routingSource: routingProvider?.source ?? 'OSRM_STATIC_ROAD_ETA', weeklyWorkMinutes: occupiedMinutes(rows, week, until) };
  }
  return { models, payroll, uow, col, availability, areas, employeeGuard, eligible, runGuard, find, contractAt,
    areaKeys: code => workAreaKeys(code, coverageAreas) };
}
