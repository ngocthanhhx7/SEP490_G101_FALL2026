import { Types } from 'mongoose';
import { createDirectedSitterProposalService } from '../directed-proposal.service.js';
import { exact, id, instant, number, fail, digest } from '../../validators/pet-care.validator.js';
import { schedulingKey } from '../../validators/employee-scheduling.validator.js';
import { assertEmployeeSchedulingStorage } from './scheduling-storage.service.js';
import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';

const oid = value => new Types.ObjectId(value);
const view = row => row && ({ ...row, id: String(row._id), expiresAt: row.expiresAt.toISOString() });
export function createEmployeeScheduleProposalService({ repository, dispatch, clock = Date.now }) {
  const { models, col, uow, eligible, employeeGuard } = repository;
  const notifications = createSchedulingNotifications({ col, clock });
  const commandId = (customerId, proposalId, key) => digest([customerId, 'CONFIRM_SCHEDULE_PROPOSAL', proposalId, key]);
  const fingerprint = input => digest({ expectedVersion: input.expectedVersion, selectedSlot: input.selectedSlot });
  async function transact(work) {
    await assertEmployeeSchedulingStorage(models.EmployeeScheduleProposal.db);
    for (let attempt = 0; ; attempt++) {
      try { return await uow.run(work); } catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
    }
  }
  async function proposalFor(customerId, proposalId, session) {
    id(proposalId);
    return models.EmployeeScheduleProposal.findOne({ _id: proposalId, customerId }).session(session ?? null).lean();
  }
  async function pending(input, createdBy) {
    const visit = await dispatch.readContext(input.visitId);
    if (!visit.requestedSitterId || String(visit.requestedSitterId) !== input.sitterId) fail('DIRECTED_SITTER_MISMATCH', 'Only the requested employee can be proposed', 409);
    if (visit.snapshots.boarding) fail('STAY_CHANGE_REQUIRES_REVIEW', 'Boarding stay changes require a whole-stay review', 409);
    const booking = await col('bookings').findOne({ _id: visit.bookingId });
    const record = await repository.find(input.sitterId);
    const slots = [];
    for (const slot of input.slots) {
      const startAt = new Date(slot.startAt), endAt = new Date(slot.endAt);
      if (endAt - startAt !== visit.endAt - visit.startAt) fail('VALIDATION_FAILED', 'A schedule proposal cannot change service duration');
      await eligible(input.sitterId, { ...visit, startAt, endAt }); slots.push({ startAt: startAt.toISOString(), endAt: endAt.toISOString() });
    }
    return { customerId: String(booking.customerId), bookingId: String(booking._id), visitId: String(visit._id), sitterId: input.sitterId,
      visitVersion: visit.version, availabilityVersion: record.version, slots, state: 'PENDING_CUSTOMER_CONFIRMATION', version: 0,
      expiresAt: new Date(clock() + 24 * 3600000), createdBy, createdAt: new Date(clock()),
      paymentState: booking.paymentState, paymentRequired: booking.paymentMode === 'PREPAY',
      priceSnapshot: { amountVnd: booking.paymentSnapshot.amountVnd, currency: 'VND', serviceName: visit.snapshots.serviceName }, petSnapshots: visit.snapshots.pets };
  }
  const proposalRepository = {
    async findByIdempotency() { return null; },
    async createPending(input) {
      const record = await pending(input, input.customerId);
      const [saved] = await models.EmployeeScheduleProposal.create([record]); return view(saved.toObject());
    },
    findOwned: ({ customerId, proposalId }) => proposalFor(customerId, proposalId).then(view),
    async findConfirmationByIdempotency(input) {
      const prior = await models.EmployeeScheduleCommand.findById(commandId(input.customerId, input.proposalId, input.idempotencyKey)).lean();
      if (!prior) return null;
      if (prior.fingerprint !== fingerprint(input)) fail('IDEMPOTENCY_CONFLICT', 'Confirmation key reused for another slot', 409);
      return prior.result;
    },
    confirmAndCreateOffer: input => transact(async session => {
      const command = commandId(input.customerId, input.proposalId, input.idempotencyKey), hash = fingerprint(input);
      const user = await col('users').findOneAndUpdate({ _id: oid(input.customerId), state: 'ACTIVE', roles: 'CUSTOMER', synthetic: { $ne: true },
        ...(input.authEpoch !== undefined ? { authEpoch: input.authEpoch } : {}) },
        { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
      if (!user) fail('FORBIDDEN', 'Active customer required', 403);
      const prior = await models.EmployeeScheduleCommand.findById(command).session(session).lean();
      if (prior) { if (prior.fingerprint !== hash) fail('IDEMPOTENCY_CONFLICT', 'Confirmation key reused', 409); return prior.result; }
      const proposal = await proposalFor(input.customerId, input.proposalId, session);
      if (!proposal || proposal.version !== input.expectedVersion || proposal.state !== 'PENDING_CUSTOMER_CONFIRMATION' || proposal.expiresAt <= new Date(clock()))
        fail('PROPOSAL_NOT_CONFIRMABLE', 'Schedule proposal expired or changed', 409);
      if (!proposal.slots.some(row => row.startAt === input.selectedSlot.startAt && row.endAt === input.selectedSlot.endAt))
        fail('SLOT_NOT_PROPOSED', 'Choose a proposed time', 409);
      const visit = await dispatch.readContext(proposal.visitId, session), sitterId = proposal.sitterId;
      const booking = await col('bookings').findOne({ _id: visit.bookingId, customerId: oid(input.customerId) }, { session });
      if (!booking || String(visit.requestedSitterId) !== sitterId || visit.version !== proposal.visitVersion) fail('VERSION_CONFLICT', 'Visit changed since proposal', 409);
      await employeeGuard(sitterId, session);
      const revised = { ...visit, startAt: new Date(input.selectedSlot.startAt), endAt: new Date(input.selectedSlot.endAt) };
      await eligible(sitterId, revised, session);
      if (await col('visits').findOne({ _id: { $ne: visit._id }, bookingId: visit.bookingId, state: { $ne: 'SUPERSEDED' },
        petIds: { $in: visit.petIds }, startAt: { $lt: revised.endAt }, endAt: { $gt: revised.startAt } }, { session }))
        fail('VISIT_SCHEDULE_OVERLAP', 'The pet already has a service at this time', 409);
      await models.EmployeeVisitOffer.updateMany({ visitId: visit._id, state: 'PENDING' }, { $set: { state: 'REVOKED' }, $inc: { version: 1 } }, { session });
      const changed = await col('visits').updateOne({ _id: visit._id, state: 'SCHEDULED', version: proposal.visitVersion },
        { $set: { startAt: revised.startAt, endAt: revised.endAt, customerScheduleConsent: proposal._id }, $unset: { dispatchReview: 1 }, $inc: { version: 1 } }, { session });
      if (!changed.matchedCount) fail('VERSION_CONFLICT', 'Visit changed', 409);
      await col('bookings').updateOne({ _id: booking._id, version: booking.version }, { $inc: { version: 1, financeGuardVersion: 1 } }, { session });
      const at = new Date(clock());
      const [offer] = await models.EmployeeVisitOffer.create([{ visitId: visit._id, sitterId, state: 'PENDING', version: 0, offeredAt: at,
        deadline: new Date(Math.min(clock() + 15 * 60000, revised.startAt.getTime())), startAt: revised.startAt, endAt: revised.endAt,
        serviceName: visit.snapshots.serviceName, areaCode: visit.areaCode, pets: visit.snapshots.pets }], { session });
      const saved = await models.EmployeeScheduleProposal.findOneAndUpdate({ _id: proposal._id, version: proposal.version },
        { $set: { state: 'CONFIRMED', confirmedAt: at, selectedSlot: input.selectedSlot }, $inc: { version: 1 } }, { session, returnDocument: 'after' }).lean();
      const result = { proposal: view(saved), offer: { id: String(offer._id), visitId: proposal.visitId, sitterId, state: 'PENDING', deadline: offer.deadline.toISOString(), dispatchSequence: 0 } };
      await models.EmployeeScheduleCommand.create([{ _id: command, fingerprint: hash, result, createdAt: at }], { session });
      await models.EmployeeScheduleEvent.create([{ type: 'CustomerScheduleConfirmed', actorId: input.customerId, sitterId,
        visitId: proposal.visitId, offerId: String(offer._id), at, detail: { proposalId: input.proposalId, startAt: revised.startAt, endAt: revised.endAt } }], { session });
      await notifications.publish({ type: 'CustomerScheduleConfirmed', sitterId, visitId: proposal.visitId, offerId: String(offer._id) }, session);
      return result;
    })
  };
  const directed = createDirectedSitterProposalService({ clock, proposalRepository,
    availabilityRepository: { async findAvailableSlots({ sitterId, visitId, slots }) {
      const visit = await dispatch.readContext(visitId), record = await repository.find(sitterId), available = [];
      for (const slot of slots ?? []) {
        try { await eligible(sitterId, { ...visit, startAt: new Date(slot.startAt), endAt: new Date(slot.endAt) }); available.push(slot); }
        catch (error) { if (error.status !== 409) throw error; }
      }
      return { availabilityVersion: record?.version ?? 0, slots: available };
    } } });
  return {
    getProposal: directed.getProposal,
    confirmProposal: directed.confirmProposal,
    async propose(actor, visitId, body, key) {
      id(visitId); exact(body, ['expectedVersion', 'startAt'], ['expectedVersion', 'startAt']); number(body.expectedVersion, 0, 1000000, true);
      const startAt = new Date(instant(body.startAt)); schedulingKey(key);
      if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['STAFF', 'ADMIN'].includes(role))) fail('FORBIDDEN', 'Staff required', 403);
      const command = digest([actor.userId, 'STAFF_SCHEDULE_PROPOSAL', visitId, key]), hash = digest(body);
      return transact(async session => {
        const user = await col('users').findOneAndUpdate({ _id: oid(actor.userId), state: 'ACTIVE', roles: { $in: ['STAFF', 'ADMIN'] },
          ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
        if (!user) fail('FORBIDDEN', 'Current staff account required', 403);
        const previous = await models.EmployeeScheduleCommand.findById(command).session(session).lean();
        if (previous) { if (previous.fingerprint !== hash) fail('IDEMPOTENCY_CONFLICT', 'Proposal key reused', 409); return previous.result; }
        const visit = await dispatch.readContext(visitId, session);
        if (visit.version !== body.expectedVersion) fail('VERSION_CONFLICT', 'Visit changed', 409);
        const record = await pending({ visitId, sitterId: String(visit.requestedSitterId), slots: [{ startAt: startAt.toISOString(),
          endAt: new Date(startAt.getTime() + (visit.endAt.getTime() - visit.startAt.getTime())).toISOString() }] }, actor.userId);
        const [saved] = await models.EmployeeScheduleProposal.create([record], { session }), result = view(saved.toObject());
        await models.EmployeeScheduleCommand.create([{ _id: command, fingerprint: hash, result, createdAt: new Date(clock()) }], { session });
        await models.EmployeeScheduleEvent.create([{ type: 'ScheduleProposed', actorId: actor.userId, sitterId: record.sitterId,
          visitId, at: new Date(clock()), detail: { proposalId: result.id } }], { session });
        await notifications.publish({ type: 'ScheduleProposed', sitterId: record.sitterId, visitId, detail: { proposalId: result.id } }, session);
        return result;
      });
    }
  };
}
