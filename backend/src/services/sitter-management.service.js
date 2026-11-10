import { createReferenceCatalogFacade } from './reference-catalog.service.js';
import { Types } from 'mongoose';
import { AppError } from '../utils/app-error.js';
import { hasRole } from '../utils/roles.js';
import { createScopedCursor } from '../utils/scoped-cursor.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { normalizeVietnamPhone } from './sms-template.service.js';
import { normalizeWorkingWindows } from './sitter-availability.service.js';
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

const STAFF_BATCH_SIZE = 100;
const METRIC_WINDOW_MS = 30 * 86400000;
const LATE_THRESHOLD_MS = 5 * 60000;
const sitterNames = new Intl.Collator('vi', { sensitivity: 'base' });

function readWithdrawalCounts() {
  // Until UC-82 events are connected, the count is unknown for every sitter.
  return null;
}

function phoneSearch(term) {
  const compact = term.replace(/[\s().-]/g, '');
  return /^\+?\d+$/u.test(compact) ? normalizeVietnamPhone(term) ?? compact : null;
}

function codeFor(user) {
  return user.contracts[0]?.employeeCode || id(user._id).slice(-6).toUpperCase();
}

function normalizedSearch(value) {
  return value.normalize('NFC').toLocaleLowerCase('vi');
}

function compareStaffPosition(left, right) {
  const leftValue = left.value ?? -Infinity;
  const rightValue = right.value ?? -Infinity;
  if (leftValue !== rightValue) return rightValue - leftValue;
  return sitterNames.compare(left.name, right.name) || left.id.localeCompare(right.id);
}

