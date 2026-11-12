import { AppError } from '../../utils/app-error.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { digest, id, instant } from '../../validators/pet-care.validator.js';
import { schedulingKey } from '../../validators/employee-scheduling.validator.js';
import { bookingChangeDecision, bookingChangeInput, bookingChangeQuery } from '../../validators/booking-change.validator.js';
import { activeItems, createBookingChangeStore, oid, RECHECK_MS } from './booking-change-store.js';
import { assertSchedule, BOOKING_CHANGE_STATES, buildChangeItems, changeDeadline, checkLeadTime, chooseChange,
  futureVisit, HOUR, resultingSchedule, scheduleViolation, visitSlots } from './booking-change-policy.js';
import { assessAssignments, hasChanged, moveVisits, visitChanged } from './booking-change-assignments.js';

const BATCH_SIZE = 25;
const recipient = (recipientId, role) => ({ recipientId: String(recipientId), role });
const bookingCode = booking => booking.bookingCode ?? booking.code ?? null;
const bookedPrice = visit => {
  const { baseVnd, surchargeVnd } = visit?.snapshots ?? {};
  return [baseVnd, surchargeVnd, baseVnd + surchargeVnd].every(value => Number.isSafeInteger(value) && value >= 0)
    ? baseVnd + surchargeVnd : null;
};

function requestView(change) {
  const messageCode = { PENDING: 'MSG53', APPROVED: 'MSG126', REJECTED: 'MSG127' }[change.state];
  return {
    id: String(change._id), bookingId: String(change.bookingId), scope: change.scope,
    state: change.state, version: change.version, sentAt: change.sentAt, expiresAt: change.expiresAt,
    keptVisitIds: change.keptVisitIds, removedVisitIds: change.removedVisitIds,
    items: activeItems(change).map(({ oldVersion: _oldVersion, ...item }) => item),
    ...(change.resolvedAt ? { resolvedAt: change.resolvedAt } : {}), ...(messageCode ? { messageCode } : {})
  };
}

