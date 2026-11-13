import { Types } from 'mongoose';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { AppError } from '../../utils/app-error.js';
import { createReferenceCatalogFacade } from '../reference-catalog.service.js';
import { createUnitOfWork } from '../unit-of-work.service.js';

const validId = value => typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value);
const notFound = () => { throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy buổi chăm sóc.'); };
const milestoneKeys = ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'FINISHED', 'REPORT_READY'];
const currentDate = (value, asOf) => value instanceof Date && Number.isFinite(+value) && value <= asOf ? value : null;
const timeLimit = { maxTimeMS: 2000 };

function progress(booking, visit, checklistAt, asOf) {
  const assignedAt = visit.sitterId ? currentDate(visit.assignedAt, asOf) : null;
  const checkInAt = currentDate(visit.checkInAt, asOf);
  const checkOutAt = currentDate(visit.checkOutAt, asOf);
  const checklistSaved = Boolean(checkInAt && (checklistAt || visit.checklist?.length));
  const finished = visit.state === 'COMPLETED' && (!visit.checkOutAt || Boolean(checkOutAt));
  const reportReady = finished && Boolean(checkOutAt) && Array.isArray(visit.checklist);
  const assigned = Boolean(visit.sitterId) && ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ARRIVED'].includes(visit.state);
  const cancelled = visit.state === 'CANCELLED' || booking.state === 'CANCELLED';
  const blocked = ['AWAITING_PAYMENT', 'PAYMENT_EXPIRED', 'CARE_PLAN_PENDING'].includes(booking.state);
  const closed = ['STAFF_CLOSED', 'CLOSED'].includes(visit.state);
  const reached = [assigned || Boolean(checkInAt) || finished, Boolean(checkInAt), checklistSaved, finished, reportReady];
  const times = [assignedAt, checkInAt, checklistAt, checkOutAt, reportReady ? checkOutAt : null];
  const milestoneIndex = reached.lastIndexOf(true);
  const status = cancelled ? 'CANCELLED' : closed ? 'CLOSED' : blocked ? booking.state
    : milestoneKeys[milestoneIndex] ?? (visit.sitterId ? 'PENDING' : 'FINDING_SITTER');
  const showProgress = !cancelled && !closed && !blocked && milestoneIndex >= 0;
  const milestones = milestoneKeys.map((key, index) => ({
    key, at: showProgress && reached[index] ? times[index] : null, reached: showProgress && reached[index]
  }));
  const updates = milestones.filter(row => row.at && !(reportReady && row.key === 'FINISHED'))
    .sort((a, b) => b.at - a.at || milestoneKeys.indexOf(b.key) - milestoneKeys.indexOf(a.key))
    .map(({ key, at }) => ({ key, at }));
  return { status, showProgress, milestones, updates, reportReady: showProgress && reportReady,
    inCare: showProgress && visit.state === 'IN_PROGRESS' && Boolean(checkInAt) && !visit.checkOutAt };
}

