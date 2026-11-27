import { handoverPending } from './visit-handover-policy.service.js';
import { Types } from 'mongoose';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { digest } from '../../validators/pet-care.validator.js';
import {
  validateWorkflowTask,
  workflowKey,
  workflowFail,
  workflowExact,
  workflowVersion,
  workflowText
} from '../../validators/service-workflow.validator.js';
import { workflowHash, workflowTasks, workflowProjection, assertWorkflowGate } from './workflow-snapshot.service.js';

const oid = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) workflowFail('VALIDATION_FAILED');
  return new Types.ObjectId(value);
};
export function createVisitWorkflowService({ connection, clock = Date.now }) {
  const col = (name) => connection.db.collection(name),
    uow = createUnitOfWork(connection);
  async function context(actor, visitId, session, writing = false) {
    if (
      actor?.state !== 'ACTIVE' ||
      actor.synthetic ||
      !Array.isArray(actor.roles) ||
      (actor.expiresAt !== undefined && actor.expiresAt <= clock())
    )
      workflowFail('UNAUTHENTICATED', 'Active session required', 401);
    const userId = oid(actor.userId),
      visit = await col('visits').findOne({ _id: oid(visitId) }, { session, maxTimeMS: 2000 });
    const booking =
      visit &&
      (await col('bookings').findOne({ _id: visit.bookingId, visitIds: visit._id }, { session, maxTimeMS: 2000 }));
    const staff = actor.roles.some((role) => ['ADMIN', 'STAFF'].includes(role)),
      sitter = actor.roles.includes('PET_SITTER') && String(visit?.sitterId) === actor.userId;
    const customer = actor.roles.includes('CUSTOMER') && String(booking?.customerId) === actor.userId;
    if (!visit || !booking || (!staff && !sitter && !customer))
      workflowFail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
    if (sitter && handoverPending(visit))
      workflowFail('HANDOVER_REQUIRED', 'Confirm handover first', 409);
    if (writing) {
      if (
        !sitter ||
        !['ASSIGNED', 'IN_PROGRESS'].includes(visit.state) ||
        !['ASSIGNED', 'IN_PROGRESS', 'DISPATCH_PENDING'].includes(booking.state)
      )
        workflowFail('FORBIDDEN', 'Current assigned employee required', 403);
      if (handoverPending(visit))
        workflowFail('HANDOVER_REQUIRED', 'Confirm handover first', 409);
      const care = visit.snapshots?.care;
      if (
        !care ||
        visit.careAcknowledgement?.sitterId !== actor.userId ||
        visit.careAcknowledgement?.version !== digest(care)
      )
        workflowFail('CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED', 'Acknowledge current care instructions first', 409);
      const user = await col('users').updateOne(
        {
          _id: userId,
          state: 'ACTIVE',
          roles: 'PET_SITTER',
          synthetic: { $ne: true },
          ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {})
        },
        { $inc: { workflowGuardVersion: 1 } },
        { session }
      );
      const allowedStatuses = visit.state === 'IN_PROGRESS' && visit.checkInAt instanceof Date
        ? ['ACTIVE', 'SUSPENDED']
        : ['ACTIVE'];
      const status = await col('sitterstatuses').updateOne(
        { userId, status: { $in: allowedStatuses } },
        { $inc: { schedulingGuardVersion: 1 } },
        { session }
      );
      if (!user.matchedCount || !status.matchedCount)
        workflowFail('SITTER_NOT_ACTIVE', 'Employee eligibility changed', 403);
    }
    return { visit, booking, staff, sitter, customer: customer && !staff && !sitter };
  }
  async function transaction(actor, visitId, operation, body, key, work) {
    workflowKey(key);
    oid(visitId);
    workflowVersion(body.expectedVersion);
    const commandId = workflowHash(['VISIT_WORKFLOW', actor?.userId, visitId, operation, key]),
      fingerprint = workflowHash(body);
    for (let attempt = 0; ; attempt++) {
      try {
        return await uow.run(async (session) => {
          const ctx = await context(actor, visitId, session);
          if (operation === 'TASK' && !ctx.sitter) workflowFail('FORBIDDEN', 'Current assigned employee required', 403);
          if (operation === 'REVIEW' && !ctx.staff) workflowFail('FORBIDDEN', 'Staff required', 403);
          const previous = await col('employeeschedulecommands').findOne({ _id: commandId }, { session });
          if (previous) {
            if (previous.fingerprint !== fingerprint) workflowFail('IDEMPOTENCY_KEY_REUSED', 'Key already used', 409);
            return previous.result;
          }
          if (operation === 'TASK') await context(actor, visitId, session, true);
          if (ctx.visit.version !== body.expectedVersion) workflowFail('VERSION_CONFLICT', 'Reload care progress', 409);
          if (!ctx.visit.snapshots?.workflow)
            workflowFail('LEGACY_WORKFLOW', 'Legacy visit uses the existing checklist', 409);
          const result = await work(ctx, session);
          await col('employeeschedulecommands').insertOne(
            { _id: commandId, fingerprint, result, createdAt: new Date(clock()) },
            { session }
          );
          return result;
        });
      } catch (error) {
        if (error.code !== 11000 || attempt >= 2) throw error;
      }
    }
  }
  async function persist(ctx, actor, results, body, session, operation) {
    const { visit } = ctx,
      at = new Date(clock());
    const blocked = results.some((row) => ['BLOCKED', 'NEEDS_REVIEW'].includes(row.status));
    const projected = workflowProjection({ ...visit, workflowResults: results });
    const updated = await col('visits').updateOne(
      { _id: visit._id, version: body.expectedVersion, sitterId: visit.sitterId, state: visit.state },
      {
        $set: {
          workflowResults: results,
          workflowProgress: { completed: projected.completed, total: projected.total, blocked, updatedAt: at }
        },
        $inc: { version: 1 }
      },
      { session }
    );
    if (!updated.matchedCount) workflowFail('VERSION_CONFLICT', 'Assignment or progress changed', 409);
    await col('employeescheduleevents').insertOne(
      {
        type: operation,
        actorId: actor.userId,
        visitId: String(visit._id),
        at,
        detail: {
          taskKey: body.taskKey,
          version: body.expectedVersion + 1,
          status: results.find((row) => row.taskKey === body.taskKey)?.status,
          note: body.note ?? body.reason ?? '',
          mediaId: body.mediaId ?? null,
          result: results.find((row) => row.taskKey === body.taskKey)
        }
      },
      { session }
    );
    if (blocked) {
      const staff = await col('users')
        .find(
          { state: 'ACTIVE', roles: { $in: ['STAFF', 'ADMIN'] }, synthetic: { $ne: true } },
          { session, projection: { _id: 1, roles: 1 }, maxTimeMS: 2000 }
        )
        .limit(101)
        .toArray();
      if (staff.length > 100)
        workflowFail('WORKFLOW_ESCALATION_UNAVAILABLE', 'Staff notification scope exceeds bound', 503);
      for (const user of staff)
        await col('notifications').insertOne(
          {
            _id: workflowHash(['WORKFLOW_REVIEW', String(visit._id), body.expectedVersion + 1, String(user._id)]),
            eventId: `workflow:${visit._id}:${body.expectedVersion + 1}`,
            recipientId: String(user._id),
            role: user.roles.includes('ADMIN') ? 'ADMIN' : 'STAFF',
            eventType: 'CARE_REVIEW_REQUIRED',
            title: 'Nhiệm vụ chăm sóc cần xử lý',
            message: 'Pet Sitter đã báo bước bị chặn. Kiểm tra quy trình và sự cố trước khi tiếp tục.',
            deepLink: `/staff/dispatch?workflowId=${visit._id}`,
            createdAt: at,
            readAt: null,
            channel: 'IN_APP'
          },
          { session }
        );
    }
    return { visitId: String(visit._id), version: body.expectedVersion + 1, state: visit.state };
  }
  return {
    async read(actor, visitId) {
      return uow.run(async (session) => {
        const ctx = await context(actor, visitId, session);
        return {
          visitId,
          version: ctx.visit.version,
          state: ctx.visit.state,
          ...workflowProjection(ctx.visit, { customer: ctx.customer }),
          incidents: (
            await col('cases')
              .find(
                { bookingId: ctx.visit.bookingId, visitId, kind: 'INCIDENT' },
                { session, projection: { state: 1, description: 1 }, maxTimeMS: 2000 }
              )
              .limit(100)
              .toArray()
          ).map((row) => ({ id: String(row._id), state: row.state, description: row.description }))
        };
      });
    },
    async task(actor, visitId, input, key) {
      const body = validateWorkflowTask(input);
      return transaction(actor, visitId, 'TASK', body, key, async (ctx, session) => {
        const { visit } = ctx,
          snapshot = visit.snapshots.workflow;
        if (workflowHash(snapshot.definition) !== snapshot.hash)
          workflowFail('WORKFLOW_SNAPSHOT_INVALID', 'Snapshot needs review', 409);
        const tasks = workflowTasks(snapshot, visit.snapshots.pets, visit.location),
          index = tasks.findIndex((task) => task.taskKey === body.taskKey),
          task = tasks[index];
        if (!task) workflowFail('WORKFLOW_TASK_NOT_FOUND', 'Task does not apply to this pet/visit', 404);
        const at = new Date(clock()),
          step = task.step;
        if (
          at < new Date(+visit.startAt - 1800000) ||
          at > new Date(+visit.endAt + (visit.state === 'ASSIGNED' ? 0 : 7200000))
        )
          workflowFail('WORKFLOW_WINDOW_CLOSED', 'Outside authorized care window', 409);
        if (
          (visit.state === 'ASSIGNED' && step.phase !== 'CHECK_IN') ||
          (visit.state === 'IN_PROGRESS' && step.phase === 'CHECK_IN')
        )
          workflowFail('INVALID_STATE', 'Task phase is not writable', 409);
        const earlier = tasks.slice(0, index).filter((other) => other.step.phase === step.phase && other.step.required);
        if (
          earlier.some(
            (other) =>
              !['COMPLETED', ...(other.step.canSkip ? ['SKIPPED'] : [])].includes(
                visit.workflowResults?.find((row) => row.taskKey === other.taskKey)?.status
              )
          )
        )
          workflowFail('WORKFLOW_ORDER_REQUIRED', 'Complete earlier required tasks first', 409);
        if (
          (await col('cases').findOne(
            { bookingId: visit.bookingId, visitId, kind: 'INCIDENT', state: { $in: ['OPEN', 'UNDER_REVIEW'] } },
            { session, projection: { _id: 1 }, maxTimeMS: 2000 }
          )) &&
          !['BLOCKED', 'NEEDS_REVIEW'].includes(body.status)
        )
          workflowFail('INCIDENT_REVIEW_REQUIRED', 'Resolve open incident first', 409);
        if (step.phase === 'CHECK_OUT') assertWorkflowGate(visit, ['CHECK_IN', 'EXECUTION']);
        const previous = visit.workflowResults?.find((row) => row.taskKey === body.taskKey);
        if (['COMPLETED', 'SKIPPED', 'BLOCKED', 'NEEDS_REVIEW'].includes(previous?.status))
          workflowFail('WORKFLOW_TASK_LOCKED', 'Staff review is required to reopen this task', 409);
        if (
          body.status === 'SKIPPED' &&
          (!step.canSkip ||
            !body.skipReason ||
            step.safetyCritical ||
            step.phase !== 'EXECUTION' ||
            step.photoSlots.some((slot) => slot.minPhotos))
        )
          workflowFail('WORKFLOW_SKIP_FORBIDDEN');
        if (['BLOCKED', 'NEEDS_REVIEW'].includes(body.status) && !body.note) workflowFail('WORKFLOW_REASON_REQUIRED');
        const values = body.values;
        if (Object.keys(values).some((fieldId) => !step.fields.some((field) => field.fieldId === fieldId)))
          workflowFail('VALIDATION_FAILED');
        for (const field of step.fields) {
          const value = values[field.fieldId];
          if (body.status === 'COMPLETED' && field.required && (value === undefined || value === ''))
            workflowFail('WORKFLOW_FIELD_REQUIRED', field.label);
          if (value === undefined || value === '') continue;
          if (
            field.type === 'TEXT'
              ? typeof value !== 'string' || value.length > 500 || !value.trim()
              : !Number.isFinite(value) || value < field.min || value > field.max
          )
            workflowFail('VALIDATION_FAILED');
        }
        const evidence = [...(previous?.evidence ?? [])];
        if (body.mediaId) {
          const slot = step.photoSlots.find((slot) => slot.photoSlotId === body.photoSlotId);
          if (!slot || evidence.filter((row) => row.photoSlotId === slot.photoSlotId).length >= slot.maxPhotos)
            workflowFail('WORKFLOW_PHOTO_SLOT_FULL');
          if (
            (visit.workflowResults ?? []).some((row) => row.evidence?.some((photo) => photo.mediaId === body.mediaId))
          )
            workflowFail('EVIDENCE_ALREADY_USED', 'One image cannot fill multiple slots', 409);
          const image = await col('privateimages').findOne(
            { _id: body.mediaId, state: 'READY', ownerId: oid(actor.userId) },
            { session }
          );
          if (
            !image ||
            (image.uploadVisitId !== undefined && image.uploadVisitId !== visitId) ||
            !['image/jpeg', 'image/png'].includes(image.contentType) ||
            !/^[a-f0-9]{64}$/.test(image.contentDigest ?? '') ||
            !Number.isSafeInteger(image.byteLength) ||
            image.byteLength < 1 ||
            image.byteLength > 5242880
          )
            workflowFail('EVIDENCE_NOT_READY', 'Upload a verified private image first', 409);
          const kind = `WF:${task.taskKey}:${slot.photoSlotId}:${evidence.filter((row) => row.photoSlotId === slot.photoSlotId).length}`;
          const bound = await col('privateimages').updateOne(
            {
              _id: body.mediaId,
              state: 'READY',
              careVisitId: { $exists: false },
              transferEvidenceRequestId: { $exists: false }
            },
            { $set: { careVisitId: visitId, careKind: kind } },
            { session }
          );
          if (!bound.matchedCount) workflowFail('EVIDENCE_ALREADY_USED', 'Image already attached', 409);
          await col('caremediabindings').insertOne(
            {
              _id: body.mediaId,
              visitId,
              kind,
              ownerId: actor.userId,
              contentDigest: image.contentDigest,
              createdAt: at
            },
            { session }
          );
          evidence.push({
            mediaId: body.mediaId,
            photoSlotId: slot.photoSlotId,
            kind,
            uploadedBy: actor.userId,
            contentDigest: image.contentDigest,
            receivedAt: at
          });
        }
        if (body.status === 'COMPLETED') {
          if (step.inputType === 'NOTE' && !body.note) workflowFail('WORKFLOW_NOTE_REQUIRED');
          const missing = step.photoSlots.filter(
            (slot) => evidence.filter((row) => row.photoSlotId === slot.photoSlotId).length < slot.minPhotos
          );
          if (missing.length)
            workflowFail('WORKFLOW_INCOMPLETE', 'Required photo slots missing', 409, {
              missingTasks: [
                { taskKey: task.taskKey, reasons: missing.map((slot) => `PHOTO_SLOT:${slot.photoSlotId}`) }
              ]
            });
        }
        const result = {
          taskKey: task.taskKey,
          status: body.status,
          note: body.note,
          skipReason: body.skipReason,
          values,
          evidence,
          completedBy: actor.userId,
          updatedAt: at,
          ...(body.status === 'COMPLETED' ? { completedAt: at } : {})
        };
        const results = [...(visit.workflowResults ?? []).filter((row) => row.taskKey !== task.taskKey), result];
        return persist(ctx, actor, results, body, session, 'VisitWorkflowTaskSaved');
      });
    },
    async review(actor, visitId, body, key) {
      workflowExact(body, ['expectedVersion', 'taskKey', 'reason']);
      workflowVersion(body.expectedVersion);
      workflowText(body.reason, 1000, 3);
      if (typeof body.taskKey !== 'string' || body.taskKey.length > 70) workflowFail('VALIDATION_FAILED');
      return transaction(actor, visitId, 'REVIEW', body, key, async (ctx, session) => {
        if (
          !['ASSIGNED', 'IN_PROGRESS'].includes(ctx.visit.state) ||
          !['ASSIGNED', 'IN_PROGRESS', 'DISPATCH_PENDING'].includes(ctx.booking.state)
        )
          workflowFail('INVALID_STATE', 'Terminal visit cannot be reopened', 409);
        if (
          await col('cases').findOne(
            { bookingId: ctx.visit.bookingId, visitId, kind: 'INCIDENT', state: { $in: ['OPEN', 'UNDER_REVIEW'] } },
            { session, projection: { _id: 1 }, maxTimeMS: 2000 }
          )
        )
          workflowFail('INCIDENT_REVIEW_REQUIRED', 'Resolve the open incident before retrying tasks', 409);
        const current = ctx.visit.workflowResults?.find((row) => row.taskKey === body.taskKey);
        if (!current || !['BLOCKED', 'NEEDS_REVIEW'].includes(current.status))
          workflowFail('INVALID_STATE', 'Only blocked tasks can be returned for retry', 409);
        const user = await col('users').updateOne(
          {
            _id: oid(actor.userId),
            state: 'ACTIVE',
            roles: { $in: ['ADMIN', 'STAFF'] },
            ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {})
          },
          { $inc: { workflowGuardVersion: 1 } },
          { session }
        );
        if (!user.matchedCount) workflowFail('FORBIDDEN', 'Staff eligibility changed', 403);
        const results = ctx.visit.workflowResults.map((row) =>
          row.taskKey === body.taskKey
            ? {
                ...row,
                status: 'IN_PROGRESS',
                reviewReason: body.reason,
                reviewedBy: actor.userId,
                reviewedAt: new Date(clock())
              }
            : row
        );
        return persist(ctx, actor, results, body, session, 'VisitWorkflowRetryAuthorized');
      });
    },
    async verifyEvidence(visit, session) {
      if (
        await col('cases').findOne(
          {
            bookingId: visit.bookingId,
            visitId: String(visit._id),
            kind: 'INCIDENT',
            state: { $in: ['OPEN', 'UNDER_REVIEW'] }
          },
          { session, projection: { _id: 1 }, maxTimeMS: 2000 }
        )
      )
        workflowFail('INCIDENT_REVIEW_REQUIRED', 'Resolve the open incident first', 409);
      if (!visit.snapshots?.workflow) return;
      const photos = (visit.workflowResults ?? []).flatMap((row) => row.evidence ?? []);
      if (!photos.length) return;
      const images = await col('privateimages')
        .find(
          { _id: { $in: photos.map((photo) => photo.mediaId) }, state: 'READY', careVisitId: String(visit._id) },
          { session, maxTimeMS: 2000 }
        )
        .limit(241)
        .toArray();
      const bindings = await col('caremediabindings')
        .find(
          { _id: { $in: photos.map((photo) => photo.mediaId) }, visitId: String(visit._id) },
          { session, maxTimeMS: 2000 }
        )
        .limit(241)
        .toArray();
      if (
        photos.length > 240 ||
        new Set(photos.map((photo) => photo.mediaId)).size !== photos.length ||
        photos.some(
          (photo) =>
            !images.some(
              (image) =>
                image._id === photo.mediaId &&
                image.careKind === photo.kind &&
                image.contentDigest === photo.contentDigest &&
                String(image.ownerId) === photo.uploadedBy
            ) ||
            !bindings.some(
              (binding) =>
                binding._id === photo.mediaId &&
                binding.kind === photo.kind &&
                binding.contentDigest === photo.contentDigest &&
                binding.ownerId === photo.uploadedBy
            )
        )
      )
        workflowFail('EVIDENCE_NOT_READY', 'Workflow evidence needs review', 409);
    }
  };
}