export function createBookingChangeService({ connection, repository, notifications, cursorSecret, requeue, clock = Date.now }) {
  const store = createBookingChangeStore(connection);
  const { col, bookings, visits, requests, claims, commands, notices } = store;
  const cursor = createScopedCursor({ secret: cursorSecret, namespace: 'booking-change-queue-v1', clock });
  const { uow } = repository;
  const now = () => new Date(clock());

  async function guardActor(actor, session) {
    const current = await col('users').updateOne({
      _id: oid(actor.userId), state: 'ACTIVE', roles: actor.roles, synthetic: { $ne: true }
    }, { $inc: { schedulingGuardVersion: 1 } }, { session });
    if (!current.matchedCount) throw new AppError(403, 'FORBIDDEN', 'Tài khoản không còn quyền thực hiện thao tác này.');
  }

  async function canChange(booking, rows, session) {
    if (!BOOKING_CHANGE_STATES.includes(booking.state) || booking.carePlanState !== 'APPROVED' ||
      rows.some(visit => visit.snapshots?.boarding === true) ||
      booking.checkoutSnapshot?.customerVisits?.some(visit => visit.snapshots?.boarding === true)) return false;
    if (booking.paymentMode === 'POSTPAY') return true;
    const amount = booking.paymentSnapshot?.amountVnd;
    return booking.paymentMode === 'PREPAY' && booking.paymentState === 'PAID' && Number.isSafeInteger(amount) &&
      Boolean(await col('payments').findOne({ bookingId: booking._id, state: 'VERIFIED',
        'receiptMoney.currency': 'VND', 'receiptMoney.amountVnd': amount }, { session, projection: { _id: 1 } }));
  }

  async function checkPetOverlap(proposed, movedIds, session, { writeGuard }) {
    const selected = proposed.filter(visit => movedIds.includes(String(visit._id)));
    if (writeGuard) {
      const ids = [...new Set(selected.flatMap(visit => (visit.petIds ?? []).map(String)))].sort();
      for (const petId of ids) {
        const updated = await col('pets').updateOne({ _id: oid(petId) }, { $inc: { bookingGuard: 1 } }, { session });
        if (!updated.matchedCount)
          throw new AppError(409, 'BOOKING_CHANGE_PET_UNAVAILABLE', 'Cần kiểm tra hồ sơ thú cưng của lịch đặt.');
      }
    }
    for (const visit of selected) {
      const petIds = (visit.petIds ?? []).map(String);
      const conflict = await visits.findOne({
        _id: { $nin: movedIds.map(oid) }, petIds: { $in: petIds.flatMap(petId => [oid(petId), petId]) },
        state: { $nin: ['CANCELLED', 'SUPERSEDED'] }, startAt: { $lt: visit.endAt }, endAt: { $gt: visit.startAt }
      }, { session, projection: { petIds: 1 }, maxTimeMS: 2000 });
      const anotherMovedVisit = selected.find(other => other !== visit && other.startAt < visit.endAt &&
        other.endAt > visit.startAt && other.petIds?.some(value => petIds.includes(String(value))));
      const sharedPet = (conflict ?? anotherMovedVisit)?.petIds?.map(String).find(petId => petIds.includes(petId));
      if (sharedPet) {
        const pet = visit.snapshots?.pets?.find(item => String(item.id) === sharedPet)?.name ?? 'Thú cưng';
        return { code: 'MSG68', reasonCode: 'PET_OVERLAP', message: pet + ' đã có lịch đặt khác vào giờ này.', pet };
      }
    }
    return null;
  }

  async function publishNotices(requestId) {
    const pending = await notices.find({ deliveredAt: null, nextAttemptAt: { $lte: now() },
      ...(requestId ? { requestId } : {}) }).sort({ nextAttemptAt: 1, _id: 1 }).limit(BATCH_SIZE).toArray();
    for (const notice of pending) {
      try {
        await notifications.publish({ eventId: notice._id, eventType: notice.eventType, title: notice.title,
          message: notice.message, recipients: notice.recipients, deepLink: notice.deepLink });
        await notices.updateOne({ _id: notice._id, deliveredAt: null }, { $set: { deliveredAt: now() } });
      } catch {
        await notices.updateOne({ _id: notice._id, deliveredAt: null },
          { $set: { nextAttemptAt: new Date(clock() + RECHECK_MS) } });
      }
    }
  }

  async function replay(commandId, fingerprint, session) {
    const prior = await commands.findOne({ _id: commandId }, { session });
    if (prior && prior.fingerprint !== fingerprint)
      throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Khoá gửi lại đã dùng cho dữ liệu khác.');
    return prior?.result;
  }

  async function recordDecision(change, action, actorId, oldVisits, at, session) {
    const approved = action === 'APPROVE';
    const updated = await store.savePending(change, {
      state: approved ? 'APPROVED' : 'REJECTED', resolvedAt: at, resolvedBy: actorId
    }, session);
    await store.releaseClaims(change, null, session);
    const event = approved ? 'BookingChangeApproved' : 'BookingChangeRejected';
    const title = approved ? 'Yêu cầu đổi giờ đã được duyệt' : 'Yêu cầu đổi giờ đã bị từ chối';
    const message = approved ? 'Lịch đặt đã được cập nhật giờ mới.' : 'Lịch đặt giữ giờ cũ.';
    await store.queueNotice(change, event, [recipient(change.customerId, 'CUSTOMER')], title, message, at, session,
      '/account/bookings/' + change.bookingId);
    if (approved) {
      const sitterIds = [...new Set(oldVisits.filter(visit => visit.sitterId).map(visit => String(visit.sitterId)))];
      if (sitterIds.length) await store.queueNotice(change, event, sitterIds.map(value => recipient(value, 'PET_SITTER')),
        'Giờ buổi chăm sóc đã thay đổi', 'Xem mục Ca đã nhận để kiểm tra các buổi được phân công.', at, session, '/sitter/invitations');
    }
    return requestView(updated);
  }

  return {
    async options(actor, bookingId) {
      id(bookingId);
      await store.assertStorage();
      return uow.run(async session => {
        const at = now();
        const booking = await store.readBooking(bookingId, session, actor.userId);
        const rows = await store.readVisits(booking, session);
        const enabled = await canChange(booking, rows, session);
        const future = enabled ? visitSlots(rows).filter(({ visit }) => futureVisit(visit, at)) : [];
        const names = await store.names(future.map(({ visit }) => visit.sitterId), session);
        const slotNumbers = [...new Set(future.filter(({ visit }) => visit.startAt - at >= 12 * HOUR)
          .map(({ slot }) => slot + 1))].sort((a, b) => a - b);
        return {
          serverNow: at, bookingId: String(booking._id), bookingCode: bookingCode(booking), slotNumbers,
          canChangeBooking: slotNumbers.length > 0,
          visits: future.map(({ visit, slot }) => ({
            id: String(visit._id), customerVisitId: visit.customerVisitId ?? null, slotNumber: slot + 1,
            startAt: visit.startAt, endAt: visit.endAt, sitterName: names.get(String(visit.sitterId)) ?? null,
            serviceName: visit.snapshots?.serviceName ?? null, priceVnd: bookedPrice(visit),
            canSelect: visit.startAt - at >= 12 * HOUR, keepsOldTime: visit.startAt - at < 12 * HOUR
          }))
        };
      });
    },

    async submit(actor, bookingId, body, key) {
      const bookingKey = id(bookingId).toLowerCase(), input = bookingChangeInput(body);
      const commandId = digest([actor.userId, 'BOOKING_CHANGE_SUBMIT', schedulingKey(key)]);
      const fingerprint = digest([bookingKey, input]);
      await store.assertStorage();
      return uow.run(async session => {
        const at = now();
        const booking = await store.readBooking(bookingKey, session, actor.userId);
        await guardActor(actor, session);
        // Serializes requests for the booking without changing the visit version or its invitations.
        await bookings.updateOne({ _id: booking._id }, { $inc: { bookingChangeGuardVersion: 1 } }, { session });
        const previous = await replay(commandId, fingerprint, session);
        if (previous) return previous;
        const rows = await store.readVisits(booking, session);
        if (!await canChange(booking, rows, session))
          throw new AppError(409, 'BOOKING_CHANGE_UNAVAILABLE', 'Lịch đặt này chưa thể gửi yêu cầu đổi giờ.');
        const { selected, keptVisitIds } = chooseChange(input, rows, at);
        checkLeadTime(selected, at);
        if (selected.some(({ visit }) => visit.bookingChangeRequestId))
          throw new AppError(409, 'MSG55', 'Buổi này đã được đổi giờ một lần và không thể đổi lại.');
        const movedIds = selected.map(({ visit }) => String(visit._id));
        const locks = await claims.find({ _id: { $in: movedIds } }, { session }).toArray();
        const pending = await requests.find({ _id: { $in: locks.map(lock => lock.requestId) }, state: 'PENDING' }, { session }).toArray();
        for (const request of pending) await store.reconcile(request, at, session);
        const staffProposal = await repository.models.EmployeeScheduleProposal.findOne({
          visitId: { $in: movedIds }, state: 'PENDING_CUSTOMER_CONFIRMATION', expiresAt: { $gt: at }
        }).session(session).select('_id').lean();
        if (staffProposal) throw new AppError(409, 'BOOKING_CHANGE_STAFF_PROPOSAL_PENDING',
          'Buổi này đang có đề xuất đổi giờ của nhân viên chờ bạn xác nhận.');
        const pendingClaim = await claims.findOne({ _id: { $in: movedIds } }, { session });
        if (pendingClaim) throw new AppError(409, 'MSG149', 'Buổi này đã có yêu cầu đổi giờ đang chờ nhân viên duyệt.');
        const items = buildChangeItems(selected);
        const resulting = resultingSchedule(rows, items);
        assertSchedule(scheduleViolation(resulting), false);
        assertSchedule(await checkPetOverlap(resulting, movedIds, session, { writeGuard: false }), false);
        const change = {
          _id: oid(), bookingId: booking._id, customerId: booking.customerId, scope: input.scope,
          state: 'PENDING', version: 0, items, keptVisitIds, removedVisitIds: [], sentAt: at,
          expiresAt: changeDeadline(items), recheckAt: at
        };
        await requests.insertOne(change, { session });
        await claims.insertMany(movedIds.map(visitId => ({ _id: visitId, requestId: change._id })), { session });
        const result = requestView(change);
        await commands.insertOne({ _id: commandId, fingerprint, result }, { session });
        return result;
      });
    },

    async list(actor, input) {
      const { bookingId, limit, cursor: token } = bookingChangeQuery(input);
      const context = { actor: actor.userId, bookingId, limit };
      const position = token ? cursor.decode(token, context) : null;
      await store.assertStorage();
      const filter = { state: 'PENDING', ...(bookingId ? { bookingId: oid(bookingId) } : {}),
        ...(position ? { $or: [{ expiresAt: { $gt: new Date(instant(position.expiresAt)) } },
          { expiresAt: new Date(instant(position.expiresAt)), _id: { $gt: oid(id(position.id)) } }] } : {}) };
      return uow.run(async session => {
        const at = now();
        const candidates = await requests.find(filter, { session, maxTimeMS: 3000 })
          .sort({ expiresAt: 1, _id: 1 }).limit(limit + 1).toArray();
        const page = candidates.slice(0, limit);
        const pending = [];
        for (const row of page) {
          const current = await store.reconcile(row, at, session);
          if (current.state === 'PENDING') pending.push(current);
        }
        const names = await store.names(pending.map(row => row.customerId), session);
        const ids = [...new Set(pending.map(row => String(row.bookingId)))].map(oid);
        const details = ids.length ? await bookings.find({ _id: { $in: ids } },
          { session, projection: { bookingCode: 1, code: 1 } }).toArray() : [];
        const codes = new Map(details.map(booking => [String(booking._id), bookingCode(booking)]));
        const items = pending.sort((a, b) => a.expiresAt - b.expiresAt || String(a._id).localeCompare(String(b._id)))
          .map(row => ({ ...requestView(row), bookingCode: codes.get(String(row.bookingId)) ?? null,
            customerName: names.get(String(row.customerId)) ?? null }));
        const last = page.at(-1);
        return { items, serverNow: at, nextCursor: candidates.length > limit
          ? cursor.encode({ id: String(last._id), expiresAt: last.expiresAt.toISOString() }, context) : null };
      });
    },

    async detail(changeId) {
      id(changeId);
      await store.assertStorage();
      const { change, booking, rows, names, at } = await uow.run(async session => {
        const at = now();
        const saved = await requests.findOne({ _id: oid(changeId) }, { session });
        if (!saved) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy yêu cầu đổi giờ.');
        const change = await store.reconcile(saved, at, session);
        const booking = await store.readBooking(String(change.bookingId), session);
        const rows = await store.readVisits(booking, session);
        const names = await store.names([change.customerId, ...rows.map(visit => visit.sitterId)], session);
        return { change, booking, rows, names, at };
      });
      const view = requestView(change);
      const assignments = change.state === 'PENDING' ? await assessAssignments(repository, rows, activeItems(change), { now: at }) : new Map();
      return {
        ...view, serverNow: at, bookingCode: bookingCode(booking), customerName: names.get(String(change.customerId)) ?? null,
        items: view.items.map(item => {
          const visit = rows.find(row => String(row._id) === item.visitId);
          return { ...item, sitterName: names.get(String(visit?.sitterId)) ?? null, priceVnd: bookedPrice(visit), ...assignments.get(item.visitId) };
        })
      };
    },

    async decide(actor, changeId, body, key) {
      const changeKey = id(changeId).toLowerCase();
      const input = bookingChangeDecision(body);
      const commandId = digest([actor.userId, 'BOOKING_CHANGE_DECIDE', schedulingKey(key)]);
      const fingerprint = digest([changeKey, input]);
      await store.assertStorage();
      const outcome = await uow.run(async session => {
        const at = now();
        await guardActor(actor, session);
        const previous = await replay(commandId, fingerprint, session);
        if (previous) return { result: previous, requeues: [] };
        const saved = await requests.findOne({ _id: oid(changeKey) }, { session });
        if (!saved) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy yêu cầu đổi giờ.');
        const change = await store.reconcile(saved, at, session);
        if (change.state !== 'PENDING') return { state: change.state };
        if (change.version !== input.expectedVersion)
          return { conflict: true };
        const items = activeItems(change);
        const movedIds = items.map(item => item.visitId);
        let oldVisits = [], requeues = [];
        if (input.action === 'APPROVE') {
          const booking = await store.readBooking(String(change.bookingId), session);
          const rows = await store.readVisits(booking, session);
          oldVisits = movedIds.map(visitId => rows.find(visit => String(visit._id) === visitId));
          if (!await canChange(booking, rows, session) || items.some((item, index) => hasChanged(oldVisits[index], item, at)))
            throw visitChanged();
          const resulting = resultingSchedule(rows, items);
          assertSchedule(scheduleViolation(resulting), true);
          assertSchedule(await checkPetOverlap(resulting, movedIds, session, { writeGuard: true }), true);
          const assessments = await assessAssignments(repository, rows, items, { now: at, session });
          if (change.expiresAt <= now()) return { state: (await store.reconcile(change, now(), session)).state };
          requeues = await moveVisits({ store, repository, change, items, visits: oldVisits, assessments, now: at, session });
          const update = { $inc: { version: 1, financeGuardVersion: 1 } };
          if (requeues.length && booking.state === 'ASSIGNED') update.$set = { state: 'DISPATCH_PENDING' };
          const touched = await bookings.updateOne({ _id: booking._id, version: booking.version }, update, { session });
          if (!touched.matchedCount) throw visitChanged();
        }
        const result = await recordDecision(change, input.action, actor.userId, oldVisits, at, session);
        await commands.insertOne({ _id: commandId, fingerprint, result }, { session });
        return { result, requeues };
      });
      await publishNotices(oid(changeKey)).catch(() => {});
      if (outcome.state) throw new AppError(409, 'BOOKING_CHANGE_NOT_PENDING', 'Yêu cầu đã được xử lý hoặc đã hết hạn.', { state: outcome.state });
      if (outcome.conflict) throw new AppError(409, 'VERSION_CONFLICT', 'Yêu cầu đã thay đổi. Vui lòng tải lại.');
      for (const { visitId, version } of outcome.requeues) await requeue?.(visitId, version);
      return outcome.result;
    },

    async runBatch() {
      await store.assertStorage();
      const at = now();
      const due = await requests.find({ state: 'PENDING', $or: [{ expiresAt: { $lte: at } }, { recheckAt: { $lte: at } }] },
        { projection: { _id: 1 }, maxTimeMS: 3000 }).sort({ expiresAt: 1, _id: 1 }).limit(BATCH_SIZE).toArray();
      for (const { _id } of due) {
        await uow.run(async session => {
          const current = await requests.findOne({ _id, state: 'PENDING' }, { session });
          if (!current) return;
          const checkedAt = now();
          const updated = await store.reconcile(current, checkedAt, session);
          if (updated.state === 'PENDING') await requests.updateOne({ _id, state: 'PENDING', version: updated.version },
            { $set: { recheckAt: new Date(+checkedAt + RECHECK_MS) } }, { session });
        });
      }
      await publishNotices();
      return { processed: due.length };
    }
  };
}