export function createVisitTrackerService({ connection, clock = Date.now }) {
  const col = name => connection.db.collection(name);
  const uow = createUnitOfWork(connection);

  async function firstChecklist(booking, visit, asOf, session) {
    const from = currentDate(visit.checkInAt, asOf);
    if (!from || !visit.sitterId || !Array.isArray(visit.checklist)) return null;
    const until = currentDate(visit.checkOutAt, asOf) ?? asOf;
    const { FinanceSourceEvent } = financeSourceModels(connection);
    const event = await FinanceSourceEvent.collection.findOne({
      type: 'VisitCHECKLIST', bookingId: String(booking._id), actorId: String(visit.sitterId),
      resourceId: new RegExp('^' + visit._id + ':[0-9]+$'), at: { $type: 'date', $gte: from, $lte: until }
    }, { session, ...timeLimit, sort: { at: 1 }, projection: { at: 1, _id: 0 } });
    return event?.at ?? null;
  }

  async function visitPets(visit, customerId, session) {
    const saved = (visit.snapshots?.pets ?? []).filter(pet => typeof pet?.name === 'string' && pet.name);
    const ids = saved.map(pet => pet.id).filter(validId).map(id => new Types.ObjectId(id));
    if (!ids.length) return saved.map(({ name }) => ({ name, breed: null }));
    const rows = await col('pets').find({ _id: { $in: ids }, ownerId: customerId },
      { session, ...timeLimit, projection: { breedCode: 1, species: 1 } }).toArray();
    const codes = [...new Set(rows.map(pet => pet.breedCode).filter(Boolean))];
    const breeds = codes.length ? await createReferenceCatalogFacade({ connection }).models.PetBreed
      .find({ code: { $in: codes } }).select('code species name').session(session).maxTimeMS(timeLimit.maxTimeMS).lean() : [];
    return saved.map(({ id, name }) => {
      const pet = rows.find(row => String(row._id) === id);
      const breed = pet && breeds.find(row => row.code === pet.breedCode && row.species === pet.species);
      return { name, breed: breed?.name ?? null };
    });
  }

  async function visitSitter(sitterId, session) {
    if (!validId(String(sitterId ?? ''))) return null;
    const id = new Types.ObjectId(String(sitterId));
    const sitter = await col('users').findOne({ _id: id },
      { session, ...timeLimit, projection: { displayName: 1 } });
    if (!sitter?.displayName) return null;
    const [result] = await col('reviews').aggregate([
      { $match: { sitterId: { $in: [id, String(id)] }, state: 'PUBLISHED',
        direction: 'CUSTOMER_TO_SITTER', rating: { $in: [1, 2, 3, 4, 5] } } },
      { $group: { _id: null, rating: { $avg: '$rating' } } }
    ], { session, ...timeLimit }).toArray();
    return { name: sitter.displayName, rating: result?.rating ?? null };
  }

  return {
    async read(actor, { bookingId, visitId }) {
      if (!actor?.roles?.includes('CUSTOMER') || ![actor.userId, bookingId, visitId].every(validId)) notFound();
      const customerId = new Types.ObjectId(actor.userId);
      return uow.run(async session => {
        const asOf = new Date(clock());
        const booking = await col('bookings').findOne({ _id: new Types.ObjectId(bookingId), customerId },
          { session, ...timeLimit, projection: { state: 1, visitIds: 1, bookingCode: 1, code: 1 } });
        if (!booking) notFound();
        const visit = await col('visits').findOne({
          _id: new Types.ObjectId(visitId), bookingId: booking._id, state: { $ne: 'SUPERSEDED' }
        }, { session, ...timeLimit, projection: {
          state: 1, sequence: 1, serviceId: 1, sitterId: 1, startAt: 1, endAt: 1, assignedAt: 1, checkInAt: 1, checkOutAt: 1,
          checklist: 1, 'snapshots.serviceName': 1, 'snapshots.serviceAddress': 1, 'snapshots.careMinutes': 1, 'snapshots.pets': 1
        } });
        const ids = booking.visitIds?.length ? booking.visitIds.map(String) : (await col('visits').find({
          bookingId: booking._id, state: { $ne: 'SUPERSEDED' }
        }, { session, ...timeLimit, projection: { _id: 1 } }).sort({ sequence: 1, _id: 1 }).limit(60).toArray()).map(row => String(row._id));
        const index = ids.indexOf(visitId.toLowerCase());
        if (!visit || index < 0) notFound();
        const checklistAt = await firstChecklist(booking, visit, asOf, session);
        const { status, showProgress, milestones, updates, reportReady, inCare } = progress(booking, visit, checklistAt, asOf);
        const service = inCare && visit.serviceId ? await col('services').findOne({ _id: visit.serviceId },
          { session, ...timeLimit, projection: { code: 1 } }) : null;
        const pets = await visitPets(visit, customerId, session);
        const sitter = await visitSitter(visit.sitterId, session);
        return {
          asOf,
          booking: { id: String(booking._id), code: booking.bookingCode ?? booking.code ?? null, visitNumber: index + 1, visitCount: ids.length },
          visit: { id: String(visit._id), status, showProgress, startAt: visit.startAt ?? null, endAt: visit.endAt ?? null,
            serviceName: visit.snapshots?.serviceName ?? null, durationMinutes: visit.snapshots?.careMinutes ?? null,
            address: visit.snapshots?.serviceAddress ?? null, pets },
          milestones, updates, sitter,
          actions: { profile: false, walkLocation: { eligible: inCare && service?.code === 'dog-walking', available: false },
            incident: false, careReport: reportReady }
        };
      });
    }
  };
}
