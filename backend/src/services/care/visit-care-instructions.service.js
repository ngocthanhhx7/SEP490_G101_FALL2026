import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { hasRole } from '../../utils/roles.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';
import {
  parseCareObjectId,
  parseVisitCareInstructionsInput
} from '../../validators/visit-care-instructions.validator.js';

export const CARE_INSTRUCTIONS_CUTOFF_MS = 2 * 60 * 60 * 1000;
export const LOCKED_DEFAULT_TASK_IDS = Object.freeze(['service-scope', 'pet-condition']);

const DEFAULT_TASK_LABELS = Object.freeze({
  'service-scope': 'Thực hiện nội dung dịch vụ',
  'pet-condition': 'Ghi nhận tình trạng thú cưng sau chăm sóc'
});
const STARTED_OR_DONE_STATES = new Set(['IN_PROGRESS', 'COMPLETED', 'STAFF_CLOSED']);
const oid = value => new Types.ObjectId(value);

function fail(status, code, message, details) {
  throw new AppError(status, code, message, details);
}

function knownProfileText(entry) {
  return entry?.status === 'KNOWN' && typeof entry.value === 'string' ? entry.value : '';
}

function profileField(value) {
  return value ? { status: 'KNOWN', value } : { status: 'NOT_PROVIDED' };
}

export function extractVisitCareInstructions(visit, bookingConsentAt = null) {
  const saved = visit.careInstructions;
  const snapshotCare = visit.snapshots?.care;
  const snapshotPets = Array.isArray(snapshotCare?.pets) ? snapshotCare.pets : [];
  const savedPets = new Map((saved?.pets ?? []).map(row => [String(row.petId), row]));

  const pets = snapshotPets.map(pet => {
    const petId = String(pet.id);
    const existing = savedPets.get(petId);
    return {
      petId,
      name: pet.name ?? 'Thú cưng',
      species: pet.species ?? null,
      feeding: existing ? existing.feeding ?? '' : knownProfileText(pet.careProfile?.feeding),
      medicine: existing ? existing.medicine ?? '' : knownProfileText(pet.careProfile?.medication),
      behavior: existing ? existing.behavior ?? '' : knownProfileText(pet.careProfile?.handling)
    };
  });

  const baseItems = Array.isArray(visit.snapshots?.checklistItems) ? visit.snapshots.checklistItems : [];
  const baseRequiredIds = new Set(Array.isArray(visit.snapshots?.checklistItemIds) ? visit.snapshots.checklistItemIds : LOCKED_DEFAULT_TASK_IDS);
  const rawTasks = Array.isArray(saved?.tasks) && saved.tasks.length > 0
    ? saved.tasks
    : (baseItems.length > 0
      ? baseItems.map(item => ({
        itemId: item.itemId,
        label: item.label ?? DEFAULT_TASK_LABELS[item.itemId] ?? item.itemId,
        required: item.required !== undefined ? item.required === true : baseRequiredIds.has(item.itemId),
        locked: LOCKED_DEFAULT_TASK_IDS.includes(item.itemId)
      }))
      : LOCKED_DEFAULT_TASK_IDS.map(itemId => ({
        itemId,
        label: itemId === 'service-scope'
          ? (visit.snapshots?.serviceScope || DEFAULT_TASK_LABELS[itemId])
          : DEFAULT_TASK_LABELS[itemId],
        required: true,
        locked: true
      })));

  const tasks = rawTasks.map(task => ({
    itemId: task.itemId,
    label: task.label,
    required: LOCKED_DEFAULT_TASK_IDS.includes(task.itemId) ? true : task.required === true,
    locked: LOCKED_DEFAULT_TASK_IDS.includes(task.itemId)
  }));

  const version = Number.isInteger(visit.currentInstructionVersion)
    ? visit.currentInstructionVersion
    : (Number.isInteger(saved?.version) ? saved.version : 1);
  const confirmedAt = saved?.confirmedAt ?? snapshotCare?.capturedAt ?? bookingConsentAt ?? null;
  const acknowledgedAt = saved?.acknowledgedAt
    ?? (visit.careAcknowledgement?.acknowledgedAt ?? null);
  const requiresAcknowledgement = Number.isInteger(visit.currentInstructionVersion)
    && (visit.acknowledgedInstructionVersion ?? 0) < visit.currentInstructionVersion;

  return {
    version,
    confirmedAt,
    acknowledgedAt: requiresAcknowledgement ? null : acknowledgedAt,
    acknowledgedInstructionVersion: Number.isInteger(visit.acknowledgedInstructionVersion)
      ? visit.acknowledgedInstructionVersion
      : null,
    updatedAfterAssigned: saved?.updatedAfterAssigned === true,
    requiresAcknowledgement,
    pets,
    tasks,
    homeAccessNote: saved?.homeAccessNote !== undefined
      ? saved.homeAccessNote
      : (snapshotCare?.privateAccessNotes ?? '')
  };
}

