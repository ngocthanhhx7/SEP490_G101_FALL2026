import { Types } from 'mongoose';
import { petCareModels } from '../../models/pet-care.model.js';
import { digest, fail, id } from '../../validators/pet-care.validator.js';
import { CARE_PROFILE_KEYS } from '../../validators/customer-care.validator.js';
import { handoverConfirmationInput } from '../../validators/visit-handover.validator.js';
import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';
import { HANDOVER_WINDOW_MS, handoverPending, lateCheckInExempt } from './visit-handover-policy.service.js';
import { additionalCareChecklist } from './visit-care-instructions.service.js';
import { projectVisitCareReport } from './visit-care-report.service.js';
import { workflowMissing, workflowTasks } from './workflow-snapshot.service.js';

const CHECK_IN_WINDOW_MS = 30 * 60000;
const oid = value => new Types.ObjectId(value);
const activeBookingStates = ['ASSIGNED', 'IN_PROGRESS', 'DISPATCH_PENDING'];
const completedVisitFilter = { $or: [{ state: 'COMPLETED' }, { state: 'STAFF_CLOSED', 'closureVerification.outcome': 'SERVICE_PERFORMED' }] };
const phases = ['CHECK_IN', 'EXECUTION', 'CHECK_OUT'];
const validId = value => /^[a-f0-9]{24}$/i.test(String(value));
const isAssignedBeforeCheckIn = visit => visit.state === 'ASSIGNED' && !visit.checkInAt;
const checkInOpensAt = visit => new Date(+visit.startAt - CHECK_IN_WINDOW_MS);
const assignmentStamp = visit => visit.assignedAt instanceof Date ? visit.assignedAt.toISOString() : null;
const nameFor = (names, sitterId) => names.get(String(sitterId)) ?? null;

function careSnapshot(visit) {
  const care = visit.snapshots?.care;
  if (care?.schemaVersion !== 1 || !Array.isArray(care.pets))
    fail('CARE_SNAPSHOT_UNAVAILABLE', 'Visit requires an authorized care snapshot', 503);
  return care;
}

function careProfile(pet) {
  return Object.fromEntries(CARE_PROFILE_KEYS.flatMap(key => {
    const field = pet.careProfile?.[key];
    return field?.status === 'KNOWN' && typeof field.value === 'string' ? [[key, { status: field.status, value: field.value }]] : [];
  }));
}

function requiredTaskLabels(visit) {
  if (!visit.snapshots.workflow) return (visit.snapshots.checklistItems ?? []).map(({ label }) => label).filter(Boolean);
  return [...new Set(workflowTasks(visit.snapshots.workflow, visit.snapshots.pets, visit.location)
    .filter(({ step }) => step.required && step.phase === 'EXECUTION').map(({ step }) => step.title))];
}

function summarizeReport(visit, actorId, names) {
  const required = visit.snapshots?.checklistItemIds ?? [];
  const complete = visit.snapshots?.workflow ? workflowMissing(visit, phases).length === 0
    : required.length > 0 && required.every(id => visit.checklist?.some(item => item.itemId === id &&
      (item.status === 'DONE' || item.status === 'SKIPPED' && item.reason?.trim())));
  const photos = new Set([...(visit.evidenceRefs ?? []), ...(visit.workflowResults ?? []).flatMap(row => row.evidence ?? [])]
    .map(photo => photo.mediaId).filter(Boolean));
  return { visitId: String(visit._id), startAt: visit.startAt, endAt: visit.endAt, sitterName: nameFor(names, visit.sitterId),
    mine: String(visit.sitterId) === actorId, requiredTasksComplete: complete, photoCount: photos.size };
}

