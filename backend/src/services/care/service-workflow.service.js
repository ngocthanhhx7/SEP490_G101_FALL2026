import { Types } from 'mongoose';
import { createUnitOfWork } from '../unit-of-work.service.js';
import {
  validateWorkflow,
  workflowExact,
  workflowVersion,
  workflowKey,
  workflowFail
} from '../../validators/service-workflow.validator.js';
import { workflowHash } from './workflow-snapshot.service.js';

const oid = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) workflowFail('VALIDATION_FAILED');
  return new Types.ObjectId(value);
};
export function createServiceWorkflowService({ connection, clock = Date.now }) {
  const col = (name) => connection.db.collection(name),
    uow = createUnitOfWork(connection);
  async function storage() {
    const names = await connection.db
      .listCollections(
        { name: { $in: ['serviceworkflowversions', 'employeeschedulecommands', 'employeescheduleevents'] } },
        { nameOnly: true }
      )
      .toArray();
    if (names.length !== 3)
      workflowFail('WORKFLOW_STORAGE_NOT_READY', 'Provision reviewed workflow storage first', 503);
    const indexes = await col('serviceworkflowversions').listIndexes().toArray();
    if (
      !indexes.some(
        (index) => index.unique && JSON.stringify(index.key) === JSON.stringify({ serviceId: 1, revision: -1 })
      )
    )
      workflowFail('WORKFLOW_STORAGE_NOT_READY', 'Workflow history uniqueness missing', 503);
  }
  function admin(actor) {
    if (
      actor?.state !== 'ACTIVE' ||
      actor.synthetic ||
      !actor.roles?.includes('ADMIN') ||
      (actor.expiresAt !== undefined && actor.expiresAt <= clock())
    )
      workflowFail('FORBIDDEN', 'Admin required', 403);
    oid(actor.userId);
  }
  return {
    async read(actor, serviceId, before) {
      admin(actor);
      const _id = oid(serviceId);
      if (before !== undefined && (!/^[1-9][0-9]{0,12}$/.test(String(before)) || !Number.isSafeInteger(Number(before))))
        workflowFail('VALIDATION_FAILED');
      const service = await col('services').findOne(
        { _id },
        { projection: { workflowDraft: 1, workflowPublished: 1, workflowRevision: 1 }, maxTimeMS: 2000 }
      );
      if (!service) workflowFail('RESOURCE_NOT_FOUND', 'Service unavailable', 404);
      const history = await col('serviceworkflowversions')
        .find({ serviceId: _id, ...(before ? { revision: { $lt: Number(before) } } : {}) }, { maxTimeMS: 2000 })
        .sort({ revision: -1 })
        .limit(21)
        .toArray();
      return {
        serviceId,
        revision: service.workflowRevision ?? 0,
        draft: service.workflowDraft ?? null,
        published: service.workflowPublished ?? null,
        history: history
          .slice(0, 20)
          .map(({ revision, action, definition, hash, recordedAt }) => ({
            revision,
            action,
            definition,
            hash,
            recordedAt
          })),
        nextCursor: history.length > 20 ? String(history[19].revision) : null
      };
    },
    async mutate(actor, serviceId, action, body, key) {
      admin(actor);
      const _id = oid(serviceId);
      workflowKey(key);
      if (!['DRAFT', 'PUBLISH', 'RETIRE', 'VALIDATE'].includes(action)) workflowFail('VALIDATION_FAILED');
      workflowExact(body, action === 'DRAFT' ? ['expectedVersion', 'definition'] : ['expectedVersion']);
      workflowVersion(body.expectedVersion);
      const definition = action === 'DRAFT' ? validateWorkflow(body.definition) : null;
      if (action !== 'VALIDATE') await storage();
      const commandId = workflowHash(['SERVICE_WORKFLOW', actor.userId, serviceId, action, key]),
        fingerprint = workflowHash(body);
      for (let attempt = 0; ; attempt++) {
        try {
          return await uow.run(async (session) => {
            const service = await col('services').findOne({ _id }, { session, maxTimeMS: 2000 });
            if (!service) workflowFail('RESOURCE_NOT_FOUND', 'Service unavailable', 404);
            const previous = await col('employeeschedulecommands').findOne({ _id: commandId }, { session });
            if (previous) {
              if (previous.fingerprint !== fingerprint) workflowFail('IDEMPOTENCY_KEY_REUSED', 'Key already used', 409);
              return previous.result;
            }
            const revision = service.workflowRevision ?? 0;
            if (revision !== body.expectedVersion) workflowFail('VERSION_CONFLICT', 'Reload service workflow', 409);
            const version = ['PUBLISH', 'VALIDATE'].includes(action)
              ? await col('serviceversions')
                  .find({ serviceId: _id, effectiveAt: { $lte: new Date(clock()) } }, { session, maxTimeMS: 2000 })
                  .sort({ effectiveAt: -1 })
                  .limit(1)
                  .next()
              : null;
            const published = ['PUBLISH', 'VALIDATE'].includes(action)
              ? validateWorkflow(service.workflowDraft, {
                  publishing: true,
                  ...(version?.species?.length ? { supportedSpecies: version.species } : {}),
                  ...(service.presentation?.locations?.length
                    ? { supportedLocations: service.presentation.locations }
                    : {})
                })
              : null;
            if (action === 'VALIDATE') return { valid: true, revision };
            if (action === 'RETIRE' && !service.workflowPublished)
              workflowFail('INVALID_STATE', 'No published workflow', 409);
            const at = new Date(clock()),
              next = revision + 1;
            const fields = { workflowRevision: next };
            if (action === 'DRAFT') fields.workflowDraft = definition;
            else if (action === 'PUBLISH')
              fields.workflowPublished = {
                revision: next,
                hash: workflowHash(published),
                definition: published,
                publishedAt: at
              };
            else fields.workflowPublished = null;
            const user = await col('users').updateOne(
              {
                _id: oid(actor.userId),
                state: 'ACTIVE',
                roles: 'ADMIN',
                synthetic: { $ne: true },
                ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {})
              },
              { $inc: { workflowGuardVersion: 1 } },
              { session }
            );
            if (!user.matchedCount) workflowFail('FORBIDDEN', 'Admin eligibility changed', 403);
            const saved = await col('services').updateOne(
              {
                _id,
                ...(revision
                  ? { workflowRevision: revision }
                  : { $or: [{ workflowRevision: 0 }, { workflowRevision: { $exists: false } }] })
              },
              { $set: fields },
              { session }
            );
            if (!saved.matchedCount) workflowFail('VERSION_CONFLICT', 'Reload workflow', 409);
            if (action !== 'DRAFT')
              await col('serviceworkflowversions').insertOne(
                {
                  serviceId: _id,
                  revision: next,
                  action: action === 'PUBLISH' ? 'PUBLISHED' : 'RETIRED',
                  definition: published ?? service.workflowPublished.definition,
                  hash: workflowHash(published ?? service.workflowPublished.definition),
                  actorId: oid(actor.userId),
                  recordedAt: at
                },
                { session }
              );
            const result = { serviceId, revision: next, action };
            await col('employeeschedulecommands').insertOne(
              { _id: commandId, fingerprint, result, createdAt: at },
              { session }
            );
            await col('employeescheduleevents').insertOne(
              {
                type: `ServiceWorkflow${action}`,
                actorId: actor.userId,
                at,
                detail: {
                  serviceId,
                  revision: next,
                  hash: workflowHash(definition ?? published ?? service.workflowPublished.definition)
                }
              },
              { session }
            );
            return result;
          });
        } catch (error) {
          if (error.code !== 11000 || attempt >= 2) throw error;
        }
      }
    }
  };
}
