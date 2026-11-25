import { Types } from 'mongoose';
import { hasRole } from '../../utils/roles.js';
import { digest, fail, id } from '../../validators/pet-care.validator.js';
import {
  adminBookingRefundsQuery,
  bookingCancellationInput,
  bookingCancellationPreviewInput
} from '../../validators/booking-cancellation.validator.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { pricingModels } from '../../models/pricing.model.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { finalizeExceptionalBooking } from '../employee-scheduling/booking-terminal.service.js';
import { createBookingChangeStore } from '../booking-change/booking-change-store.js';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';

export const LATE_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
const LATE_CANCEL_FEE_BPS = 3000;
const CANCELLABLE_VISIT_STATES = new Set(['SCHEDULED', 'OFFERED', 'ASSIGNED']);
const NON_CANCELLABLE_BOOKING_STATES = new Set(['CANCELLED', 'CLOSED', 'PAYMENT_EXPIRED', 'OVERDUE']);
const ACTIVE_REFUND_STATES = new Set(['RECORDED', 'APPROVED', 'TRANSFER_PENDING', 'PAID']);
const HEX24 = /^[a-f0-9]{24}$/i;

const oid = value => new Types.ObjectId(value);
const safeMoney = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const bpsAmount = (basis, bps) => {
  if (!Number.isSafeInteger(basis) || basis <= 0 || !Number.isSafeInteger(bps) || bps <= 0) return 0;
  return Number((BigInt(basis) * BigInt(bps) + 5000n) / 10000n);
};

function visitGrossVnd(visit) {
  const base = safeMoney(visit.snapshots?.baseVnd);
  const surcharge = safeMoney(visit.snapshots?.surchargeVnd);
  return base + surcharge;
}

function visitInitialNetVnd(visit) {
  if (Number.isSafeInteger(visit.snapshots?.employeeServiceNetVnd) && visit.snapshots.employeeServiceNetVnd >= 0) {
    return visit.snapshots.employeeServiceNetVnd;
  }
  const gross = visitGrossVnd(visit);
  const discount = safeMoney(visit.snapshots?.discountVnd);
  return Math.max(0, gross - discount);
}

function allocateAmounts(totalVnd, weights) {
  if (totalVnd <= 0 || !weights.length) return weights.map(() => 0);
  const sum = weights.reduce((acc, w) => acc + BigInt(Math.max(0, w)), 0n);
  if (sum <= 0n) return weights.map(() => 0);
  const rows = weights.map((weight, index) => {
    const w = BigInt(Math.max(0, weight));
    return {
      index,
      value: (BigInt(totalVnd) * w) / sum,
      remainder: (BigInt(totalVnd) * w) % sum
    };
  });
  let left = BigInt(totalVnd) - rows.reduce((acc, row) => acc + row.value, 0n);
  for (const row of [...rows].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (left <= 0n) break;
    row.value += 1n;
    left -= 1n;
  }
  return rows.map(row => Number(row.value));
}