function buildNormalizedTasks(visit, inputTasks) {
  const existingItems = new Map(
    (visit.snapshots?.checklistItems ?? []).map(item => [item.itemId, item.label])
  );
  const lockedTasks = LOCKED_DEFAULT_TASK_IDS.map(itemId => {
    const supplied = inputTasks.find(row => row.itemId === itemId);
    const fallback = itemId === 'service-scope'
      ? (visit.snapshots?.serviceScope || DEFAULT_TASK_LABELS[itemId])
      : DEFAULT_TASK_LABELS[itemId];
    return {
      itemId,
      label: supplied?.label || existingItems.get(itemId) || fallback,
      required: true,
      locked: true
    };
  });

  const usedIds = new Set(LOCKED_DEFAULT_TASK_IDS);
  let customCounter = 1;
  const customTasks = [];
  for (const row of inputTasks) {
    if (row.itemId && LOCKED_DEFAULT_TASK_IDS.includes(row.itemId)) continue;
    let itemId = row.itemId && !usedIds.has(row.itemId) ? row.itemId : null;
    while (!itemId || usedIds.has(itemId)) {
      itemId = `custom-task-${customCounter++}`;
    }
    usedIds.add(itemId);
    customTasks.push({
      itemId,
      label: row.label,
      required: row.required === true,
      locked: false
    });
  }
  return [...lockedTasks, ...customTasks];
}

function isVisitLocked(visit, nowMs) {
  if (visit.state === 'CANCELLED') return true;
  if (STARTED_OR_DONE_STATES.has(visit.state)) return true;
  if (visit.checkInAt instanceof Date) return true;
  const startMs = visit.startAt instanceof Date ? visit.startAt.getTime() : Date.parse(visit.startAt);
  return Number.isFinite(startMs) && startMs <= nowMs;
}

function isWithinCutoff(visit, nowMs) {
  const startMs = visit.startAt instanceof Date ? visit.startAt.getTime() : Date.parse(visit.startAt);
  return Number.isFinite(startMs) && startMs - nowMs < CARE_INSTRUCTIONS_CUTOFF_MS;
}

// Published workflow tasks keep their immutable definition and their own results.
export function additionalCareChecklist(visit) {
  return (visit.careInstructions?.tasks ?? []).filter(item => !LOCKED_DEFAULT_TASK_IDS.includes(item.itemId));
}