export function createVisitHandoverService({ repository, clock = Date.now }) {
  const { col, uow, models, employeeGuard } = repository;
  const visits = col('visits'), bookings = col('bookings');
  const { Pet, PetBreed } = petCareModels(models.EmployeeVisitOffer.db);
  const notifications = createSchedulingNotifications({ col, clock });

  async function context(actor, visitId, session) {
    if (actor?.state !== 'ACTIVE' || actor.synthetic || !actor.roles?.includes('PET_SITTER'))
      fail('FORBIDDEN', 'Active pet sitter required', 403);
    const visit = await visits.findOne({ _id: oid(visitId), sitterId: oid(actor.userId) }, { session, maxTimeMS: 2000 });
    const booking = visit && await bookings.findOne({ _id: visit.bookingId, visitIds: visit._id }, { session, maxTimeMS: 2000,
      projection: { customerId: 1, bookingCode: 1, code: 1, state: 1, visitIds: 1, 'checkoutSnapshot.consentAt': 1 } });
    if (!booking) fail('RESOURCE_NOT_FOUND', 'Assigned visit unavailable', 404);
    return { visit, booking };
  }

  async function get(actor, value) {
    const visitId = id(value).toLowerCase();
    return uow.run(async session => {
      const { visit, booking } = await context(actor, visitId, session);
      if (visit.handoverRequired === true && visit.handoverAccepted === true)
        return { visitId, state: 'CONFIRMED', acceptedAt: visit.handoverAcceptedAt ?? null };
      if (isAssignedBeforeCheckIn(visit) && !handoverPending(visit))
        return { visitId, state: 'NOT_REQUIRED' };
      if (!isAssignedBeforeCheckIn(visit) || !activeBookingStates.includes(booking.state))
        fail('RESOURCE_NOT_FOUND', 'Assigned visit unavailable', 404);

      const care = careSnapshot(visit), note = visit.handoverNote;
      const previousSitterId = note?.previousSitterId ?? visit.withdrawalDispatch?.sitterId;
      const earlier = await visits.find({ bookingId: visit.bookingId, _id: { $in: booking.visitIds },
        startAt: { $lt: visit.startAt }, ...completedVisitFilter
      }, { session, maxTimeMS: 2000, projection: { startAt: 1, endAt: 1, sitterId: 1, checklist: 1, evidenceRefs: 1,
        workflowResults: 1, location: 1, 'snapshots.pets': 1, 'snapshots.workflow': 1, 'snapshots.checklistItemIds': 1 } })
        .sort({ startAt: 1, _id: 1 }).toArray();

      const ids = [...new Set([previousSitterId, ...earlier.map(row => row.sitterId)].filter(validId).map(String))];
      const users = ids.length ? await col('users').find({ _id: { $in: ids.map(oid) } },
        { projection: { displayName: 1 }, session, maxTimeMS: 2000 }).toArray() : [];
      const names = new Map(users.map(row => [String(row._id), row.displayName]));
      const petIds = care.pets.map(pet => pet.id).filter(validId).map(oid);
      const pets = petIds.length ? await Pet.find({ _id: { $in: petIds }, ownerId: booking.customerId })
        .select('breedCode').session(session).maxTimeMS(2000).lean() : [];
      const breeds = pets.length ? await PetBreed.find({ code: { $in: pets.map(pet => pet.breedCode) } })
        .select('code name -_id').session(session).maxTimeMS(2000).lean() : [];
      const breedNames = new Map(breeds.map(breed => [breed.code, breed.name]));
      const breedByPet = new Map(pets.map(pet => [String(pet._id), breedNames.get(pet.breedCode)]));
      const confirmedAt = visit.careInstructions?.confirmedAt
        ?? (care.capturedAt instanceof Date && +care.capturedAt === +booking.checkoutSnapshot?.consentAt
          ? care.capturedAt : null);
      const revision = Number.isInteger(visit.currentInstructionVersion)
        ? visit.currentInstructionVersion
        : (confirmedAt ? 1 : null);
      return {
        visitId, state: 'PENDING', version: visit.version, startAt: visit.startAt, endAt: visit.endAt,
        bookingCode: booking.bookingCode ?? booking.code ?? null, serviceName: visit.snapshots.serviceName ?? null,
        serviceAddress: visit.snapshots.serviceAddress ?? null, assignedAt: visit.assignedAt ?? null,
        urgent: lateCheckInExempt(visit), accessOpensAt: new Date(+visit.startAt - HANDOVER_WINDOW_MS), checkInOpensAt: checkInOpensAt(visit),
        note: { reasonCode: note?.reasonCode ?? null, reasonText: note?.reasonText ?? null,
          flaggedAt: note?.flaggedAt ?? null, previousSitterName: nameFor(names, previousSitterId),
          previousVisitCount: previousSitterId ? earlier.filter(row => String(row.sitterId) === String(previousSitterId)).length : null },
        care: { version: digest(care), revision, confirmedAt,
          pets: care.pets.map(pet => ({ name: pet.name, profile: careProfile(pet) })),
          tasks: requiredTaskLabels(visit),
          ...(visit.snapshots.workflow ? { additionalTasks: additionalCareChecklist(visit).map(({ itemId, label, required }) =>
            ({ itemId, label, required })) } : {}) },
        reports: earlier.map(row => summarizeReport(row, actor.userId, names)),
        pets: care.pets.map(pet => ({ name: pet.name, breed: breedByPet.get(String(pet.id)) ?? null }))
      };
    });
  }

  async function confirm(actor, value, body, key) {
    const visitId = id(value).toLowerCase(), input = handoverConfirmationInput(body, key);
    const commandId = digest([actor.userId, 'VISIT_HANDOVER', visitId, key]), fingerprint = digest(input);
    let sawAssignment = false;
    for (let attempt = 0; ; attempt++) {
      try {
        return await uow.run(async session => {
          const { visit, booking } = await context(actor, visitId, session);
          sawAssignment = true;
          await employeeGuard(actor.userId, session, actor.authEpoch);
          const previous = await models.EmployeeScheduleCommand.findById(commandId).session(session).lean();
          if (previous) {
            if (previous.fingerprint !== fingerprint || previous.result.assignmentStamp !== assignmentStamp(visit))
              fail('IDEMPOTENCY_CONFLICT', 'Handover command no longer matches the assignment', 409);
            return previous.result.response;
          }
          if (!isAssignedBeforeCheckIn(visit) || !handoverPending(visit) || !activeBookingStates.includes(booking.state))
            fail('INVALID_STATE', 'Visit cannot confirm a handover', 409);
          if (visit.version !== input.expectedVersion || digest(careSnapshot(visit)) !== input.careVersion)
            fail('VERSION_CONFLICT', 'Visit or care snapshot changed', 409);
          const at = new Date(clock());
          const saved = await visits.updateOne({ _id: visit._id, sitterId: visit.sitterId, version: input.expectedVersion,
            state: 'ASSIGNED', checkInAt: null, handoverRequired: true, handoverAccepted: { $ne: true } }, {
            $set: { handoverAccepted: true, handoverAcceptedAt: at, handoverAcceptedBy: visit.sitterId,
              careAcknowledgement: { sitterId: actor.userId, version: input.careVersion, acknowledgedAt: at },
              ...(Number.isInteger(visit.currentInstructionVersion) ? {
                acknowledgedInstructionVersion: visit.currentInstructionVersion,
                ...(visit.careInstructions ? {
                  'careInstructions.acknowledgedBySitterId': actor.userId,
                  'careInstructions.acknowledgedAt': at
                } : {})
              } : {}) },
            $inc: { version: 1 }
          }, { session });
          if (!saved.matchedCount) fail('VERSION_CONFLICT', 'Visit changed', 409);
          const result = { visitId, state: 'CONFIRMED', version: visit.version + 1, acceptedAt: at, checkInOpensAt: checkInOpensAt(visit) };
          const event = { type: 'VisitHandoverConfirmed', actorId: actor.userId, sitterId: actor.userId, visitId, at, detail: { version: result.version } };
          await models.EmployeeScheduleEvent.create([event], { session });
          await models.EmployeeScheduleCommand.create([{ _id: commandId, fingerprint,
            result: { assignmentStamp: assignmentStamp(visit), response: result }, createdAt: at }], { session });
          await notifications.publish(event, session);
          return result;
        });
      } catch (error) {
        if (sawAssignment && error.code === 'RESOURCE_NOT_FOUND') fail('VERSION_CONFLICT', 'Assignment changed', 409);
        if (error.code !== 11000 || attempt >= 3) throw error;
      }
    }
  }

  async function earlierReport(actor, value, reportValue) {
    const visitId = id(value).toLowerCase();
    const reportVisitId = id(reportValue).toLowerCase();
    return uow.run(async session => {
      const { visit, booking } = await context(actor, visitId, session);
      if (!isAssignedBeforeCheckIn(visit) || !handoverPending(visit) || !activeBookingStates.includes(booking.state)) {
        fail('RESOURCE_NOT_FOUND', 'Assigned visit unavailable', 404);
      }
      if (reportVisitId === visitId || !booking.visitIds?.some(item => String(item) === reportVisitId)) {
        fail('RESOURCE_NOT_FOUND', 'Earlier care report unavailable', 404);
      }
      const target = await visits.findOne({
        _id: oid(reportVisitId),
        bookingId: visit.bookingId,
        startAt: { $lt: visit.startAt },
        ...completedVisitFilter
      }, {
        session,
        maxTimeMS: 2000,
        projection: {
          startAt: 1, endAt: 1, state: 1, sitterId: 1, checkInAt: 1, checkOutAt: 1,
          customerNote: 1, checklist: 1, workflowResults: 1, location: 1, evidenceRefs: 1,
          'snapshots.checklistItems': 1, 'snapshots.workflow': 1, 'snapshots.pets': 1
        }
      });
      if (!target) fail('RESOURCE_NOT_FOUND', 'Earlier care report unavailable', 404);
      const sitter = validId(target.sitterId)
        ? await col('users').findOne({ _id: oid(target.sitterId) }, { projection: { displayName: 1 }, session, maxTimeMS: 2000 })
        : null;
      return projectVisitCareReport(target, { sitterName: sitter?.displayName ?? null, customerView: true, includeCustomerNote: true });
    });
  }

  return { get, confirm, earlierReport };
}