export function createBookingCancellationService({ connection, clock = Date.now }) {
  const { FinanceSourceCommand: commands, FinanceSourceEvent: events } = financeSourceModels(connection);
  const { PricingPolicy } = pricingModels(connection);
  const col = name => connection.db.collection(name);
  const now = () => new Date(clock());
  const uow = createUnitOfWork(connection);
  const notifications = createDomainNotifications({ connection, clock });

  function assertCustomer(actor) {
    if (actor?.state !== 'ACTIVE' || actor.synthetic === true) fail('UNAUTHENTICATED', 'Authentication required', 401);
    id(actor.userId);
    if (!hasRole(actor.roles, 'CUSTOMER')) fail('FORBIDDEN', 'Customer required', 403);
  }

  function assertAdmin(actor) {
    if (actor?.state !== 'ACTIVE' || actor.synthetic === true) fail('UNAUTHENTICATED', 'Authentication required', 401);
    id(actor.userId);
    if (!hasRole(actor.roles, 'ADMIN')) fail('FORBIDDEN', 'Admin required', 403);
  }

  async function transact(work) {
    await assertFinanceSourceStorage(connection);
    for (let attempt = 0; ; attempt++) {
      try {
        return await uow.run(work);
      } catch (error) {
        if (error.code !== 11000 || attempt >= 3) throw error;
      }
    }
  }

  async function loadBookingContext(actor, bookingId, session) {
    const booking = await col('bookings').findOne(
      { _id: oid(bookingId), customerId: oid(actor.userId) },
      { session, maxTimeMS: 5000 }
    );
    if (!booking) fail('RESOURCE_NOT_FOUND', 'Booking unavailable', 404);
    const visits = await col('visits').find(
      {
        bookingId: booking._id,
        state: { $ne: 'SUPERSEDED' },
        ...(booking.visitIds?.length ? { _id: { $in: booking.visitIds } } : {})
      },
      { session, maxTimeMS: 5000 }
    ).sort({ startAt: 1, _id: 1 }).limit(61).toArray();
    const payments = await col('payments').find(
      { bookingId: booking._id, state: 'VERIFIED' },
      { session, maxTimeMS: 5000 }
    ).limit(2).toArray();
    const refunds = await col('refunds').find(
      { bookingId: booking._id },
      { session, maxTimeMS: 5000 }
    ).limit(1001).toArray();
    if (visits.length > 60 || refunds.length > 1000 || payments.length > 1) {
      fail('CANCELLATION_RECONCILIATION_REQUIRED', 'Booking requires reconciliation before cancellation', 409);
    }
    return { booking, visits, payments, refunds };
  }

  async function resolveComboRule(booking, visits, session) {
    const quote = booking.checkoutSnapshot?.quote;
    const sample = visits.find(row => row.serviceId && Number.isSafeInteger(row.snapshots?.pricingPolicyVersion));
    if (sample) {
      const policy = await PricingPolicy.findOne({
        serviceId: sample.serviceId,
        version: sample.snapshots.pricingPolicyVersion
      }).session(session ?? null).lean();
      if (policy) {
        return {
          comboPerVisitBps: safeMoney(policy.comboPerVisitBps),
          comboMaxBps: safeMoney(policy.comboMaxBps)
        };
      }
    }
    const quoteComboBps = safeMoney(quote?.comboBps);
    if (quoteComboBps > 0) fail('CANCELLATION_POLICY_UNAVAILABLE', 'Original discount policy is unavailable', 409);
    return { comboPerVisitBps: 0, comboMaxBps: 0 };
  }

  function selectTargetVisits(booking, visits, input, at) {
    const expired = booking.state === 'AWAITING_PAYMENT' && booking.paymentDeadlineAt && booking.paymentDeadlineAt <= at;
    if (expired || NON_CANCELLABLE_BOOKING_STATES.has(booking.state)) {
      fail('BOOKING_NOT_CANCELLABLE', 'Booking can no longer be cancelled', 409);
    }
    if (input.scope === 'VISIT') {
      const target = visits.find(row => String(row._id) === input.visitId);
      if (!target) fail('RESOURCE_NOT_FOUND', 'Visit unavailable', 404);
      if (!CANCELLABLE_VISIT_STATES.has(target.state)) {
        fail('VISIT_NOT_CANCELLABLE', 'Visit can no longer be cancelled', 409);
      }
      if (!(target.startAt instanceof Date) || target.startAt.getTime() <= at.getTime()) {
        fail('VISIT_ALREADY_STARTED', 'Visit has already started and cannot be cancelled', 409);
      }
      return [target];
    }
    const eligible = visits.filter(row =>
      CANCELLABLE_VISIT_STATES.has(row.state)
      && row.startAt instanceof Date
      && row.startAt.getTime() > at.getTime()
    );
    if (!eligible.length) {
      fail('BOOKING_NOT_CANCELLABLE', 'No upcoming cancellable visits remain in this booking', 409);
    }
    return eligible;
  }

  async function computeCancellation({ booking, visits, payments, refunds, targetVisits, at, session }) {
    const targetIds = new Set(targetVisits.map(row => String(row._id)));
    const activeBeforeVisits = visits.filter(row => row.state !== 'CANCELLED' && row.state !== 'SUPERSEDED');
    const remainingVisits = activeBeforeVisits.filter(row => !targetIds.has(String(row._id)));
    const originalCount = safeMoney(booking.checkoutSnapshot?.quote?.visitCount)
      || safeMoney(booking.originalVisitCount)
      || visits.length;
    const isFullBookingCancel = remainingVisits.length === 0;
    const firstCancellationOnFullOrder = activeBeforeVisits.length === originalCount;

    const receipt = payments[0]?.receiptMoney;
    const isPaid = receipt?.currency === 'VND' && Number.isSafeInteger(receipt.amountVnd) && receipt.amountVnd > 0;
    if (!isPaid && (payments.length || booking.paymentState === 'PAID')) {
      fail('CANCELLATION_RECONCILIATION_REQUIRED', 'Verified payment amount is unavailable', 409);
    }
    const paidTotalVnd = isPaid ? receipt.amountVnd : 0;
    if (!isPaid && booking.paymentMode === 'PREPAY' && !isFullBookingCancel) {
      fail('CANCELLATION_PAYMENT_PENDING', 'Partial cancellation requires settlement of the prepaid booking', 409);
    }
    const priorRefundedVnd = refunds.reduce((sum, row) => {
      const status = row.state ?? row.status;
      return ACTIVE_REFUND_STATES.has(status) ? sum + safeMoney(row.amountVnd) : sum;
    }, 0);
    const capRemainingVnd = Math.max(0, paidTotalVnd - priorRefundedVnd);

    const { comboPerVisitBps, comboMaxBps } = await resolveComboRule(booking, visits, session);
    const hasComboDiscount = comboPerVisitBps > 0 && comboMaxBps > 0;
    const priorComboBps = hasComboDiscount
      ? Math.min(activeBeforeVisits.length * comboPerVisitBps, comboMaxBps)
      : 0;
    const nextComboBps = hasComboDiscount && remainingVisits.length > 0
      ? Math.min(remainingVisits.length * comboPerVisitBps, comboMaxBps)
      : 0;

    // GBR-17 (Method 1): recalculate only multi-visit combo discount on remaining visits;
    // tier discount (if any) stays unchanged.
    const remainingBaseVnd = remainingVisits.reduce((sum, row) => sum + safeMoney(row.snapshots?.baseVnd), 0);
    const priorRemainingDiscountVnd = firstCancellationOnFullOrder && booking.checkoutSnapshot?.quote?.discountVnd !== undefined
      ? remainingVisits.reduce((sum, row) => sum + safeMoney(row.snapshots?.discountVnd), 0)
      : bpsAmount(remainingBaseVnd, priorComboBps);
    const nextRemainingDiscountVnd = bpsAmount(remainingBaseVnd, nextComboBps);
    const comboDiscountAdjustmentVnd = isPaid && remainingVisits.length > 0
      ? Math.max(0, priorRemainingDiscountVnd - nextRemainingDiscountVnd)
      : 0;

    // GBR-15: 30% of pre-discount visit price ONLY when < 24h AND a pet sitter accepted (ASSIGNED).
    const perVisit = targetVisits.map(visit => {
      const grossVnd = visitGrossVnd(visit);
      const acceptedBySitter = visit.state === 'ASSIGNED' && Boolean(visit.sitterId);
      const timeUntilStartMs = visit.startAt.getTime() - at.getTime();
      const isLate = acceptedBySitter && timeUntilStartMs < LATE_CANCEL_WINDOW_MS;
      const lateFeeVnd = isLate ? bpsAmount(grossVnd, LATE_CANCEL_FEE_BPS) : 0;

      // Net paid basis of this visit before this cancellation's combo recalculation.
      const paidBasisVnd = !isPaid
        ? 0
        : firstCancellationOnFullOrder
          ? visitInitialNetVnd(visit)
          : Math.max(0, grossVnd - bpsAmount(safeMoney(visit.snapshots?.baseVnd), priorComboBps));

      return {
        visit,
        visitId: String(visit._id),
        startAt: visit.startAt,
        endAt: visit.endAt,
        state: visit.state,
        acceptedBySitter,
        isLate,
        grossVnd,
        paidBasisVnd,
        lateFeeVnd
      };
    });

    const lateFeeTotalVnd = perVisit.reduce((sum, item) => sum + item.lateFeeVnd, 0);
    const orderFeeRefundVnd = isPaid && isFullBookingCancel
      ? safeMoney(booking.checkoutSnapshot?.quote?.orderFeeVnd)
      : 0;

    // Allocate combo discount clawback across the cancelled visits (when cancelling multiple visits).
    const comboAdjustments = allocateAmounts(
      comboDiscountAdjustmentVnd,
      perVisit.map(item => Math.max(0, item.paidBasisVnd - item.lateFeeVnd))
    );
    const orderFeeShares = allocateAmounts(
      orderFeeRefundVnd,
      perVisit.map(item => Math.max(1, item.grossVnd))
    );

    const rawItems = perVisit.map((item, index) => {
      const comboAdj = comboAdjustments[index];
      const rawRefundVnd = isPaid
        ? Math.max(0, item.paidBasisVnd + orderFeeShares[index] - item.lateFeeVnd - comboAdj)
        : 0;
      return {
        ...item,
        comboDiscountAdjustmentVnd: comboAdj,
        rawRefundVnd
      };
    });

    // Enforce GBR-30: total refunds for a booking never exceed what the customer paid.
    const rawRefundSum = rawItems.reduce((sum, item) => sum + item.rawRefundVnd, 0);
    const refundTotalVnd = isPaid ? Math.min(rawRefundSum, capRemainingVnd) : 0;
    const cappedShares = rawRefundSum === refundTotalVnd
      ? rawItems.map(item => item.rawRefundVnd)
      : allocateAmounts(refundTotalVnd, rawItems.map(item => item.rawRefundVnd));

    const items = rawItems.map((item, index) => ({
      visitId: item.visitId,
      startAt: item.startAt.toISOString(),
      endAt: item.endAt.toISOString(),
      state: item.state,
      acceptedBySitter: item.acceptedBySitter,
      isLate: item.isLate,
      grossVnd: item.grossVnd,
      lateFeeVnd: item.lateFeeVnd,
      comboDiscountAdjustmentVnd: item.comboDiscountAdjustmentVnd,
      refundVnd: cappedShares[index],
      sitterId: item.visit.sitterId ? String(item.visit.sitterId) : null
    }));

    return {
      bookingId: String(booking._id),
      isPaid,
      paidTotalVnd,
      priorRefundedVnd,
      capRemainingVnd,
      remainingVisitCount: remainingVisits.length,
      cancelledVisitCount: items.length,
      lateFeeTotalVnd,
      comboDiscountAdjustmentVnd,
      refundTotalVnd,
      freeCancellation: lateFeeTotalVnd === 0,
      hasAssignedSitter: items.some(item => item.acceptedBySitter),
      items
    };
  }

  return {
    async preview(actor, bookingId, body) {
      assertCustomer(actor);
      id(bookingId);
      const input = bookingCancellationPreviewInput(body);
      await assertFinanceSourceStorage(connection);
      const at = now();
      const context = await loadBookingContext(actor, bookingId, null);
      const targetVisits = selectTargetVisits(context.booking, context.visits, input, at);
      const summary = await computeCancellation({ ...context, targetVisits, at, session: null });
      return {
        scope: input.scope,
        visitId: input.visitId,
        ...summary,
        serverNow: at.toISOString()
      };
    },

    async cancel(actor, bookingId, body, key) {
      assertCustomer(actor);
      id(bookingId);
      const input = bookingCancellationInput(body);
      if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) {
        fail('VALIDATION_FAILED', 'Idempotency key required');
      }
      const fingerprint = digest({ bookingId, ...input });
      const commandId = digest([actor.userId, 'BOOKING_CANCEL', bookingId, key]);

      return transact(async session => {
        const previous = await commands.findById(commandId).session(session).lean();
        if (previous) {
          if (previous.fingerprint !== fingerprint) {
            fail('IDEMPOTENCY_KEY_REUSED', 'Cancellation key already used', 409);
          }
          return previous.result;
        }

        const at = now();
        const context = await loadBookingContext(actor, bookingId, session);
        const targetVisits = selectTargetVisits(context.booking, context.visits, input, at);
        const summary = await computeCancellation({ ...context, targetVisits, at, session });

        const targetObjectIds = targetVisits.map(row => row._id);
        const byId = new Map(summary.items.map(item => [item.visitId, item]));

        // 1. Mark each target visit CANCELLED with optimistic concurrency guard.
        for (const visit of targetVisits) {
          const calc = byId.get(String(visit._id));
          const updated = await col('visits').updateOne(
            { _id: visit._id, version: visit.version, state: { $in: [...CANCELLABLE_VISIT_STATES] } },
            {
              $set: {
                state: 'CANCELLED',
                cancelledAt: at,
                cancelledBy: oid(actor.userId),
                cancellationReason: input.reason,
                cancellationFeeVnd: calc.lateFeeVnd
              },
              $inc: { version: 1 }
            },
            { session }
          );
          if (updated.matchedCount !== 1) fail('VERSION_CONFLICT', 'Visit changed while cancelling', 409);
        }

        // 2. Close open offers for cancelled visits.
        await col('employeevisitoffers').updateMany(
          { visitId: { $in: targetObjectIds }, state: 'PENDING' },
          { $set: { state: 'REVOKED', decidedAt: at }, $inc: { version: 1 } },
          { session }
        );

        // 3. Reconcile any waiting booking change requests (GBR-19).
        const pendingChanges = await col('bookingchangerequests').find(
          { bookingId: context.booking._id, state: 'PENDING' },
          { session }
        ).limit(20).toArray();
        if (pendingChanges.length) {
          const changeStore = createBookingChangeStore(connection);
          for (const change of pendingChanges) {
            await changeStore.reconcile(change, at, session);
          }
        }

        // 4. Close pending payOS payment intent if an unpaid PREPAY booking is fully cancelled.
        if (context.booking.state === 'AWAITING_PAYMENT' && summary.remainingVisitCount === 0) {
          await col('paymentintents').updateMany(
            { bookingId: context.booking._id, state: 'PENDING' },
            { $set: { state: 'CANCELLED', cancelledAt: at }, $inc: { version: 1 } },
            { session }
          );
        }

        // 5. Finalize booking state (CANCELLED if all cancelled, CLOSED if all terminal, else increment guard).
        const savedBooking = await finalizeExceptionalBooking({
          connection,
          col,
          bookingId: context.booking._id,
          session,
          at
        });

        // 6. Record accounting refunds in `refunds` for each cancelled paid visit with refundVnd > 0.
        const recordedRefundIds = [];
        if (summary.isPaid) {
          for (const item of summary.items) {
            if (item.refundVnd <= 0) continue;
            const refundId = `cancel:${item.visitId}`;
            const exists = await col('refunds').findOne({ _id: refundId }, { session, projection: { _id: 1 } });
            if (!exists) {
              await col('refunds').insertOne({
                _id: refundId,
                bookingId: context.booking._id,
                visitId: oid(item.visitId),
                customerId: context.booking.customerId,
                sourceType: 'BOOKING_CANCELLATION',
                sourceRef: { type: 'BOOKING_CANCELLATION', id: item.visitId },
                currency: 'VND',
                amountVnd: item.refundVnd,
                lateFeeVnd: item.lateFeeVnd,
                comboDiscountAdjustmentVnd: item.comboDiscountAdjustmentVnd,
                state: 'RECORDED',
                disposition: 'ACCOUNTING_REFUND',
                reason: input.reason,
                decidedBy: actor.userId,
                recordedAt: at,
                version: 0
              }, { session });
            }
            recordedRefundIds.push(refundId);
          }
        }

        // 7. Notify pet sitters of cancelled visits (UC-39 Step 5).
        const notifiedSitters = new Map();
        for (const item of summary.items) {
          if (!item.sitterId) continue;
          const list = notifiedSitters.get(item.sitterId) ?? [];
          list.push(item.visitId);
          notifiedSitters.set(item.sitterId, list);
        }
        if (notifiedSitters.size > 0) {
          await notifications.bookingCancelled({
            bookingId: String(context.booking._id),
            eventId: `booking-cancel:${context.booking._id}:${savedBooking.version}`,
            sitters: [...notifiedSitters.entries()].map(([sitterId, visitIds]) => ({ sitterId, visitIds }))
          }, session);
        }

        const result = {
          bookingId: String(context.booking._id),
          bookingState: savedBooking.state,
          scope: input.scope,
          reason: input.reason,
          cancelledVisitIds: summary.items.map(item => item.visitId),
          lateFeeTotalVnd: summary.lateFeeTotalVnd,
          comboDiscountAdjustmentVnd: summary.comboDiscountAdjustmentVnd,
          refundTotalVnd: summary.refundTotalVnd,
          recordedRefundIds,
          notifiedSitterCount: notifiedSitters.size,
          messageCode: 'MSG28',
          cancelledAt: at.toISOString()
        };

        await commands.create([{
          _id: commandId,
          fingerprint,
          result,
          createdAt: at
        }], { session });

        await events.create([{
          _id: `booking-cancelled:${context.booking._id}:${savedBooking.version}`,
          type: input.scope === 'BOOKING' ? 'BookingCancelled' : 'VisitCancelled',
          bookingId: String(context.booking._id),
          actorId: actor.userId,
          resourceId: input.scope === 'VISIT' ? input.visitId : String(context.booking._id),
          at
        }], { session });

        return result;
      });
    },

    async listBookingRefunds(actor, query = {}) {
      assertAdmin(actor);
      const { limit, bookingId } = adminBookingRefundsQuery(query);
      await assertFinanceSourceStorage(connection);
      const filter = {
        sourceType: 'BOOKING_CANCELLATION',
        ...(bookingId ? { bookingId: oid(bookingId) } : {})
      };
      const rows = await col('refunds').find(filter, { maxTimeMS: 5000 })
        .sort({ recordedAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      const total = await col('refunds').countDocuments(filter, { maxTimeMS: 5000 });

      const bookingIds = [...new Set(rows.map(row => row.bookingId).filter(Boolean).map(String))].filter(value => HEX24.test(value));
      const visitIds = [...new Set(rows.map(row => row.visitId).filter(Boolean).map(String))].filter(value => HEX24.test(value));
      const customerIds = [...new Set(rows.map(row => row.customerId).filter(Boolean).map(String))].filter(value => HEX24.test(value));

      const [bookings, visits, users] = await Promise.all([
        bookingIds.length
          ? col('bookings').find({ _id: { $in: bookingIds.map(oid) } }, {
            projection: { state: 1, customerId: 1, paymentSnapshot: 1, 'checkoutSnapshot.customerVisits.snapshots.serviceName': 1 },
            maxTimeMS: 3000
          }).toArray()
          : [],
        visitIds.length
          ? col('visits').find({ _id: { $in: visitIds.map(oid) } }, {
            projection: { startAt: 1, endAt: 1, state: 1, 'snapshots.serviceName': 1 },
            maxTimeMS: 3000
          }).toArray()
          : [],
        customerIds.length
          ? col('users').find({ _id: { $in: customerIds.map(oid) } }, { projection: { displayName: 1 }, maxTimeMS: 3000 }).toArray()
          : []
      ]);

      const bookingMap = new Map(bookings.map(row => [String(row._id), row]));
      const visitMap = new Map(visits.map(row => [String(row._id), row]));
      const userMap = new Map(users.map(row => [String(row._id), row.displayName]));

      // Fill customer names from booking.customerId if refund doc did not store customerId directly.
      const missingCustomerIds = [...new Set(
        bookings.map(row => String(row.customerId)).filter(idValue => HEX24.test(idValue) && !userMap.has(idValue))
      )];
      if (missingCustomerIds.length) {
        const extraUsers = await col('users').find({ _id: { $in: missingCustomerIds.map(oid) } }, {
          projection: { displayName: 1 }, maxTimeMS: 3000
        }).toArray();
        for (const user of extraUsers) userMap.set(String(user._id), user.displayName);
      }

      return {
        total,
        items: rows.map(row => {
          const booking = bookingMap.get(String(row.bookingId));
          const visit = row.visitId ? visitMap.get(String(row.visitId)) : null;
          const resolvedCustomerId = String(row.customerId ?? booking?.customerId ?? '');
          return {
            id: String(row._id),
            bookingId: row.bookingId ? String(row.bookingId) : null,
            visitId: row.visitId ? String(row.visitId) : null,
            sourceType: row.sourceType,
            state: row.state ?? row.status ?? 'RECORDED',
            amountVnd: safeMoney(row.amountVnd),
            lateFeeVnd: safeMoney(row.lateFeeVnd),
            comboDiscountAdjustmentVnd: safeMoney(row.comboDiscountAdjustmentVnd),
            reason: row.reason ?? null,
            recordedAt: row.recordedAt instanceof Date ? row.recordedAt.toISOString() : (row.recordedAt ?? null),
            customer: resolvedCustomerId ? { id: resolvedCustomerId, displayName: userMap.get(resolvedCustomerId) ?? null } : null,
            booking: booking ? {
              id: String(booking._id),
              state: booking.state,
              serviceName: visit?.snapshots?.serviceName ?? booking.checkoutSnapshot?.customerVisits?.[0]?.snapshots?.serviceName ?? null,
              paidTotalVnd: safeMoney(booking.paymentSnapshot?.amountVnd)
            } : null,
            visit: visit ? {
              id: String(visit._id),
              startAt: visit.startAt instanceof Date ? visit.startAt.toISOString() : (visit.startAt ?? null),
              endAt: visit.endAt instanceof Date ? visit.endAt.toISOString() : (visit.endAt ?? null),
              state: visit.state
            } : null
          };
        })
      };
    }
  };
}