export function createVisitCareInstructionsService({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name);
  const uow = createUnitOfWork(connection);
  const notifications = createDomainNotifications({ connection, clock });

  function requireCustomer(actor) {
    if (actor?.state !== 'ACTIVE' || actor.synthetic === true) {
      fail(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    parseCareObjectId(actor.userId, 'userId');
    if (!hasRole(actor.roles, 'CUSTOMER')) {
      fail(403, 'FORBIDDEN', 'Only customers can edit visit care instructions');
    }
  }

  async function loadBookingVisits(actor, bookingId, session) {
    const booking = await col('bookings').findOne(
      { _id: oid(bookingId), customerId: oid(actor.userId) },
      { session, maxTimeMS: 2000 }
    );
    if (!booking) fail(404, 'RESOURCE_NOT_FOUND', 'Booking not found');
    const visits = await col('visits').find(
      {
        bookingId: booking._id,
        state: { $ne: 'SUPERSEDED' },
        ...(booking.visitIds?.length ? { _id: { $in: booking.visitIds } } : {})
      },
      { session, maxTimeMS: 2000 }
    ).sort({ startAt: 1, _id: 1 }).limit(60).toArray();
    return { booking, visits };
  }

  function toBookingVisitView(visit, booking, nowMs, sitterNames) {
    const cancelled = visit.state === 'CANCELLED';
    const locked = !cancelled && isVisitLocked(visit, nowMs);
    const withinTwoHours = !cancelled && !locked && isWithinCutoff(visit, nowMs);
    const care = extractVisitCareInstructions(visit, booking.checkoutSnapshot?.consentAt ?? null);
    return {
      visitId: String(visit._id),
      version: visit.version ?? 0,
      state: visit.state,
      startAt: visit.startAt ?? null,
      endAt: visit.endAt ?? null,
      serviceName: visit.snapshots?.serviceName ?? null,
      sitterAssigned: Boolean(visit.sitterId),
      sitterName: visit.sitterId ? (sitterNames.get(String(visit.sitterId)) ?? null) : null,
      cancelled,
      locked,
      withinTwoHours,
      instructionVersion: care.version,
      confirmedAt: care.confirmedAt,
      acknowledgedAt: care.acknowledgedAt,
      requiresAcknowledgement: care.requiresAcknowledgement,
      pets: care.pets,
      tasks: care.tasks,
      homeAccessNote: care.homeAccessNote
    };
  }

  async function loadSitterNames(visits, session) {
    const ids = [...new Set(visits.map(v => v.sitterId).filter(Boolean).map(String))]
      .filter(value => /^[a-f0-9]{24}$/i.test(value));
    if (!ids.length) return new Map();
    const users = await col('users').find(
      { _id: { $in: ids.map(oid) } },
      { session, projection: { displayName: 1 }, maxTimeMS: 2000 }
    ).toArray();
    return new Map(users.map(user => [String(user._id), user.displayName ?? null]));
  }

  return Object.freeze({
    async getBookingCareInstructions(actor, rawBookingId) {
      requireCustomer(actor);
      const bookingId = parseCareObjectId(rawBookingId, 'bookingId');
      return uow.run(async session => {
        const { booking, visits } = await loadBookingVisits(actor, bookingId, session);
        const sitterNames = await loadSitterNames(visits, session);
        const nowMs = clock();
        return {
          bookingId: String(booking._id),
          bookingCode: booking.bookingCode ?? booking.code ?? null,
          bookingState: booking.state,
          serverNow: new Date(nowMs).toISOString(),
          visits: visits.map(visit => toBookingVisitView(visit, booking, nowMs, sitterNames))
        };
      });
    },

    async confirmVisitCareInstructions(actor, rawBookingId, rawVisitId, body) {
      requireCustomer(actor);
      const bookingId = parseCareObjectId(rawBookingId, 'bookingId');
      const visitId = parseCareObjectId(rawVisitId, 'visitId');
      const input = parseVisitCareInstructionsInput(body);

      return uow.run(async session => {
        const { booking, visits } = await loadBookingVisits(actor, bookingId, session);
        if (['CANCELLED', 'CLOSED', 'PAYMENT_EXPIRED'].includes(booking.state)) {
          fail(409, 'INVALID_STATE', 'Booking no longer accepts care instruction changes');
        }
        const selected = visits.find(visit => String(visit._id) === visitId);
        if (!selected) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
        const nowMs = clock();
        const at = new Date(nowMs);
        if (selected.state === 'CANCELLED') {
          fail(409, 'VISIT_CANCELLED', 'Cannot edit care instructions for a cancelled visit');
        }
        if (isVisitLocked(selected, nowMs)) {
          fail(409, 'VISIT_LOCKED', 'Cannot edit care instructions after the visit has started');
        }
        if (input.expectedVersion !== undefined && (selected.version ?? 0) !== input.expectedVersion) {
          fail(409, 'VERSION_CONFLICT', 'Visit changed before your update could be saved');
        }

        const withinTwoHours = isWithinCutoff(selected, nowMs);
        const laterEligible = visits.filter(visit =>
          String(visit._id) !== visitId
          && visit.startAt > selected.startAt
          && !isVisitLocked(visit, nowMs)
          && !isWithinCutoff(visit, nowMs)
        );

        if (withinTwoHours && !laterEligible.length) {
          fail(409, 'CARE_INSTRUCTIONS_CUTOFF', 'Còn dưới 2 giờ trước buổi này và không còn buổi sau để áp dụng thay đổi.');
        }
        if (input.applyFromNextVisit !== withinTwoHours) {
          fail(409, 'CARE_INSTRUCTIONS_SCOPE_CHANGED', 'The visit cutoff changed; confirm the current scope');
        }
        const laterTargets = input.applyToLater ? laterEligible : [];
        if (laterTargets.length !== input.targetVersions.size || laterTargets.some(target =>
          input.targetVersions.get(String(target._id)) !== (target.version ?? 0))) {
          fail(409, 'VERSION_CONFLICT', 'The later visits changed; reload before saving');
        }
        const targets = withinTwoHours ? laterTargets : [selected, ...laterTargets];

        const inputPetMap = new Map(input.pets.map(pet => [pet.petId, pet]));
        const updatedVisitIds = [];

        for (const target of targets) {
          const snapshotCare = target.snapshots?.care;
          if (!snapshotCare || !Array.isArray(snapshotCare.pets)) {
            fail(409, 'CARE_SNAPSHOT_UNAVAILABLE', 'Visit care snapshot is unavailable');
          }
          const prevVersion = Number.isInteger(target.currentInstructionVersion)
            ? target.currentInstructionVersion
            : (Number.isInteger(target.careInstructions?.version) ? target.careInstructions.version : 1);
          const nextVersion = prevVersion + 1;

          const updatedSnapshotPets = snapshotCare.pets.map(pet => {
            const petId = String(pet.id);
            const supplied = inputPetMap.get(petId);
            if (!supplied) return pet;
            return {
              ...pet,
              careProfile: {
                ...(pet.careProfile ?? {}),
                feeding: profileField(supplied.feeding),
                medication: profileField(supplied.medicine),
                handling: profileField(supplied.behavior)
              }
            };
          });

          const savedPets = updatedSnapshotPets.map(pet => ({
            petId: String(pet.id),
            name: pet.name ?? 'Thú cưng',
            feeding: knownProfileText(pet.careProfile?.feeding),
            medicine: knownProfileText(pet.careProfile?.medication),
            behavior: knownProfileText(pet.careProfile?.handling)
          }));

          const normalizedTasks = buildNormalizedTasks(target, input.tasks);
          const checklistItems = normalizedTasks.map(({ itemId, label, required }) => ({ itemId, label, required }));
          const checklistItemIds = normalizedTasks.filter(item => item.required).map(item => item.itemId);

          const isAssigned = Boolean(target.sitterId) && target.state === 'ASSIGNED';
          const priorAckVersion = Number.isInteger(target.acknowledgedInstructionVersion)
            ? Math.min(target.acknowledgedInstructionVersion, prevVersion)
            : prevVersion;

          const careInstructions = {
            version: nextVersion,
            confirmedAt: at,
            confirmedBy: oid(actor.userId),
            updatedAfterAssigned: isAssigned,
            pets: savedPets,
            tasks: normalizedTasks,
            homeAccessNote: input.homeAccessNote,
            acknowledgedBySitterId: null,
            acknowledgedAt: null
          };

          const updateDoc = {
            $set: {
              currentInstructionVersion: nextVersion,
              acknowledgedInstructionVersion: isAssigned ? priorAckVersion : nextVersion,
              careInstructions,
              'snapshots.care': {
                ...snapshotCare,
                capturedAt: at,
                privateAccessNotes: input.homeAccessNote,
                pets: updatedSnapshotPets
              },
              'snapshots.checklistItems': checklistItems,
              'snapshots.checklistItemIds': checklistItemIds
            },
            $inc: { version: 1 }
          };
          if (isAssigned) {
            updateDoc.$unset = { careAcknowledgement: 1 };
          }

          const updated = await col('visits').updateOne(
            {
              _id: target._id,
              version: target.version ?? 0,
              state: { $in: ['SCHEDULED', 'ASSIGNED'] },
              checkInAt: { $eq: null }
            },
            updateDoc,
            { session }
          );
          if (!updated.matchedCount) {
            fail(409, 'VERSION_CONFLICT', 'Visit changed before your update could be saved');
          }
          updatedVisitIds.push(String(target._id));

          if (isAssigned) {
            await notifications.careInstructionsUpdated(
              {
                visitId: String(target._id),
                bookingId: String(booking._id),
                sitterId: String(target.sitterId),
                instructionVersion: nextVersion
              },
              session
            );
          }
        }

        const refreshed = await loadBookingVisits(actor, bookingId, session);
        const sitterNames = await loadSitterNames(refreshed.visits, session);
        return {
          bookingId: String(booking._id),
          bookingCode: booking.bookingCode ?? booking.code ?? null,
          bookingState: booking.state,
          appliedFromNextVisit: withinTwoHours,
          updatedVisitIds,
          serverNow: at.toISOString(),
          visits: refreshed.visits.map(visit => toBookingVisitView(visit, booking, nowMs, sitterNames))
        };
      });
    }
  });
}
