import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../utils/app-error.js';
import { hasRole } from '../utils/roles.js';
import {
  evaluateCandidate,
  normalizeDispatchRequest
} from './dispatch.service.js';

export const BOARD_STATES = Object.freeze({
  PROPOSAL: [
    'PENDING_CUSTOMER_CONFIRMATION',
    'CUSTOMER_CONFIRMED',
    'EXPIRED',
    'REJECTED',
    'STALE'
  ],
  BOOKING: [
    'DRAFT',
    'PENDING_CUSTOMER_CONFIRMATION',
    'PENDING_PAYMENT',
    'DISPATCH_PENDING',
    'CONFIRMED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
  ],
  OFFER: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'],
  VISIT: [
    'SCHEDULED',
    'ASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
    'STAFF_CLOSED',
    'CANCELLED'
  ],
  CASE: ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']
});
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
const invalid = () =>
  fail(422, 'VALIDATION_FAILED', 'Visit board request is invalid');
const unavailable = () =>
  fail(503, 'VISIT_BOARD_UNAVAILABLE', 'Visit board is unavailable');
function identifier(value) {
  if (typeof value !== 'string' || !ID.test(value)) invalid();
  return value;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function instant(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid();
  const offset = value.endsWith('Z')
    ? 0
    : (value.at(-6) === '+' ? 1 : -1) *
      (Number(value.slice(-5, -3)) * 60 + Number(value.slice(-2))) *
      60000;
  if (
    new Date(Date.parse(value) + offset).toISOString().slice(0, 19) !==
    value.slice(0, 19)
  )
    invalid();
  return new Date(value).toISOString();
}
function active(actor, clock) {
  if (
    !actor ||
    actor.state !== 'ACTIVE' ||
    actor.synthetic === true ||
    typeof actor.userId !== 'string' ||
    !ID.test(actor.userId) ||
    !Number.isFinite(actor.expiresAt) ||
    actor.expiresAt <= clock()
  ) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
}
function staff(actor, clock) {
  active(actor, clock);
  if (!hasRole(actor.roles, 'STAFF'))
    fail(403, 'FORBIDDEN', 'Operational access required');
}
function text(value, max = 1000) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
  )
    invalid();
  return value.trim();
}
function slot(value) {
  if (!value || typeof value !== 'object') invalid();
  const startAt = instant(value.startAt),
    endAt = instant(value.endAt);
  if (Date.parse(endAt) <= Date.parse(startAt)) invalid();
  return { startAt, endAt };
}
function scoped(visit, scope) {
  return (
    visit &&
    (scope.customerId
      ? visit.customerId === scope.customerId
      : scope.areaCodes.includes(visit.areaCode))
  );
}
function remedyView(record) {
  return {
    id: identifier(record.id),
    visitId: identifier(record.visitId),
    version: version(record.version),
    state: record.state,
    reason: record.reason,
    message: record.message,
    createdAt: instant(record.createdAt),
    alternatives: record.alternatives.map((item) => ({
      id: item.id,
      ...slot(item)
    })),
    response: record.response
      ? {
          choice: record.response.choice,
          alternativeId: record.response.alternativeId ?? null,
          message: record.response.message,
          respondedAt: instant(record.response.respondedAt)
        }
      : null,
    // Neither a pending proposal nor a Customer response completes a booking/visit.
    visitResolved: false
  };
}

