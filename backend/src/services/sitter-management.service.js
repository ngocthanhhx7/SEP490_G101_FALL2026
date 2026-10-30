import { Types } from 'mongoose';
import { AppError } from '../utils/app-error.js';
import { hasRole } from '../utils/roles.js';
import { createScopedCursor } from '../utils/scoped-cursor.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { sitterManagementQuery } from '../validators/sitter-management.validator.js';

const iso = value => value ? new Date(value).toISOString() : null;
const id = value => String(value);
const fields = list => Object.fromEntries(list.map(key => [key, 1]));
const oid = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Sitter not found');
  return new Types.ObjectId(value);
};
const dayKey = value => new Date(+new Date(value) + 7 * 3600000).toISOString().slice(0, 10);
const isDemo = user => Boolean(user.fixtureKey);

export function createSitterManagementService({ connection, cursorSecret, clock = Date.now }) {
  const cursors = createScopedCursor({ secret: cursorSecret, namespace: 'sitter-management-v1' });
  function authorize(actor) {
    if (!actor?.userId || actor.state !== 'ACTIVE' || !Number.isFinite(actor.expiresAt) || actor.expiresAt <= clock()) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Session required');
    }
    if (!hasRole(actor.roles, 'STAFF')) throw new AppError(403, 'FORBIDDEN', 'Staff access required');
  }
  function joins(now) {
    const lookup = (from, local, foreign, as, select, extra = []) => ({ $lookup: {
      from, let: { target: local }, pipeline: [{ $match: { $expr: { $eq: ['$' + foreign, '$$target'] } } }, ...extra,
        { $project: fields(select) }], as
    } });
    return [
      lookup('sitterstatuses', '$_id', 'userId', 'statuses', ['status', 'version', 'changedAt']),
      lookup('sitterpublicprofiles', '$_id', 'userId', 'profiles', ['bio', 'areas', 'state', 'version', 'updatedAt']),
      lookup('aisitterprofiles', '$_id', 'userId', 'capabilities', ['active', 'serviceIds', 'species', 'areaCodes', 'maxPets', 'maxWeightKg', 'allowedTraits', 'version']),
      lookup('employeeavailabilities', { $toString: '$_id' }, '_id', 'schedules', ['areas']),
      lookup('employmentcontracts', '$_id', 'employeeId', 'contracts', ['employmentType', 'weeklyMinutes', 'effectiveAt', 'endsAt', 'version'],
        [{ $match: { effectiveAt: { $lte: now } } }, { $sort: { effectiveAt: -1, version: -1 } }, { $limit: 1 },
          { $match: { signedAt: { $lte: now }, $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gt: now } }] } }]),
      { $set: { status: { $ifNull: [{ $first: '$statuses.status' }, 'MISSING'] },
        profileState: { $ifNull: [{ $first: '$profiles.state' }, 'MISSING'] },
        areas: { $ifNull: [{ $first: '$schedules.areas' }, []] },
        employmentType: { $ifNull: [{ $first: '$contracts.employmentType' }, 'MISSING'] } } }
    ];
  }
  function pipeline(query, now) {
    const match = { roles: 'PET_SITTER', synthetic: { $ne: true } };
    if (query.search) match.displayName = { $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (query.source === 'DEMO') match.fixtureKey = { $type: 'string', $ne: '' };
    if (query.source === 'REAL') match.$or = [{ fixtureKey: { $exists: false } }, { fixtureKey: null }, { fixtureKey: '' }];
    const filter = {};
    for (const key of ['status', 'employmentType', 'profileState']) if (query[key]) filter[key] = query[key];
    if (query.area) filter.areas = query.area;
    return [{ $match: match }, { $project: fields(['displayName', 'state', 'fixtureKey', 'createdAt', 'updatedAt']) },
      ...joins(now), { $match: filter }];
  }
  const aggregate = (name, stages, session) => connection.db.collection(name).aggregate(stages, { session, maxTimeMS: 5000 }).toArray();
  const snapshot = fn => connection.transaction(fn, { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
  const period = (days, now) => {
    const today = dayKey(now), end = new Date(new Date(today + 'T00:00:00+07:00').getTime() + 86400000);
    return { start: new Date(end.getTime() - days * 86400000), end, from: dayKey(end.getTime() - days * 86400000), to: today };
  };
  function row(user) {
    return { id: id(user._id), displayName: user.displayName, accountState: user.state, demo: isDemo(user),
      status: user.status, profileState: user.profileState, areas: user.areas, employmentType: user.employmentType,
      capabilityActive: user.capabilities[0]?.active === true, createdAt: iso(user.createdAt), updatedAt: iso(user.updatedAt) };
  }
  function context(actor, query, kind, target = '') {
    const filters = { ...query }; delete filters.cursor;
    return { actor: actor.userId, kind, target, filters };
  }
  async function list({ actor, query: input }) {
    authorize(actor);
    const query = sitterManagementQuery(input), now = new Date(clock()), scope = context(actor, query, 'list');
    return snapshot(async session => {
      const base = pipeline(query, now), pageMatch = [];
      if (query.cursor) pageMatch.push({ $match: { _id: { $gt: oid(cursors.decode(query.cursor, scope).id) } } });
      const [result] = await aggregate('users', [...base, { $facet: {
        count: [{ $count: 'value' }], page: [...pageMatch, { $sort: { _id: 1 } }, { $limit: query.limit + 1 }]
      } }], session);
      const page = result.page.slice(0, query.limit);
      return { items: page.map(row), total: result.count[0]?.value ?? 0, asOf: now.toISOString(),
        areas: DEMO_WORK_AREAS, nextCursor: result.page.length > query.limit ? cursors.encode({ id: id(page.at(-1)._id) }, scope) : null };
    });
  }
  async function reports({ actor, query: input }) {
    authorize(actor);
    const query = sitterManagementQuery(input, 'reports'), now = new Date(clock()), range = period(query.days, now);
    const existing = await connection.db.listCollections({ name: 'visits' }, { nameOnly: true }).toArray();
    const visitsAvailable = existing.length > 0;
    return snapshot(async session => {
      const [result] = await aggregate('users', [...pipeline(query, now), { $facet: {
        counts: [{ $group: { _id: null, total: { $sum: 1 }, demo: { $sum: { $cond: [{ $and: [{ $ne: [{ $ifNull: ['$fixtureKey', ''] }, ''] }] }, 1, 0] } },
          active: { $sum: { $cond: [{ $and: [{ $eq: ['$state', 'ACTIVE'] }, { $eq: ['$status', 'ACTIVE'] }] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ['$status', 'SUSPENDED'] }, 1, 0] } },
          missingContract: { $sum: { $cond: [{ $eq: ['$employmentType', 'MISSING'] }, 1, 0] } } } }],
        coverage: [{ $unwind: '$areas' }, { $group: { _id: '$areas', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 30 }],
        work: visitsAvailable ? [{ $lookup: { from: 'visits', let: { employee: '$_id' }, pipeline: [
          { $match: { startAt: { $gte: range.start, $lt: range.end }, state: { $ne: 'SUPERSEDED' },
            $expr: { $in: ['$sitterId', ['$$employee', { $toString: '$$employee' }]] } } },
          { $group: { _id: '$state', count: { $sum: 1 } } }], as: 'work' } },
        { $unwind: '$work' }, { $group: { _id: '$work._id', count: { $sum: '$work.count' } } }] : [{ $match: { $expr: false } }]
      } }], session);
      const counts = result.counts[0] ?? { total: 0, demo: 0, active: 0, suspended: 0, missingContract: 0 };
      delete counts._id;
      return { asOf: now.toISOString(), days: query.days, from: range.from, to: range.to,
        counts: { ...counts, real: counts.total - counts.demo }, visitsAvailable,
        work: result.work.map(r => ({ state: r._id, count: r.count })),
        coverage: result.coverage.map(r => ({ code: r._id, count: r.count })) };
    });
  }
  async function get({ actor, userId, query: input }) {
    authorize(actor);
    const target = oid(userId), now = new Date(clock()); sitterManagementQuery(input, 'detail');
    const ratingSource = (await connection.db.listCollections({ name: 'reviews' }, { nameOnly: true }).toArray()).length > 0;
    return snapshot(async session => {
      const [user] = await aggregate('users', [{ $match: { _id: target, roles: 'PET_SITTER', synthetic: { $ne: true } } }, ...joins(now)], session);
      if (!user) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Sitter not found');
      const [application] = await aggregate('sitterapplications', [{ $match: { provisionedUserId: target, state: 'APPROVED' } },
        { $sort: { updatedAt: -1, _id: -1 } }, { $limit: 1 },
        { $project: fields(['experience', 'ageEligible', 'employmentType', 'requestedServices', 'workAreas', 'createdAt', 'updatedAt']) }], session);
      const [availability] = await aggregate('employeeavailabilities', [{ $match: { _id: userId } },
        { $project: fields(['state', 'version', 'effectiveFrom', 'zone', 'workingWindows', 'dayOffDates', 'areas']) }], session);
      const capability = user.capabilities[0];
      const serviceIds = capability?.serviceIds ?? [];
      const services = await aggregate('services', [{ $match: { _id: { $in: serviceIds } } }, { $project: fields(['code']) }], session);
      const status = user.statuses[0];
      const ratings = ratingSource ? await aggregate('reviews', [{ $match: { sitterId: { $in: [target, userId] },
        direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED' } }, { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' },
        invalid: { $sum: { $cond: [{ $and: [{ $isNumber: '$rating' }, { $gte: ['$rating', 1] }, { $lte: ['$rating', 5] },
          { $eq: [{ $mod: [{ $convert: { input: '$rating', to: 'double', onError: null, onNull: null } }, 1] }, 0] }] }, 0, 1] } } } }], session) : [];
      if (ratings[0]?.invalid) throw new AppError(503, 'INVALID_PROJECTION', 'Invalid published rating');
      const admin = hasRole(actor.roles, 'ADMIN');
      const latestContract = admin ? await connection.db.collection('employmentcontracts').findOne({ employeeId: target },
        { session, projection: { version: 1 }, sort: { version: -1 } }) : null;
      const audit = admin && application ? await aggregate('sitterapplicationaudits', [{ $match: { resourceId: application._id,
        action: { $in: ['SITTER_SUSPENDED', 'SITTER_REINSTATED', 'APPLICATION_DECIDED'] } } },
      { $sort: { occurredAt: -1, _id: -1 } }, { $limit: 20 }, { $project: fields(['action', 'occurredAt', 'resultVersion']) }], session) : [];
      return { ...row(user), rating: { available: ratingSource, count: ratingSource ? ratings[0]?.count ?? 0 : null,
        average: ratings[0]?.average ?? null }, areaCatalog: DEMO_WORK_AREAS, asOf: now.toISOString(), profile: user.profiles[0] ? {
        bio: user.profiles[0].bio, areas: user.profiles[0].areas, state: user.profiles[0].state, updatedAt: iso(user.profiles[0].updatedAt)
      } : null, application: application ? { ...(admin ? { id: id(application._id) } : {}), experience: application.experience,
        ageEligible: application.ageEligible, employmentType: application.employmentType ?? null,
        requestedServices: application.requestedServices, workAreas: application.workAreas, submittedAt: iso(application.createdAt) } : null,
      statusVersion: status?.version ?? null, statusChangedAt: iso(status?.changedAt),
      capabilities: capability ? { active: capability.active, species: capability.species,
        areas: user.areas, maxPets: capability.maxPets, maxWeightKg: capability.maxWeightKg,
        allowedTraits: capability.allowedTraits ?? [], services: serviceIds.map(value => ({ id: id(value), code: services.find(s => id(s._id) === id(value))?.code ?? null })) } : null,
      contracts: user.contracts.map(c => ({ employmentType: c.employmentType, weeklyMinutes: c.weeklyMinutes,
        effectiveAt: iso(c.effectiveAt), endsAt: iso(c.endsAt), version: c.version })),
      availability: availability ? { state: availability.state, version: availability.version, zone: availability.zone,
        effectiveFrom: availability.effectiveFrom ?? null, areas: availability.areas ?? [],
        workingWindows: (availability.workingWindows ?? []).map(w => ({ weekday: w.weekday,
          startLocalTime: w.startLocalTime, endLocalTime: w.endLocalTime })),
        dayOffDates: availability.dayOffDates ?? [] } : null,
      audit: audit.map(a => ({ id: id(a._id), action: a.action, at: iso(a.occurredAt), version: a.resultVersion })),
      ...(admin ? { contractVersion: latestContract?.version ?? 0 } : {}),
      permissions: { manageContract: admin && user.state === 'ACTIVE' && Boolean(application),
        manageStatus: admin && Boolean(application && status), reviewApplication: admin && Boolean(application) } };
    });
  }
  async function activity({ actor, userId, query: input }) {
    authorize(actor);
    const target = oid(userId), query = sitterManagementQuery(input, 'activity'), now = new Date(clock()), range = period(query.days, now);
    const scope = context(actor, query, 'activity', userId);
    return snapshot(async session => {
      const users = await aggregate('users', [{ $match: { _id: target, roles: 'PET_SITTER', synthetic: { $ne: true } } }, { $limit: 1 }], session);
      if (!users.length) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Sitter not found');
      const match = { sitterId: { $in: [target, userId] }, state: { $ne: 'SUPERSEDED' }, startAt: { $gte: range.start, $lt: range.end } };
      if (query.cursor) {
        const last = cursors.decode(query.cursor, scope);
        if (!Number.isFinite(Date.parse(last.startAt))) throw new AppError(422, 'VALIDATION_FAILED', 'Invalid activity cursor');
        match.$or = [{ startAt: { $lt: new Date(last.startAt) } }, { startAt: new Date(last.startAt), _id: { $lt: oid(last.id) } }];
      }
      const rows = await aggregate('visits', [{ $match: match }, { $sort: { startAt: -1, _id: -1 } }, { $limit: query.limit + 1 },
        { $project: fields(['startAt', 'endAt', 'state', 'snapshots.serviceName']) }], session);
      const page = rows.slice(0, query.limit);
      return { asOf: now.toISOString(), from: range.from, to: range.to, items: page.map(v => ({ id: id(v._id), startAt: iso(v.startAt),
        endAt: iso(v.endAt), state: v.state, serviceName: v.snapshots?.serviceName ?? null })),
      nextCursor: rows.length > query.limit ? cursors.encode({ id: id(page.at(-1)._id), startAt: iso(page.at(-1).startAt) }, scope) : null };
    });
  }
  return { list, reports, get, activity };
}
