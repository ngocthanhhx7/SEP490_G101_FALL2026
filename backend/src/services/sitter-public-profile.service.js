import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { sitterPublicProfileModels } from '../models/sitter-public-profile.model.js';
import { userModel } from '../models/user.model.js';
import { sitterApplicationModels } from '../models/sitter-application.model.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { validatePublicProfileCommand, validateSelfProfileCommand } from '../validators/sitter-public-profile.validator.js';
import { hasRole } from '../utils/roles.js';
import { AppError } from '../utils/app-error.js';
import { createScopedCursor } from '../utils/scoped-cursor.js';

const fail = (status, code) => { throw new AppError(status, code, code); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const demoAreaLabels = new Map(DEMO_WORK_AREAS.map(area => [area.code, area.label]));
function project(row) {
  return row ? { userId: String(row.userId), bio: row.bio,
    ...(row.experience ? { experience: row.experience } : {}),
    areas: row.areas,
    state: row.state, version: row.version, updatedAt: row.updatedAt.toISOString() } : null;
}

export function createSitterPublicProfileService({ connection, cursorSecret, clock = Date.now }) {
  const cursorCodec = createScopedCursor({ secret: cursorSecret, namespace: 'public-profile-review-v1' });
  const models = sitterPublicProfileModels(connection);
  const { SitterPublicProfile: profiles, SitterPublicProfileCommand: commands, SitterPublicProfileAudit: audits } = models;
  const users = userModel(connection);
  const { SitterStatus: statuses, SitterApplication: applications } = sitterApplicationModels(connection);
  function authorize(actor, role) {
    if (!Types.ObjectId.isValid(actor?.userId) || actor?.state !== 'ACTIVE'
      || !Number.isFinite(actor.expiresAt) || actor.expiresAt <= clock()) fail(401, 'UNAUTHENTICATED');
    if (!hasRole(actor.roles, role)) fail(403, 'FORBIDDEN');
  }
  async function eligible(userId, session) {
    const user = await users.findOneAndUpdate({ _id: userId, roles: 'PET_SITTER', state: 'ACTIVE' },
      { $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
    const status = await statuses.findOneAndUpdate({ userId, status: 'ACTIVE' },
      { $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
    return Boolean(user && status);
  }
  async function storageReady() {
    for (const model of Object.values(models)) {
      let indexes;
      try { indexes = await model.collection.listIndexes().toArray(); }
      catch (error) { if (error.code !== 26) throw error; fail(503, 'PROFILE_STORAGE_NOT_READY'); }
      if (model.schema.indexes().filter(([, options]) => options.unique).some(([keys]) =>
        !indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(keys)))) fail(503, 'PROFILE_STORAGE_NOT_READY');
    }
  }
  async function mutate({ actor, userId, body, idempotencyKey }, operation) {
    authorize(actor, operation === 'SUBMIT' ? 'PET_SITTER' : 'STAFF');
    if (!Types.ObjectId.isValid(userId)) fail(422, 'VALIDATION_FAILED');
    if (operation === 'REVIEW' && userId === actor.userId) fail(403, 'FORBIDDEN');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey ?? '')) fail(422, 'VALIDATION_FAILED');
    const input = validatePublicProfileCommand(body, operation);
    const fingerprint = hash({ userId, input });
    await storageReady();
    for (let attempt = 0; ; attempt++) {
      try {
        return await connection.transaction(async session => {
          const currentActor = await users.findOneAndUpdate({ _id: actor.userId, state: 'ACTIVE' },
            { $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
          if (!currentActor || !hasRole(currentActor.roles, operation === 'SUBMIT' ? 'PET_SITTER' : 'STAFF')) fail(403, 'FORBIDDEN');
          if (!await eligible(userId, session)) fail(409, 'SITTER_NOT_ELIGIBLE');
          const identity = { actorId: actor.userId, operation, key: idempotencyKey };
          const previous = await commands.findOne(identity).session(session).lean();
          if (previous) {
            if (previous.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCY_KEY_REUSED');
            return previous.result;
          }
          const row = await profiles.findOne({ userId }).session(session).lean();
          if ((row?.version ?? 0) !== input.expectedVersion) fail(409, 'VERSION_CONFLICT');
          if (operation === 'REVIEW' && row?.state !== 'SUBMITTED') fail(409, 'INVALID_STATE');
          const occurredAt = new Date(clock());
          const version = input.expectedVersion + 1;
          const patch = operation === 'SUBMIT'
            ? { bio: input.bio, areas: input.areas, state: 'SUBMITTED', reviewedBy: null, reviewedAt: null, reason: null, version }
            : { state: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', reviewedBy: actor.userId,
              reviewedAt: occurredAt, reason: input.reason, version };
          let saved;
          if (!row) [saved] = await profiles.create([{ userId, ...patch }], { session });
          else saved = await profiles.findOneAndUpdate({ userId, version: row.version }, { $set: patch },
            { session, returnDocument: 'after', runValidators: true }).lean();
          if (!saved) fail(409, 'VERSION_CONFLICT');
          const result = project(saved);
          await audits.create([{ actorId: actor.userId, userId, action: operation === 'SUBMIT' ? 'PROFILE_SUBMITTED' : `PROFILE_${input.decision}`,
            version, contentHash: hash({ bio: saved.bio, areas: saved.areas, state: saved.state }), occurredAt }], { session });
          await commands.create([{ ...identity, fingerprint, result, occurredAt }], { session });
          return result;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) { if (error.code !== 11000 || attempt >= 2) throw error; }
    }
  }
  async function resolveAreaLabels(rawAreas, session = null) {
    const codes = [...new Set((rawAreas ?? []).filter(value => typeof value === 'string' && value.trim()))];
    if (!codes.length) return [];
    let catalogRows = [];
    if (connection.db) {
      const hasAreas = (await connection.db.listCollections({ name: 'serviceareas' }, { nameOnly: true }).toArray()).length > 0;
      if (hasAreas) {
        catalogRows = await connection.db.collection('serviceareas')
          .find({ _id: { $in: codes } }, { ...(session ? { session } : {}), projection: { label: 1 }, maxTimeMS: 2000 })
          .toArray();
      }
    }
    const dbLabels = new Map(catalogRows.map(row => [String(row._id), row.label]));
    return codes.map(code => dbLabels.get(code) ?? demoAreaLabels.get(code) ?? code);
  }

  async function readSelfMetrics(userId) {
    const oid = new Types.ObjectId(userId);
    const collections = connection.db
      ? new Set((await connection.db.listCollections({ name: { $in: ['reviews', 'visits', 'employeeavailabilities'] } }, { nameOnly: true }).toArray()).map(c => c.name))
      : new Set();
    const [availability, application, completedVisitsCount, ratingRows] = await Promise.all([
      collections.has('employeeavailabilities')
        ? connection.db.collection('employeeavailabilities').findOne({ _id: String(userId) }, { projection: { areas: 1 }, maxTimeMS: 2000 })
        : Promise.resolve(null),
      applications.findOne({ provisionedUserId: oid, state: 'APPROVED' }).select('workAreas').lean(),
      collections.has('visits')
        ? connection.db.collection('visits').countDocuments({ sitterId: { $in: [oid, String(userId)] }, state: 'COMPLETED' }, { maxTimeMS: 2000 })
        : Promise.resolve(0),
      collections.has('reviews')
        ? connection.db.collection('reviews').aggregate([
          { $match: { sitterId: { $in: [oid, String(userId)] }, direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: { $in: [1, 2, 3, 4, 5] } } },
          { $group: { _id: null, count: { $sum: 1 }, rating: { $avg: '$rating' } } }
        ], { maxTimeMS: 2000 }).toArray()
        : Promise.resolve([])
    ]);
    return {
      rawAreas: availability?.areas?.length ? availability.areas : (application?.workAreas ?? []),
      completedVisitsCount,
      reviewCount: ratingRows[0]?.count ?? 0,
      rating: ratingRows[0]?.rating ?? null
    };
  }

  async function buildSelfProfileView(user, row) {
    const metrics = await readSelfMetrics(String(user._id));
    const areaSource = metrics.rawAreas.length ? metrics.rawAreas : (row?.areas ?? []);
    const areas = await resolveAreaLabels(areaSource);
    return {
      id: String(user._id),
      displayName: user.displayName,
      startedAt: user.createdAt?.toISOString() ?? null,
      areas,
      bio: row?.bio ?? '',
      experience: row?.experience ?? '',
      completedVisitsCount: metrics.completedVisitsCount,
      rating: metrics.reviewCount > 0 ? metrics.rating : null,
      reviewCount: metrics.reviewCount,
      state: row?.state ?? null,
      version: row?.version ?? 0,
      updatedAt: row?.updatedAt?.toISOString() ?? null
    };
  }

  async function saveSelfProfile({ actor, body, idempotencyKey }) {
    authorize(actor, 'PET_SITTER');
    const userId = actor.userId;
    if (!Types.ObjectId.isValid(userId)) fail(422, 'VALIDATION_FAILED');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey ?? '')) fail(422, 'VALIDATION_FAILED');
    const input = validateSelfProfileCommand(body);
    const fingerprint = hash({ userId, operation: 'SELF_UPDATE', input });
    await storageReady();
    for (let attempt = 0; ; attempt++) {
      try {
        return await connection.transaction(async session => {
          const actorFilter = { _id: userId, state: 'ACTIVE', roles: 'PET_SITTER' };
          const currentActor = await users.findOne(actorFilter).select('displayName createdAt').session(session).lean();
          if (!currentActor) fail(403, 'FORBIDDEN');
          const identity = { actorId: userId, operation: 'SELF_UPDATE', key: idempotencyKey };
          const previous = await commands.findOne(identity).session(session).lean();
          if (previous) {
            if (!await statuses.exists({ userId, status: 'ACTIVE' }).session(session)) fail(409, 'SITTER_NOT_ELIGIBLE');
            if (previous.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCY_KEY_REUSED');
            return previous.result;
          }
          if (!await eligible(userId, session)) fail(409, 'SITTER_NOT_ELIGIBLE');
          const row = await profiles.findOne({ userId }).session(session).lean();
          if ((row?.version ?? 0) !== input.expectedVersion) fail(409, 'VERSION_CONFLICT');
          let areas = row?.areas ?? [];
          if (!areas.length) {
            const hasAvailability = connection.db
              ? (await connection.db.listCollections({ name: 'employeeavailabilities' }, { nameOnly: true }).toArray()).length > 0
              : false;
            const availability = hasAvailability
              ? await connection.db.collection('employeeavailabilities').findOne({ _id: String(userId) }, { session, projection: { areas: 1 } })
              : null;
            const app = await applications.findOne({ provisionedUserId: new Types.ObjectId(userId), state: 'APPROVED' })
              .select('workAreas').session(session).lean();
            areas = availability?.areas?.length ? availability.areas : (app?.workAreas ?? []);
          }
          const occurredAt = new Date(clock());
          const version = input.expectedVersion + 1;
          const patch = {
            bio: input.bio,
            experience: input.experience,
            areas,
            state: 'APPROVED',
            reviewedBy: null,
            reviewedAt: occurredAt,
            reason: null,
            version
          };
          let saved;
          if (!row) [saved] = await profiles.create([{ userId, ...patch }], { session });
          else saved = await profiles.findOneAndUpdate({ userId, version: row.version }, { $set: patch },
            { session, returnDocument: 'after', runValidators: true }).lean();
          if (!saved) fail(409, 'VERSION_CONFLICT');
          const result = { profile: await buildSelfProfileView(currentActor, saved), messageCode: 'MSG51' };
          await audits.create([{
            actorId: userId,
            userId,
            action: 'PROFILE_SELF_UPDATED',
            version,
            contentHash: hash({ bio: saved.bio, experience: saved.experience, areas: saved.areas, state: saved.state }),
            occurredAt
          }], { session });
          await commands.create([{ ...identity, fingerprint, result, occurredAt }], { session });
          return result;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) {
        if (error.code !== 11000 || attempt >= 2) throw error;
      }
    }
  }

  return Object.freeze({
    async readOwn({ actor }) {
      authorize(actor, 'PET_SITTER');
      const row = await profiles.findOne({ userId: actor.userId }).select('+reason').lean();
      return { profile: row ? { ...project(row), reason: row.reason ?? null } : null };
    },
    async readSelfProfile({ actor }) {
      authorize(actor, 'PET_SITTER');
      const user = await users.findOne({ _id: actor.userId, roles: 'PET_SITTER', state: 'ACTIVE' })
        .select('displayName createdAt').lean();
      if (!user) fail(404, 'RESOURCE_NOT_FOUND');
      const row = await profiles.findOne({ userId: actor.userId }).lean();
      return { profile: await buildSelfProfileView(user, row) };
    },
    saveSelfProfile,
    async listPending({ actor, cursor, userId, state = 'SUBMITTED' }) {
      authorize(actor, 'STAFF');
      if (userId !== undefined && (typeof userId !== 'string' || !/^[a-f0-9]{24}$/i.test(userId))) fail(422, 'VALIDATION_FAILED');
      if(!['SUBMITTED','APPROVED','REJECTED'].includes(state))fail(422,'VALIDATION_FAILED');
      const context = { actorId: actor.userId, state, ...(userId ? { userId } : {}) };
      const match = { state };
      if (userId) match.userId = new Types.ObjectId(userId);
      if (cursor !== undefined) {
        const last = cursorCodec.decode(cursor, context);
        if (!Types.ObjectId.isValid(last.userId) || !Number.isFinite(Date.parse(last.updatedAt))) fail(422, 'VALIDATION_FAILED');
        match.$or = [{ updatedAt: { $gt: new Date(last.updatedAt) } },
          { updatedAt: new Date(last.updatedAt), userId: { $gt: new Types.ObjectId(last.userId) } }];
      }
      const rows = await profiles.find(match).sort({ updatedAt: 1, userId: 1 }).limit(51).lean();
      const names=await users.find({_id:{$in:rows.map(r=>r.userId)}}).select('displayName').lean();
      const page = rows.slice(0, 50).map(row=>({...project(row),displayName:names.find(n=>String(n._id)===String(row.userId))?.displayName??null}));
      const counts=await profiles.aggregate([...(userId?[{$match:{userId:new Types.ObjectId(userId)}}]:[]),{$group:{_id:'$state',count:{$sum:1}}}]).option({maxTimeMS:5000});
      const summary={total:0,SUBMITTED:0,APPROVED:0,REJECTED:0};for(const r of counts){summary.total+=r.count;summary[r._id]=r.count;}
      return { summary, asOf:new Date(clock()), items: page, nextCursor: rows.length > 50 ? cursorCodec.encode({ userId: page.at(-1).userId,
        updatedAt: page.at(-1).updatedAt }, context) : null };
    },
    submit: input => mutate({ ...input, userId: input.actor?.userId }, 'SUBMIT'),
    review: input => mutate(input, 'REVIEW')
  });
}