/** Repository must implement transactional eligibility/day guards and CAS; no in-process mutex is production storage. */
export function createVisitBoardService({
  repository,
  scopePort,
  clock = Date.now
} = {}) {
  if (
    typeof repository?.list !== 'function' ||
    typeof repository?.detail !== 'function' ||
    typeof repository?.runGuarded !== 'function' ||
    typeof scopePort?.resolve !== 'function'
  )
    throw new TypeError('Visit board repository and scope ports are required');
  async function safely(work) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AppError) throw error;
      unavailable();
    }
  }
  async function resolveScope(actor) {
    staff(actor, clock);
    const grant = await safely(() => scopePort.resolve(actor));
    if (
      !Array.isArray(grant?.areaCodes) ||
      grant.areaCodes.length > 100 ||
      grant.areaCodes.some(
        (area) => typeof area !== 'string' || !ID.test(area)
      ) ||
      !Number.isSafeInteger(grant.version) ||
      grant.version < 0
    )
      unavailable();
    // Admin inherits Staff, but still requires an explicit operational scope from the server.
    if (!grant.areaCodes.length)
      fail(403, 'FORBIDDEN', 'No operational area is granted');
    return {
      areaCodes: [...new Set(grant.areaCodes)],
      scopeVersion: version(grant.version)
    };
  }
  async function list({ actor, query = {} } = {}) {
    const scope = await resolveScope(actor);
    const allowed = [
      'fromAt',
      'toAt',
      'areaCode',
      'kind',
      'state',
      'needsAction',
      'limit',
      'cursor'
    ];
    if (!query || typeof query !== 'object' || Array.isArray(query)) invalid();
    if (Object.keys(query).some((key) => !allowed.includes(key))) invalid();
    const fromAt = instant(query.fromAt),
      toAt = instant(query.toAt);
    const duration = Date.parse(toAt) - Date.parse(fromAt);
    if (duration <= 0 || duration > 31 * 86400000) invalid();
    const kind = query.kind || 'ALL';
    if (kind !== 'ALL' && !Object.hasOwn(BOARD_STATES, kind)) invalid();
    if (query.state && !BOARD_STATES[kind]?.includes(query.state)) invalid();
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) invalid();
    if (
      query.needsAction !== undefined &&
      ![true, false, 'true', 'false'].includes(query.needsAction)
    )
      invalid();
    if (
      query.cursor !== undefined &&
      (typeof query.cursor !== 'string' ||
        !/^[A-Za-z0-9_-]{1,512}$/.test(query.cursor))
    )
      invalid();
    if (query.areaCode && !scope.areaCodes.includes(identifier(query.areaCode)))
      fail(403, 'FORBIDDEN', 'Area is outside the operational scope');
    const filter = {
      fromAt,
      toAt,
      kind,
      state: query.state || null,
      areaCodes: query.areaCode ? [query.areaCode] : scope.areaCodes,
      needsAction:
        query.needsAction === undefined
          ? null
          : [true, 'true'].includes(query.needsAction)
    };
    const result = await safely(() =>
      repository.list({
        actor,
        actorId: actor.userId,
        scope,
        filter,
        cursor: query.cursor ?? null,
        limit,
        fetchLimit: limit + 1,
        projection: [
          'id',
          'kind',
          'state',
          'areaCode',
          'startAt',
          'visitId',
          'bookingId',
          'version',
          'serviceName',
          'petCount',
          'needsAction',
          'remedyState'
        ]
      })
    );
    active(actor, clock);
    if (
      !Array.isArray(result?.items) ||
      result.items.length > limit ||
      (result.nextCursor !== null &&
        (typeof result.nextCursor !== 'string' ||
          !/^[A-Za-z0-9_-]{1,512}$/.test(result.nextCursor)))
    )
      unavailable();
    const items = result.items.map((row) => {
      if (
        !scoped(row, scope) ||
        !filter.areaCodes.includes(row.areaCode) ||
        !BOARD_STATES[row.kind]?.includes(row.state) ||
        (kind !== 'ALL' && row.kind !== kind) ||
        (filter.state && row.state !== filter.state) ||
        !Number.isFinite(Date.parse(row.startAt)) ||
        Date.parse(row.startAt) < Date.parse(fromAt) ||
        Date.parse(row.startAt) >= Date.parse(toAt) ||
        (filter.needsAction !== null && row.needsAction !== filter.needsAction)
      )
        unavailable();
      return {
        id: identifier(row.id),
        kind: row.kind,
        state: row.state,
        areaCode: row.areaCode,
        startAt: instant(row.startAt),
        visitId: row.visitId ? identifier(row.visitId) : null,
        bookingId: row.bookingId ? identifier(row.bookingId) : null,
        version: version(row.version),
        serviceName: text(row.serviceName, 120),
        petCount:
          Number.isSafeInteger(row.petCount) && row.petCount >= 0
            ? row.petCount
            : null,
        needsAction: row.needsAction === true,
        remedyState: [
          'PENDING_CUSTOMER_CONFIRMATION',
          'CUSTOMER_CONFIRMED',
          'REJECTED'
        ].includes(row.remedyState)
          ? row.remedyState
          : null
      };
    });
    return {
      items,
      nextCursor: result.nextCursor,
      timeZone: 'Asia/Ho_Chi_Minh'
    };
  }
  async function detail({ actor, visitId } = {}) {
    const scope = await resolveScope(actor);
    identifier(visitId);
    const record = await safely(() =>
      repository.detail({ actor, visitId, scope, remedyLimit: 1 })
    );
    active(actor, clock);
    if (!scoped(record, scope))
      fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    if (
      record.remedy &&
      (record.remedy.visitId !== visitId ||
        record.remedy.customerId !== record.customerId)
    )
      unavailable();
    return {
      id: visitId,
      version: version(record.version),
      state: record.state,
      startAt: instant(record.startAt),
      endAt: instant(record.endAt),
      areaCode: record.areaCode,
      serviceName: text(record.serviceName, 120),
      noSitterReason: [
        'NO_ELIGIBLE_SITTER',
        'OFFER_DECLINED',
        'OFFER_EXPIRED'
      ].includes(record.noSitterReason)
        ? record.noSitterReason
        : null,
      remedy: record.remedy ? remedyView(record.remedy) : null
    };
  }
  async function command(
    {
      actor,
      visitId,
      expectedVersion,
      idempotencyKey,
      scope,
      sitterId,
      payload
    },
    work
  ) {
    identifier(visitId);
    version(expectedVersion);
    if (
      typeof idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)
    )
      invalid();
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ visitId, expectedVersion, payload }))
      .digest('hex');
    return safely(() =>
      repository.runGuarded(
        { actor, visitId, scope, sitterId: sitterId ?? null },
        async (tx) => {
          active(actor, clock);
          // Revalidate actor authEpoch/scope in the same transaction, not only before it.
          await tx.authorize({ actor, scope });
          const visit = await tx.getVisit(visitId);
          if (!scoped(visit, scope))
            fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
          const operation = await tx.findOperation({
            actorId: actor.userId,
            idempotencyKey
          });
          active(actor, clock);
          if (operation) {
            if (operation.fingerprint !== fingerprint)
              fail(
                409,
                'IDEMPOTENCY_CONFLICT',
                'Operation key was already used'
              );
            return operation.result;
          }
          if (visit.version !== expectedVersion)
            fail(
              409,
              'VERSION_CONFLICT',
              'Visit changed; reload before continuing'
            );
          const result = await work(tx, visit);
          await tx.recordOperation({
            actorId: actor.userId,
            idempotencyKey,
            fingerprint,
            result
          });
          return result;
        }
      )
    );
  }
  async function proposeRemedy({
    actor,
    visitId,
    expectedVersion,
    idempotencyKey,
    message,
    alternatives
  } = {}) {
    const scope = await resolveScope(actor);
    const content = text(message);
    if (
      !Array.isArray(alternatives) ||
      !alternatives.length ||
      alternatives.length > 5
    )
      invalid();
    const slots = alternatives.map(slot);
    if (
      new Set(slots.map((item) => item.startAt + item.endAt)).size !==
      slots.length
    )
      invalid();
    return command(
      {
        actor,
        visitId,
        expectedVersion,
        idempotencyKey,
        scope,
        payload: { action: 'PROPOSE', content, slots }
      },
      async (tx, visit) => {
        if (
          visit.state !== 'SCHEDULED' ||
          visit.sitterId ||
          !['NO_ELIGIBLE_SITTER', 'OFFER_DECLINED', 'OFFER_EXPIRED'].includes(
            visit.noSitterReason
          )
        ) {
          fail(
            409,
            'REMEDY_NOT_ELIGIBLE',
            'Visit does not require a no-sitter proposal'
          );
        }
        if (slots.some((item) => Date.parse(item.startAt) <= clock()))
          fail(409, 'SLOT_EXPIRED', 'Proposed slot must be in the future');
        // Policy/availability must be server ports; no invented slot hold or reschedule money rule.
        await tx.validateAlternativeSlots({ visit, slots });
        if (slots.some((item) => Date.parse(item.startAt) <= clock()))
          fail(409, 'SLOT_EXPIRED', 'Proposed slot must be in the future');
        const saved = await tx.createRemedy({
          id: randomUUID(),
          visitId,
          customerId: visit.customerId,
          visitVersion: visit.version,
          version: 0,
          reason: visit.noSitterReason,
          message: content,
          alternatives: slots.map((item, index) => ({
            id: String(index + 1),
            ...item
          })),
          state: 'PENDING_CUSTOMER_CONFIRMATION',
          createdAt: new Date(clock()).toISOString(),
          response: null
        });
        await tx.appendAuditAndOutbox({
          type: 'NoSitterRemedyProposed',
          actorId: actor.userId,
          visitId,
          remedyId: saved.id,
          at: saved.createdAt,
          recipientId: visit.customerId
        });
        return remedyView(saved);
      }
    );
  }
  async function respondRemedy({
    actor,
    visitId,
    remedyId,
    expectedVersion,
    remedyVersion,
    idempotencyKey,
    choice,
    alternativeId,
    confirmed,
    message = 'Customer response'
  } = {}) {
    active(actor, clock);
    if (!hasRole(actor.roles, 'CUSTOMER'))
      fail(403, 'FORBIDDEN', 'Only the Customer can respond');
    identifier(remedyId);
    version(remedyVersion);
    if (
      !['CONFIRM_SLOT', 'DECLINE'].includes(choice) ||
      (choice === 'CONFIRM_SLOT' &&
        (confirmed !== true ||
          !['1', '2', '3', '4', '5'].includes(alternativeId)))
    )
      invalid();
    const content = text(message);
    const scope = { customerId: actor.userId };
    return command(
      {
        actor,
        visitId,
        expectedVersion,
        idempotencyKey,
        scope,
        payload: {
          action: 'RESPOND',
          remedyId,
          remedyVersion,
          choice,
          alternativeId: alternativeId ?? null,
          content
        }
      },
      async (tx, visit) => {
        const remedy = await tx.getRemedy(remedyId);
        if (
          !remedy ||
          remedy.visitId !== visitId ||
          remedy.customerId !== actor.userId
        )
          fail(404, 'RESOURCE_NOT_FOUND', 'Proposal not found');
        if (
          remedy.version !== remedyVersion ||
          remedy.visitVersion !== visit.version ||
          remedy.state !== 'PENDING_CUSTOMER_CONFIRMATION' ||
          visit.state !== 'SCHEDULED' ||
          visit.sitterId
        )
          fail(
            409,
            'REMEDY_STALE',
            'Proposal changed; reload before responding'
          );
        const selected = remedy.alternatives.find(
          (item) => item.id === alternativeId
        );
        if (choice === 'CONFIRM_SLOT') {
          if (!selected || Date.parse(selected.startAt) <= clock())
            fail(409, 'SLOT_EXPIRED', 'Selected slot is unavailable');
          await tx.validateAlternativeSlots({ visit, slots: [slot(selected)] });
          if (Date.parse(selected.startAt) <= clock())
            fail(409, 'SLOT_EXPIRED', 'Selected slot is unavailable');
          // Atomic schedule/proposal update after explicit confirmation; dispatch remains P21/P42.
          await tx.confirmAlternativeSlot({
            visit,
            remedy,
            selectedSlot: slot(selected),
            confirmedAt: new Date(clock()).toISOString()
          });
        }
        const respondedAt = new Date(clock()).toISOString();
        const saved = await tx.updateRemedy({
          ...remedy,
          version: remedy.version + 1,
          state: choice === 'CONFIRM_SLOT' ? 'CUSTOMER_CONFIRMED' : 'REJECTED',
          response: {
            choice,
            alternativeId: choice === 'CONFIRM_SLOT' ? alternativeId : null,
            message: content,
            respondedAt
          }
        });
        await tx.appendAuditAndOutbox({
          type: 'NoSitterRemedyResponded',
          actorId: actor.userId,
          visitId,
          remedyId,
          at: respondedAt
        });
        return remedyView(saved);
      }
    );
  }
  async function manualAssign({
    actor,
    visitId,
    sitterId,
    expectedVersion,
    idempotencyKey,
    reason
  } = {}) {
    const scope = await resolveScope(actor);
    identifier(sitterId);
    const content = text(reason);
    return command(
      {
        actor,
        visitId,
        sitterId,
        expectedVersion,
        idempotencyKey,
        scope,
        payload: { action: 'ASSIGN', sitterId, content }
      },
      async (tx, visit) => {
        if (
          visit.state !== 'SCHEDULED' ||
          visit.sitterId ||
          Date.parse(visit.startAt) <= clock()
        )
          fail(409, 'VISIT_NOT_ASSIGNABLE', 'Visit is no longer assignable');
        const pendingRemedy = await tx.getPendingRemedy(visitId);
        if (pendingRemedy)
          fail(
            409,
            'CUSTOMER_CONFIRMATION_REQUIRED',
            'Customer must choose the pending remedy first'
          );
        if (
          !Number.isSafeInteger(visit.originalVisitCount) ||
          visit.originalVisitCount < 1 ||
          (visit.originalVisitCount > 1 && visit.paymentStatus !== 'VERIFIED')
        )
          fail(409, 'PAYMENT_REQUIRED', 'Verified payment is required');
        if (visit.directed !== false && visit.directed !== true)
          fail(
            409,
            'DIRECTED_GATE_UNAVAILABLE',
            'Directed proposal gate is unavailable'
          );
        if (
          visit.directed &&
          (visit.confirmedProposal?.state !== 'CUSTOMER_CONFIRMED' ||
            visit.confirmedProposal.sitterId !== sitterId ||
            visit.confirmedProposal.visitVersion !== visit.version ||
            visit.confirmedProposal.startAt !== visit.startAt ||
            visit.confirmedProposal.endAt !== visit.endAt)
        ) {
          fail(
            409,
            'CUSTOMER_CONFIRMATION_REQUIRED',
            'Customer must confirm the directed schedule first'
          );
        }
        const candidate = await tx.getCandidate(sitterId, visit);
        const decision = evaluateCandidate(
          candidate,
          normalizeDispatchRequest({
            ...visit,
            visitId,
            requestedSitterId: sitterId
          })
        );
        if (!decision.eligible)
          fail(
            409,
            'SITTER_NOT_ELIGIBLE',
            'Sitter is not eligible for this visit'
          );
        if (Date.parse(visit.startAt) <= clock())
          fail(409, 'VISIT_NOT_ASSIGNABLE', 'Visit is no longer assignable');
        const saved = await tx.assignVisit({
          visit,
          sitterId,
          expectedVersion,
          reason: content
        });
        if (
          saved?.state !== 'ASSIGNED' ||
          saved?.sitterId !== sitterId ||
          saved?.version !== expectedVersion + 1
        )
          unavailable();
        await tx.appendAuditAndOutbox({
          type: 'VisitAssigned',
          actorId: actor.userId,
          visitId,
          sitterId,
          at: new Date(clock()).toISOString()
        });
        return {
          id: visitId,
          version: saved.version,
          state: saved.state,
          sitterId
        };
      }
    );
  }
  return Object.freeze({
    list,
    detail,
    proposeRemedy,
    respondRemedy,
    manualAssign
  });
}
