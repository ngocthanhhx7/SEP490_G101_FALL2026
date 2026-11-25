import { handoverPending } from '../care/visit-handover-policy.service.js';
import { Types } from 'mongoose';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { createBookingFinancialHolds } from '../settlements/booking-financial-holds.service.js';
import { createEmployeeBookingHolds } from '../payroll/employee-booking-hold.service.js';
import { workflowHash } from '../care/workflow-snapshot.service.js';
import { AppError } from '../../utils/app-error.js';

const fail = (code, status = 409) => {
  throw new AppError(status, code, code);
};
const oid = (value) =>
  typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)
    ? new Types.ObjectId(value)
    : fail('VALIDATION_FAILED', 422);
const view = (row) =>
  row && {
    ...row,
    id: String(row._id),
    visitId: String(row.visitId),
    customerId: String(row.customerId),
    sitterId: row.sitterId ? String(row.sitterId) : null,
    financialHold: row.financialHold ? { state: 'PENDING_REVIEW', reference: String(row._id) } : null
  };
export function createMongoIncidentRepository({
  connection,
  finance,
  clock = Date.now,
  compensationModel = 'EMPLOYEE'
}) {
  if (!['EMPLOYEE', 'LEGACY_PARTNER'].includes(compensationModel)) throw new TypeError('Invalid compensation model');
  const col = (name) => connection.db.collection(name),
    uow = createUnitOfWork(connection),
    holds =
      compensationModel === 'EMPLOYEE'
        ? createEmployeeBookingHolds({ connection, finance })
        : createBookingFinancialHolds({ connection, finance });
  async function loadVisit(actor, visitId, session) {
    const row = await col('visits').findOne({ _id: oid(visitId) }, { session, maxTimeMS: 2000 });
    const booking =
      row && (await col('bookings').findOne({ _id: row.bookingId, visitIds: row._id }, { session, maxTimeMS: 2000 }));
    const staff = actor.roles.some((role) => ['STAFF', 'ADMIN'].includes(role));
    if (
      !row ||
      !booking ||
      (!staff && String(booking.customerId) !== actor.userId && String(row.sitterId) !== actor.userId)
    )
      fail('RESOURCE_NOT_FOUND', 404);
    if (actor.roles.includes('PET_SITTER') && handoverPending(row)) fail('HANDOVER_REQUIRED');
    return {
      ...row,
      id: visitId,
      customerId: String(booking.customerId),
      sitterId: row.sitterId ? String(row.sitterId) : null,
      booking
    };
  }
  async function guard(actor, session) {
    const user = await col('users').updateOne(
      { _id: oid(actor.userId), state: 'ACTIVE', roles: actor.roles[0], synthetic: { $ne: true } },
      { $inc: { incidentGuardVersion: 1 } },
      { session }
    );
    if (!user.matchedCount) fail('FORBIDDEN', 403);
    if (actor.roles[0] === 'PET_SITTER') {
      const status = await col('sitterstatuses').updateOne(
        { userId: oid(actor.userId), status: 'ACTIVE' },
        { $inc: { schedulingGuardVersion: 1 } },
        { session }
      );
      if (!status.matchedCount) fail('SITTER_NOT_ACTIVE', 403);
    }
  }
  async function run({ actor }, work) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await uow.run(async (session) => {
          const tx = {
            getVisit: (visitId) => loadVisit(actor, visitId, session),
            getCase: async (caseId) =>
              view(await col('cases').findOne({ _id: oid(caseId), kind: 'INCIDENT' }, { session, maxTimeMS: 2000 })),
            getIdempotencyResult: (identity) =>
              col('employeeschedulecommands').findOne({ _id: workflowHash(['INCIDENT', identity]) }, { session }),
            saveIdempotencyResult: ({ identity, payloadHash, result }) =>
              col('employeeschedulecommands').insertOne(
                {
                  _id: workflowHash(['INCIDENT', identity]),
                  fingerprint: payloadHash,
                  result,
                  createdAt: new Date(clock())
                },
                { session }
              ),
            async createIncident(record) {
              await guard(actor, session);
              const visit = await loadVisit(actor, record.visitId, session);
              if (
                ['CANCELLED', 'SUPERSEDED'].includes(visit.state) ||
                ['CANCELLED', 'EXPIRED'].includes(visit.booking.state)
              )
                fail('VISIT_NOT_ELIGIBLE');
              if (record.petId && !visit.petIds?.some((pet) => String(pet) === record.petId))
                fail('VALIDATION_FAILED', 422);
              const existing = await col('cases').countDocuments(
                { bookingId: visit.bookingId, visitId: record.visitId, kind: 'INCIDENT' },
                { session, maxTimeMS: 2000 }
              );
              if (existing >= 100) fail('INCIDENT_REVIEW_BUDGET_EXCEEDED');
              for (const photo of record.evidenceRefs) {
                if (!/^[a-f0-9]{64}$/.test(photo.mediaId)) fail('EVIDENCE_NOT_READY');
                const onVisit =
                  (visit.evidenceRefs ?? []).some((ref) => ref.mediaId === photo.mediaId) ||
                  (visit.workflowResults ?? []).some((result) =>
                    result.evidence?.some((ref) => ref.mediaId === photo.mediaId)
                  );
                if (!onVisit) {
                  const uploaded = await col('privateimages').findOne(
                    { _id: photo.mediaId, ownerId: oid(actor.userId), state: 'READY' },
                    { session, projection: { _id: 1, contentDigest: 1, byteLength: 1 } }
                  );
                  if (
                    !uploaded ||
                    !/^[a-f0-9]{64}$/.test(uploaded.contentDigest ?? '') ||
                    !Number.isSafeInteger(uploaded.byteLength) ||
                    uploaded.byteLength < 1 ||
                    uploaded.byteLength > 5 * 1024 * 1024
                  )
                    fail('EVIDENCE_NOT_READY');
                }
              }
              const _id = new Types.ObjectId(),
                row = {
                  ...record,
                  _id,
                  id: String(_id),
                  bookingId: visit.bookingId,
                  // Existing case holds remain pending until an explicit Admin no-impact closure.
                  financialHold: true,
                  workflowIncidentVersion: 1
                };
              delete row.actorId;
              delete row.idempotencyKey;
              await holds.change({
                booking: visit.booking,
                actorId: actor.userId,
                reference: String(_id),
                lockType: 'CASE',
                session
              });
              const guarded = await col('visits').updateOne(
                { _id: visit._id, version: visit.version, state: visit.state },
                { $inc: { version: 1 }, $set: { incidentOpen: true } },
                { session }
              );
              if (!guarded.matchedCount) fail('VERSION_CONFLICT');
              await col('cases').insertOne(row, { session });
              return view(row);
            },
            async resolveIncident({ caseId, incident, resolution, expectedVersion }) {
              await guard(actor, session);
              const visit = await loadVisit(actor, incident.visitId, session);
              if (resolution.financialDecision && resolution.financialDecision.decision !== 'NO_FINANCIAL_ACTION')
                fail('FINANCIAL_REVIEW_REQUIRED');
              if (
                resolution.state === 'CLOSED' &&
                (actor.roles[0] !== 'ADMIN' || resolution.financialDecision?.decision !== 'NO_FINANCIAL_ACTION')
              )
                fail('FINANCIAL_REVIEW_REQUIRED');
              await holds.change({
                booking: visit.booking,
                actorId: actor.userId,
                reference: caseId,
                release: resolution.state === 'CLOSED',
                lockType: 'CASE',
                session
              });
              const current = await col('cases').findOne(
                { _id: oid(caseId), kind: 'INCIDENT', version: expectedVersion },
                { session }
              );
              if (!current || (current.timeline ?? []).length >= 100) fail('VERSION_CONFLICT');
              const row = await col('cases').findOneAndUpdate(
                { _id: current._id, version: expectedVersion },
                {
                  $set: {
                    state: resolution.state,
                    version: resolution.version,
                    resolution,
                    financialHold: resolution.state !== 'CLOSED',
                    privateStaffNotes: resolution.staffNotes,
                    updatedAt: resolution.recordedAt,
                    ...(resolution.resolvedAt ? { resolvedAt: resolution.resolvedAt } : {}),
                    ...(resolution.closedAt ? { closedAt: resolution.closedAt } : {})
                  },
                  $push: {
                    timeline: {
                      type: 'INCIDENT_RESOLVED',
                      note: resolution.summary,
                      occurredAt: resolution.recordedAt,
                      actorRole: actor.roles[0]
                    }
                  }
                },
                { session, returnDocument: 'after' }
              );
              const open = await col('cases').findOne(
                {
                  bookingId: visit.bookingId,
                  visitId: incident.visitId,
                  kind: 'INCIDENT',
                  state: { $in: ['OPEN', 'UNDER_REVIEW'] }
                },
                { session, projection: { _id: 1 }, maxTimeMS: 2000 }
              );
              const guarded = await col('visits').updateOne(
                { _id: visit._id, version: visit.version },
                { $inc: { version: 1 }, $set: { incidentOpen: !!open } },
                { session }
              );
              if (!guarded.matchedCount) fail('VERSION_CONFLICT');
              return view(row);
            },
            async appendAuditAndOutbox(event) {
              await col('employeescheduleevents').insertOne(
                {
                  type: event.type,
                  actorId: actor.userId,
                  visitId: event.visitId,
                  at: new Date(clock()),
                  detail: event
                },
                { session }
              );
              const users = await col('users')
                .find(
                  { state: 'ACTIVE', roles: { $in: ['STAFF', 'ADMIN'] }, synthetic: { $ne: true } },
                  { session, projection: { _id: 1, roles: 1 }, maxTimeMS: 2000 }
                )
                .limit(101)
                .toArray();
              if (users.length > 100) fail('INCIDENT_UNAVAILABLE', 503);
              for (const user of users)
                await col('notifications').updateOne(
                  { _id: workflowHash(['INCIDENT_EVENT', event, String(user._id)]) },
                  {
                    $setOnInsert: {
                      recipientId: String(user._id),
                      role: user.roles[0],
                      eventType: event.type,
                      title: 'Cập nhật sự cố chăm sóc',
                      message: 'Có sự cố cần đối chiếu theo quy trình vận hành.',
                      deepLink: `/cases/${event.caseId}`,
                      createdAt: new Date(clock()),
                      readAt: null
                    }
                  },
                  { upsert: true, session }
                );
              if (event.type === 'IncidentReported' && event.visitId && /^[a-f0-9]{24}$/i.test(event.visitId)) {
                const visitDoc = await col('visits').findOne(
                  { _id: oid(event.visitId) },
                  { session, projection: { bookingId: 1, sitterId: 1 } }
                );
                const bookingDoc =
                  visitDoc &&
                  (await col('bookings').findOne(
                    { _id: visitDoc.bookingId },
                    { session, projection: { customerId: 1 } }
                  ));
                const otherRecipients = [];
                if (bookingDoc?.customerId && String(bookingDoc.customerId) !== actor.userId) {
                  otherRecipients.push({
                    id: String(bookingDoc.customerId),
                    role: 'CUSTOMER',
                    title: 'Có báo cáo sự cố trong buổi chăm sóc',
                    message: 'Người chăm sóc vừa gửi báo cáo sự cố cho buổi chăm sóc của thú cưng. Vui lòng xem chi tiết.'
                  });
                }
                if (visitDoc?.sitterId && String(visitDoc.sitterId) !== actor.userId) {
                  otherRecipients.push({
                    id: String(visitDoc.sitterId),
                    role: 'PET_SITTER',
                    title: 'Có báo cáo sự cố trong buổi chăm sóc',
                    message: 'Khách hàng vừa gửi báo cáo sự cố cho buổi chăm sóc của bạn. Vui lòng xem chi tiết.'
                  });
                }
                for (const recipient of otherRecipients) {
                  await col('notifications').updateOne(
                    { _id: workflowHash(['INCIDENT_EVENT', event, recipient.id, recipient.role]) },
                    {
                      $setOnInsert: {
                        recipientId: recipient.id,
                        role: recipient.role,
                        eventType: event.type,
                        title: recipient.title,
                        message: recipient.message,
                        deepLink: `/cases/${event.caseId}`,
                        createdAt: new Date(clock()),
                        readAt: null
                      }
                    },
                    { upsert: true, session }
                  );
                }
              }
            }
          };
          return work(tx);
        });
      } catch (error) {
        if (error.code !== 11000 || attempt >= 2) throw error;
      }
    }
  }
  return {
    runIncidentTransaction: run,
    async listIncidents({ actor, filter, limit, cursor }) {
      const staff = actor.roles.some((role) => ['ADMIN', 'STAFF'].includes(role));
      const query = {
        kind: 'INCIDENT',
        ...(cursor ? { _id: { $lt: oid(cursor) } } : {}),

        ...Object.fromEntries(
          ['state', 'severity', 'urgency'].filter((key) => filter[key]).map((key) => [key, filter[key]])
        )
      };
      if (filter.visitId) {
        const visit = await loadVisit(actor, filter.visitId);
        query.bookingId = visit.bookingId;
        query.visitId = filter.visitId;
      }
      const scope = staff
        ? []
        : [
            {
              $lookup: {
                from: 'visits',
                let: { id: { $convert: { input: '$visitId', to: 'objectId', onError: null, onNull: null } } },
                pipeline: [
                  { $match: { $expr: { $eq: ['$_id', '$$id'] } } },
                  { $project: { sitterId: 1, bookingId: 1 } }
                ],
                as: '__visit'
              }
            },
            {
              $lookup: {
                from: 'bookings',
                localField: 'bookingId',
                foreignField: '_id',
                pipeline: [{ $project: { customerId: 1, visitIds: 1 } }],
                as: '__booking'
              }
            },
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: [{ $first: '$__visit._id' }, { $ifNull: [{ $first: '$__booking.visitIds' }, []] }] },
                    {
                      $eq: [
                        actor.roles[0] === 'CUSTOMER'
                          ? { $first: '$__booking.customerId' }
                          : { $first: '$__visit.sitterId' },
                        oid(actor.userId)
                      ]
                    }
                  ]
                }
              }
            },
            { $unset: ['__visit', '__booking'] }
          ];
      const rows = await col('cases')
        .aggregate([{ $match: query }, { $sort: { _id: -1 } }, ...scope, { $limit: limit + 1 }], { maxTimeMS: 3000 })
        .toArray();
      return {
        items: rows.slice(0, limit).map(view),
        nextCursor: rows.length > limit ? String(rows[limit - 1]._id) : null
      };
    }
  };
}
