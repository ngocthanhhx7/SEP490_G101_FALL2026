import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { sitterPublicProfileModels } from '../models/sitter-public-profile.model.js';
import { userModel } from '../models/user.model.js';
import { sitterApplicationModels } from '../models/sitter-application.model.js';
import { validatePublicProfileCommand } from '../validators/sitter-public-profile.validator.js';
import { hasRole } from '../utils/roles.js';
import { AppError } from '../utils/app-error.js';
import { createScopedCursor } from '../utils/scoped-cursor.js';

const fail = (status, code) => { throw new AppError(status, code, code); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function project(row) {
  return row ? { userId: String(row.userId), bio: row.bio, areas: row.areas,
    state: row.state, version: row.version, updatedAt: row.updatedAt.toISOString() } : null;
}

export function createSitterPublicProfileService({ connection, cursorSecret, clock = Date.now }) {
  const cursorCodec = createScopedCursor({ secret: cursorSecret, namespace: 'public-profile-review-v1' });
  const models = sitterPublicProfileModels(connection);
  const { SitterPublicProfile: profiles, SitterPublicProfileCommand: commands, SitterPublicProfileAudit: audits } = models;
  const users = userModel(connection);
  const { SitterStatus: statuses } = sitterApplicationModels(connection);
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
  return Object.freeze({
    async readOwn({ actor }) {
      authorize(actor, 'PET_SITTER');
      const row = await profiles.findOne({ userId: actor.userId }).select('+reason').lean();
      return { profile: row ? { ...project(row), reason: row.reason ?? null } : null };
    },
    async listPending({ actor, cursor }) {
      authorize(actor, 'STAFF');
      const context = { actorId: actor.userId, state: 'SUBMITTED' };
      const match = { state: 'SUBMITTED' };
      if (cursor !== undefined) {
        const last = cursorCodec.decode(cursor, context);
        if (!Types.ObjectId.isValid(last.userId) || !Number.isFinite(Date.parse(last.updatedAt))) fail(422, 'VALIDATION_FAILED');
        match.$or = [{ updatedAt: { $gt: new Date(last.updatedAt) } },
          { updatedAt: new Date(last.updatedAt), userId: { $gt: new Types.ObjectId(last.userId) } }];
      }
      const rows = await profiles.find(match).sort({ updatedAt: 1, userId: 1 }).limit(51).lean();
      const page = rows.slice(0, 50).map(project);
      return { items: page, nextCursor: rows.length > 50 ? cursorCodec.encode({ userId: page.at(-1).userId,
        updatedAt: page.at(-1).updatedAt }, context) : null };
    },
    submit: input => mutate({ ...input, userId: input.actor?.userId }, 'SUBMIT'),
    review: input => mutate(input, 'REVIEW')
  });
}