export function createSitterManagementService({ connection, cursorSecret, contactCrypto, clock = Date.now }) {
  const cursors = createScopedCursor({ secret: cursorSecret, namespace: 'sitter-management-v1' });
  const staffCursors = createScopedCursor({ secret: cursorSecret, namespace: 'staff-sitter-list-v1',
    clock, maxTokenLength: 2048 });
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
      lookup('employmentcontracts', '$_id', 'employeeId', 'contracts', ['employmentType', 'weeklyMinutes', 'effectiveAt', 'endsAt', 'version', 'employeeCode'],
        [{ $match: { supersededAt: null, effectiveAt: { $lte: now } } }, { $sort: { effectiveAt: -1, version: -1 } }, { $limit: 1 },
          { $match: { signedAt: { $lte: now }, $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gt: now } }] } }]),
      { $set: { status: { $ifNull: [{ $first: '$statuses.status' }, 'MISSING'] },
        profileState: { $ifNull: [{ $first: '$profiles.state' }, 'MISSING'] },
        areas: { $ifNull: [{ $first: '$schedules.areas' }, []] },
        employmentType: { $ifNull: [{ $first: '$contracts.employmentType' }, 'MISSING'] } } }
    ];
  }
  function pipeline(query, now) {
    const match = { roles: 'PET_SITTER', synthetic: { $ne: true } };
    if (query.view === 'staffList') match.state = 'ACTIVE';
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
  async function matchingStaff(rows, search, session) {
    if (!search) return rows;
    const term = normalizedSearch(search), phoneTerm = phoneSearch(term);
    const matching = [];
    for (let offset = 0; offset < rows.length; offset += STAFF_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + STAFF_BATCH_SIZE);
      const phoneCandidates = new Map();
      for (const user of batch) {
        if (normalizedSearch(user.displayName).includes(term) || normalizedSearch(codeFor(user)).includes(term)) matching.push(user);
        else if (phoneTerm) phoneCandidates.set(id(user._id), user);
      }
      if (!phoneCandidates.size) continue;
      const contacts = await aggregate('contacts', [{ $match: {
        userId: { $in: [...phoneCandidates.values()].map(user => user._id) }, channel: 'PHONE', state: 'VERIFIED'
      } }, { $project: fields(['userId', 'canonicalCiphertext']) }], session);
      for (const contact of contacts) {
        const user = phoneCandidates.get(id(contact.userId));
        if (!user) continue;
        let phone;
        try { phone = contactCrypto.decrypt(contact.canonicalCiphertext); } catch { continue; }
        const local = phone.replace(/^\+84(?=\d{9}$)/u, '0');
        if (phone.includes(phoneTerm) || local.includes(phoneTerm)) {
          matching.push(user);
          phoneCandidates.delete(id(user._id));
        }
      }
    }
    return matching;
  }

  async function staffMetrics(rows, sources, from, asOf, session) {
    const ratings = new Map(), late = new Map();
    for (let offset = 0; offset < rows.length; offset += STAFF_BATCH_SIZE) {
      const ids = rows.slice(offset, offset + STAFF_BATCH_SIZE).flatMap(user => [user._id, id(user._id)]);
      if (sources.has('reviews')) {
        const published = await aggregate('reviews', [{ $match: {
          sitterId: { $in: ids }, direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED'
        } }, { $group: { _id: { $toString: '$sitterId' }, average: { $avg: '$rating' },
          invalid: { $sum: { $cond: [{ $in: ['$rating', [1, 2, 3, 4, 5]] }, 0, 1] } }
        } }], session);
        for (const record of published) {
          if (record.invalid) throw new AppError(503, 'INVALID_PROJECTION', 'Invalid published rating');
          ratings.set(record._id, record.average);
        }
      }
      if (sources.has('visits')) {
        const checkedIn = await aggregate('visits', [{ $match: {
          sitterId: { $in: ids }, state: { $ne: 'SUPERSEDED' }, startAt: { $type: 'date' },
          checkInAt: { $type: 'date', $gte: from, $lte: asOf }
        } }, { $group: { _id: { $toString: '$sitterId' }, count: { $sum: {
          $cond: [{ $gt: [{ $subtract: ['$checkInAt', '$startAt'] }, LATE_THRESHOLD_MS] }, 1, 0]
        } } } }], session);
        for (const record of checkedIn) late.set(record._id, record.count);
      }
    }
    return { ratings, late };
  }

  async function staffWorkingHours(page, asOf, session) {
    const sitterIds = page.filter(item => item.employmentType === 'PART_TIME').map(item => item.id);
    if (!sitterIds.length) return new Map();
    const revisions = await aggregate('employeeavailabilityrevisions', [
      { $match: { sitterId: { $in: sitterIds }, effectiveFrom: { $lte: dayKey(asOf) } } },
      { $sort: { effectiveFrom: -1, version: -1 } },
      { $group: { _id: '$sitterId', windows: { $first: '$workingWindows' } } }
    ], session);
    return new Map(revisions.map(record => [record._id, normalizeWorkingWindows(record.windows ?? [])]));
  }

  async function staffList(actor, query, now) {
    const scope = context(actor, query, 'staff-list');
    const position = query.cursor ? staffCursors.decode(query.cursor, scope) : null;
    const asOf = position ? new Date(position.asOf) : now;
    const from = new Date(+asOf - METRIC_WINDOW_MS);
    const registered = await connection.db.listCollections({ name: { $in: ['reviews', 'visits'] } }, { nameOnly: true }).toArray();
    const sources = new Set(registered.map(collection => collection.name));
    return snapshot(async session => {
      const population = await aggregate('users', pipeline({
        view: 'staffList', status: 'ACTIVE', source: 'ALL'
      }, asOf), session);
      const filtered = population.filter(user => (!query.employmentType || user.employmentType === query.employmentType)
        && (!query.area || user.areas.includes(query.area))
        && (!query.profileState || user.profileState === query.profileState)
        && (query.source === 'ALL' || isDemo(user) === (query.source === 'DEMO')));
      const matching = await matchingStaff(filtered, query.search, session);
      const withdrawals = await readWithdrawalCounts({ rows: matching, from, asOf, session });
      if (query.sort === 'withdrawals' && !withdrawals) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Withdrawal sorting is unavailable');
      }
      const { ratings, late } = await staffMetrics(matching, sources, from, asOf, session);
      const items = matching.map(user => ({
        ...row(user), code: codeFor(user), rating: ratings.get(id(user._id)) ?? null,
        lateCheckIns: sources.has('visits') ? late.get(id(user._id)) ?? 0 : null,
        withdrawals: withdrawals ? withdrawals.get(id(user._id)) ?? 0 : null
      }));
      const key = item => ({ value: item[query.sort], name: item.displayName, id: item.id });
      items.sort((a, b) => compareStaffPosition(key(a), key(b)));
      const remaining = position ? items.filter(item => compareStaffPosition(key(item), position) > 0) : items;
      const page = remaining.slice(0, query.limit);
      const hours = await staffWorkingHours(page, asOf, session);
      return {
        items: page.map(item => ({ ...item, workingWindows: hours.get(item.id) ?? [], shift: null, approvedLeave: null })),
        total: items.length, asOf: asOf.toISOString(), areas: DEMO_WORK_AREAS, withdrawalsAvailable: withdrawals !== null,
        tabCounts: {
          all: population.length,
          partTime: population.filter(user => user.employmentType === 'PART_TIME').length,
          fullTime: population.filter(user => user.employmentType === 'FULL_TIME').length
        },
        nextCursor: remaining.length > page.length
          ? staffCursors.encode({ ...key(page.at(-1)), asOf: asOf.toISOString() }, scope) : null
      };
    });
  }

  async function list({ actor, query: input }) {
    authorize(actor);
    const query = sitterManagementQuery(input), now = new Date(clock());
    if (query.view === 'staffList') return staffList(actor, query, now);
    const scope = context(actor, query, 'list');
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
      const services = await aggregate('services', [{ $sort: { code: 1 } }, { $limit: 61 },
        { $lookup: { from: 'serviceversions', let: { target: '$_id' }, pipeline: [{ $match: { effectiveAt: { $lte: now }, $expr: { $eq: ['$serviceId', '$$target'] } } },
          { $sort: { effectiveAt: -1, version: -1 } }, { $limit: 1 }, { $project: { name: 1 } }], as: 'versions' } }, { $project: fields(['code', 'versions.name']) }], session);
      if (services.length > 60) throw new AppError(409, 'CATALOG_LIMIT', 'Service catalog requires review');
      const traits = await createReferenceCatalogFacade({ connection }).listTraits({ limit: 100 });
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
      traitCatalog: traits.map(t => ({ code: t.code, label: t.label })),
      serviceCatalog: services.map(s => ({ id: id(s._id), code: s.code, name: s.versions?.[0]?.name ?? s.code })),
      capabilities: capability ? { version: capability.version ?? 0, active: capability.active, species: capability.species,
        areas: user.areas, maxPets: capability.maxPets, maxWeightKg: capability.maxWeightKg,
        allowedTraits: capability.allowedTraits ?? [], services: serviceIds.map(value => { const service = services.find(s => id(s._id) === id(value)); return { id: id(value), code: service?.code ?? null, name: service?.versions?.[0]?.name ?? service?.code ?? null }; }) } : null,
      contracts: user.contracts.map(c => ({ employmentType: c.employmentType, weeklyMinutes: c.weeklyMinutes,
        effectiveAt: iso(c.effectiveAt), endsAt: iso(c.endsAt), version: c.version })),
      availability: availability ? { state: availability.state, version: availability.version, zone: availability.zone,
        effectiveFrom: availability.effectiveFrom ?? null, areas: availability.areas ?? [],
        workingWindows: (availability.workingWindows ?? []).map(w => ({ weekday: w.weekday,
          startLocalTime: w.startLocalTime, endLocalTime: w.endLocalTime })),
        dayOffDates: availability.dayOffDates ?? [] } : null,
      audit: audit.map(a => ({ id: id(a._id), action: a.action, at: iso(a.occurredAt), version: a.resultVersion })),
      ...(admin ? { contractVersion: latestContract?.version ?? 0 } : {}),
      permissions: { manageCapability: user.state === 'ACTIVE' && user.status === 'ACTIVE' && Boolean(user.contracts.length), manageContract: admin && user.state === 'ACTIVE' && Boolean(application),
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
