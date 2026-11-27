import { Types } from 'mongoose';
import { digest, exact, fail, id } from '../../validators/pet-care.validator.js';
import { counterBookingInput } from '../../validators/counter-booking.validator.js';
import { GROOMING_CATEGORIES } from '../../constants/grooming.js';
import { isGroomingDate } from '../../utils/grooming-slot-time.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { decisionSnapshotModels } from '../../models/decision-snapshot.model.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { serviceModel } from '../../models/service.model.js';
import { pricingModels } from '../../models/pricing.model.js';
import { notificationModels } from '../../models/notification.model.js';
import { assertNoUnpaidGrooming } from '../grooming/grooming-unpaid.service.js';
import { groomingSlotsInput } from '../../validators/grooming-booking.validator.js';
import { randomInt } from 'node:crypto';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';

const oid = value => new Types.ObjectId(value);
const PREVIEW_MS = 10 * 60000;
const staffOnly = actor => {
  if (actor?.state !== 'ACTIVE' || actor.synthetic === true || !actor.roles?.some(role => ['SALE_STAFF', 'ADMIN'].includes(role)))
    fail('FORBIDDEN', 'Counter staff required', 403);
  return id(actor.userId);
};
const paidResult = ({ booking, appointment, totalVnd, receiptId }) => ({
  status: 'PAID', paid: true, receiptId, totalVnd,
  bookingId: booking?.id ?? null, appointmentId: appointment?.id ?? null
});

export function createCounterCheckout({ connection, clock = Date.now, pricing, checkout, grooming, pickup, provider, webOrigin }) {
  const { DecisionSnapshot } = decisionSnapshotModels(connection);
  const { FinanceSourceCommand: Command, FinanceSourceEvent: Event } = financeSourceModels(connection);
  const notifications = createDomainNotifications({ connection });
  const { Notification } = notificationModels(connection);
  const Service = serviceModel(connection), { PricingPolicy } = pricingModels(connection);
  const col = name => connection.db.collection(name);
  const uow = createUnitOfWork(connection), now = () => new Date(clock());
  async function guardStaff(actor, session) {
    const staffId = staffOnly(actor);
    const staff = await col('users').findOneAndUpdate({ _id: oid(staffId), state: 'ACTIVE',
      roles: { $in: ['SALE_STAFF', 'ADMIN'] }, synthetic: { $ne: true },
      ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) },
    { $inc: { schedulingGuardVersion: 1 } }, { session, returnDocument: 'after' });
    if (!staff) fail('FORBIDDEN', 'Current counter staff required', 403);
    return staffId;
  }
  async function split(input, session) {
    const items = [], visits = [], spaByPet = new Map(), at = now();
    const selections = new Set();
    let pickupCount = 0;
    for (const line of input.lines) {
      const parent = await Service.findById(line.serviceId).session(session).lean();
      if (!parent?.presentation?.locations?.includes(line.location)) fail('SERVICE_UNAVAILABLE', 'Service location unavailable', 409);
      if (parent.code === 'pet-transport') fail('SERVICE_UNAVAILABLE', 'Old transport service is not for sale', 409);
      const spa = line.location === 'FACILITY' && GROOMING_CATEGORIES.includes(parent.presentation.category);
      for (const petId of line.petIds) {
        const key = [line.serviceId, petId, line.location].join(':');
        if (selections.has(key)) fail('VALIDATION_FAILED', 'Duplicate service for the same pet and location');
        selections.add(key);
      }
      if (spa) {
        if (line.visitCount !== undefined || line.starts !== undefined || line.dayCount !== undefined)
          fail('VALIDATION_FAILED', 'Shop grooming uses one appointment');
        for (const petId of line.petIds) {
          const serviceIds = spaByPet.get(petId) ?? [];
          serviceIds.push(line.serviceId); spaByPet.set(petId, serviceIds);
        }
        continue;
      }
      const policy = await PricingPolicy.findOne({ serviceId: parent._id, status: 'APPROVED',
        approvedAt: { $lte: at, $ne: null }, effectiveAt: { $lte: at } }).sort({ version: -1 }).session(session).lean();
      if (!policy || policy.billingMode === 'PER_KM') fail('SERVICE_UNAVAILABLE', 'Service pricing unavailable', 409);
      if (!line.visitCount || !line.starts || line.starts.length !== line.visitCount)
        fail('VALIDATION_FAILED', 'Schedule every non-grooming visit');
      if (policy.billingMode === 'PER_DAY' && !line.dayCount) fail('VALIDATION_FAILED', 'Select boarding days');
      if (policy.billingMode !== 'PER_DAY' && line.dayCount !== undefined) fail('VALIDATION_FAILED', 'Days only apply to boarding');
      const itemIndex = items.length;
      items.push({ serviceId: line.serviceId, petIds: line.petIds, durationMinutes: parent.presentation.durationMinutes ?? policy.unitMinutes,
        visitCount: line.visitCount, ...(line.dayCount ? { dayCount: line.dayCount } : {}) });
      for (const startAt of line.starts) {
        visits.push({ itemIndex, startAt, location: line.location, ...(line.addressId ? { addressId: line.addressId } : {}) });
        if (line.location === 'FACILITY' && input.pickup.enabled) pickupCount++;
      }
    }
    const spaPets = [...spaByPet].map(([petId, serviceIds]) => {
      const answer = input.answers.find(row => row.petId === petId);
      if (!answer) fail('VALIDATION_FAILED', 'Complete grooming questions for every pet');
      return { petId, serviceIds, answers: { biteOrScratch: answer.biteOrScratch, skinCondition: answer.skinCondition } };
    });
    if (input.pickup.enabled && spaPets.length) pickupCount++;
    if (input.pickup.enabled && !pickupCount) fail('VALIDATION_FAILED', 'Pickup requires a facility service');
    if (visits.length > 60) fail('VALIDATION_FAILED', 'At most sixty visits required');
    return { items, visits, spaPets, pickupCount };
  }
  async function execute(actor, input, receipt, session, expected) {
    const staffId = await guardStaff(actor, session);
    const customerId = input.customerId;
    const owner = await col('users').findOne({ _id: oid(customerId), state: 'ACTIVE', roles: 'CUSTOMER', synthetic: { $ne: true } }, { session });
    if (!owner) fail('RESOURCE_NOT_FOUND', 'Customer unavailable', 404);
    await assertNoUnpaidGrooming(connection, customerId, session);
    const { items, visits, spaPets, pickupCount } = await split(input, session);
    let selectedPickup, pickupFeeVnd = 0;
    if (pickupCount) {
      const fare = await pickup.quoteForCustomer(customerId, input.pickup.addressId, session);
      if (!fare.allowed) fail('PICKUP_DISTANCE_EXCEEDED', 'Pickup address exceeds maximum distance', 422);
      selectedPickup = { addressId: input.pickup.addressId, policyVersion: fare.policyVersion, expectedFeeVnd: fare.feeVnd };
      pickupFeeVnd = fare.feeVnd * pickupCount;
    }
    const visitQuote = items.length ? await pricing.basket(customerId, { items }, { session }) : null;
    const shopQuote = spaPets.length ? await grooming.pricing.price(customerId, { pets: spaPets }, { session, counter: true }) : null;
    const subtotalVnd = (visitQuote?.subtotalVnd ?? 0) + (shopQuote?.subtotalVnd ?? 0);
    const tierDiscountVnd = (visitQuote?.tierDiscountVnd ?? 0) + (shopQuote?.tierDiscountVnd ?? 0);
    const totalVnd = subtotalVnd - tierDiscountVnd + pickupFeeVnd;
    const totals = { subtotalVnd, tierDiscountVnd, pickupFeeVnd, totalVnd };
    if (!Number.isSafeInteger(totalVnd) || totalVnd <= 0) fail('PRICE_OVERFLOW', 'Invalid checkout total');
    if (expected && Object.keys(totals).some(key => totals[key] !== expected[key]))
      fail('QUOTE_CHANGED', 'Price or pickup fee changed; preview the basket again', 409);
    const internal = { session, counter: { staffId, receiptId: receipt.id, method: input.paymentMethod, paidAt: receipt.paidAt,
      phase: receipt.phase ?? 'PAID', ...(receipt.expiresAt ? { expiresAt: receipt.expiresAt } : {}),
      ...(receipt.providerReceipt ? { providerReceipt: receipt.providerReceipt } : {}) } };
    const customerActor = { userId: customerId, state: 'ACTIVE', roles: ['CUSTOMER'] };
    let booking, appointment;
    if (visitQuote) booking = await checkout.confirm(customerActor, {
      quoteId: visitQuote.quoteId, acceptServicePolicies: true,
      visits: visits.map(row => ({ ...row, ...(selectedPickup && row.location === 'FACILITY' ? { pickup: selectedPickup } : {}) }))
    }, 'counter:' + receipt.id, internal);
    if (shopQuote) {
      const startAt = new Date(instantForShop(input));
      if (+startAt < clock() + 2 * 3600000) fail('VALIDATION_FAILED', 'Counter appointment must start at least two hours later');
      appointment = await grooming.booking.book(customerId, {
        startAt: startAt.toISOString(), pets: spaPets,
        expectedTotalVnd: shopQuote.totalVnd + (selectedPickup?.expectedFeeVnd ?? 0),
        ...(selectedPickup ? { pickup: selectedPickup } : {})
      }, 'counter:' + receipt.id, internal);
      await Notification.create([{ _id: digest(['COUNTER_GROOMING', appointment.id]), eventId: receipt.id,
        recipientId: customerId, role: 'CUSTOMER', eventType: 'BOOKING_CREATED', title: 'Đã đặt lịch spa tại quầy',
        message: 'Lịch hẹn spa đã được đặt tại quầy và trả trước.', deepLink: '/account/bookings', createdAt: now() }], { session });
    }
    if ((booking?.totalVnd ?? 0) + (appointment?.pricing.totalVnd ?? 0) !== totalVnd)
      fail('QUOTE_CHANGED', 'Revalidated checkout amount differs from preview', 409);
    const receiptMetadata = { counterTotalVnd: totalVnd, groomingAmountVnd: appointment?.pricing.totalVnd ?? 0,
      ...(appointment ? { groomingAppointmentId: oid(appointment.id) } : {}) };
    if (receipt.phase !== 'PENDING' && booking) {
      await col('payments').updateOne({ bookingId: oid(booking.id), counterReceiptId: receipt.id },
        { $set: receiptMetadata }, { session });
    } else if (receipt.phase !== 'PENDING') {
      // Spa-only baskets still have exactly one receipt, without inventing a
      // Visit booking or violating the unique verified booking receipt index.
      await col('payments').insertOne({ _id: new Types.ObjectId(), bookingId: null,
        provider: receipt.providerReceipt ? 'PAYOS' : input.paymentMethod,
        providerEventId: receipt.providerReceipt?.eventId ?? receipt.id,
        ...(receipt.providerReceipt ? { intentId: receipt.providerReceipt.intentId,
          providerTransactionReference: receipt.providerReceipt.reference } : {}),
        state: 'COUNTER_VERIFIED', receiptMoney: { amountVnd: totalVnd, currency: 'VND' }, counterReceiptId: receipt.id,
        ...receiptMetadata, receivedBy: oid(staffId), receivedAt: receipt.paidAt, verifiedAt: receipt.paidAt,
        version: 0, storageContractVersion: 1 }, { session });
    }
    return { ...totals, booking, appointment };
  }
  function instantForShop(input) {
    return Date.parse(input.date + 'T' + input.slot + ':00+07:00');
  }
  async function readPreview(actor, previewId, session) {
    const record = await DecisionSnapshot.findOne({ _id: previewId, kind: 'COUNTER_BOOKING', expiresAt: { $gt: now() } })
      .select('+snapshot').session(session ?? null).lean();
    if (!record || record.snapshot.staffId !== staffOnly(actor)) fail('RESOURCE_NOT_FOUND', 'Counter preview expired or unavailable', 404);
    return record.snapshot;
  }
  async function releasePending(intent, state) {
    return uow.run(async session => {
      const current = await col('paymentintents').findOne({
        _id: intent._id, kind: 'COUNTER_BOOKING', state: 'PENDING', version: intent.version
      }, { session });
      if (!current) return (await Command.findById(intent.counterReceiptId).session(session).lean())?.result;
      const receipt = await Command.findById(intent.counterReceiptId).session(session).lean();
      if (receipt?.result.status !== 'PENDING') return receipt?.result;
      const cancelledAt = now();
      if (current.bookingId) {
        const booking = await col('bookings').updateOne({
          _id: current.bookingId, counterCheckoutId: current.counterReceiptId,
          state: 'AWAITING_PAYMENT', paymentState: 'UNPAID'
        }, { $set: { state: 'CANCELLED', paymentState: 'UNPAID', cancelledAt },
          $inc: { version: 1, financeGuardVersion: 1 } }, { session });
        if (booking.matchedCount !== 1) fail('COUNTER_PAIR_CHANGED', 'Pending booking changed', 409);
        await col('visits').updateMany({
          bookingId: current.bookingId, state: 'SCHEDULED'
        }, { $set: { state: 'CANCELLED', cancelledAt }, $inc: { version: 1 } }, { session });
      }
      if (current.groomingAppointmentId) {
        const changed = await col('groomingappointments').updateOne({
          _id: current.groomingAppointmentId, counterCheckoutId: current.counterReceiptId,
          status: 'BOOKED', counterPaymentState: 'AWAITING_PAYMENT'
        }, { $set: { status: 'CANCELLED', counterPaymentState: 'CANCELLED',
          'pets.$[].status': 'CANCELLED_NO_CHARGE', closedAt: cancelledAt },
          $inc: { version: 1 } }, { session });
        if (changed.matchedCount !== 1) fail('COUNTER_PAIR_CHANGED', 'Pending grooming appointment changed', 409);
      }
      const changed = await col('paymentintents').updateOne({
        _id: current._id, state: 'PENDING', version: current.version
      }, { $set: { state, cancelledAt }, $inc: { version: 1 } }, { session });
      if (changed.matchedCount !== 1) fail('INTENT_CHANGED_DURING_CANCEL', 'Payment intent changed', 409);
      await Command.updateOne({ _id: current.counterReceiptId, 'result.status': 'PENDING' },
        { $set: { 'result.status': state } }, { session });
      return (await Command.findById(current.counterReceiptId).session(session).lean())?.result;
    });
  }
  async function verifyUnpaidAndRelease(intent, state) {
    if (intent.linkRequestedAt) {
      if (!provider?.getPaymentLink) return null;
      let remote;
      try { remote = await provider.getPaymentLink(Number(intent.providerReference)); }
      catch { return null; }
      const matches = () => remote.orderCode === Number(intent.providerReference) &&
        remote.amount === intent.amountVnd && remote.amountPaid === 0;
      if (!matches()) return null;
      if (!['CANCELLED', 'EXPIRED', 'FAILED'].includes(remote.providerStatus)) {
        if (!provider.cancelPaymentLink || remote.providerStatus !== 'PENDING') return null;
        try { remote = await provider.cancelPaymentLink(Number(intent.providerReference),
          state === 'CANCELLED' ? 'Counter staff cancelled booking' : 'Counter booking expired'); }
        catch { return null; }
        if (!matches() || remote.providerStatus !== 'CANCELLED') return null;
      }
    }
    return releasePending(intent, state);
  }
  async function qrView(result) {
    if (result.status !== 'PENDING') return result;
    const intents = col('paymentintents');
    const intent = await intents.findOne({ _id: oid(result.intentId), kind: 'COUNTER_BOOKING' });
    if (!intent) fail('PAYMENT_INTENT_MISSING', 'Counter payment unavailable', 409);
    const current = await Command.findById(result.receiptId).lean();
    if (current?.result.status !== 'PENDING') return current.result;
    const view = { ...result, expiresAt: intent.expiresAt, ...(intent.checkoutUrl ? { checkoutUrl: intent.checkoutUrl } : {}) };
    if (intent.state !== 'PENDING') return current.result;
    if (+intent.expiresAt <= clock()) {
      const expired = await verifyUnpaidAndRelease(intent, 'EXPIRED');
      if (expired) return expired;
      return { ...view, checkoutUrl: null }; // paid or uncertain: await verified webhook, never issue another charge
    }
    if (intent.checkoutUrl) return view;
    if (!provider || !webOrigin) return view;
    const claimed = await intents.findOneAndUpdate({ _id: intent._id, state: 'PENDING', linkRequestedAt: { $exists: false },
      expiresAt: { $gt: now() } }, { $set: { linkRequestedAt: now() } }, { returnDocument: 'after' });
    try {
      const link = claimed ? await provider.createPaymentLink({ orderCode: Number(intent.providerReference), amount: intent.amountVnd,
        description: 'PAWWORLD', returnUrl: new URL('/sale-staff/counter-booking', webOrigin).href,
        cancelUrl: new URL('/sale-staff/counter-booking', webOrigin).href, expiredAt: Math.floor(+intent.expiresAt / 1000) })
        : await provider.getPaymentLink(Number(intent.providerReference));
      const url = new URL(link.checkoutUrl);
      if (url.origin !== 'https://pay.payos.vn' || !url.pathname.startsWith('/web/') || link.amount !== intent.amountVnd ||
        link.orderCode !== Number(intent.providerReference)) return view;
      await intents.updateOne({ _id: intent._id, state: 'PENDING' }, { $set: { checkoutUrl: url.href, paymentLinkId: link.paymentLinkId } });
      return { ...view, checkoutUrl: url.href };
    } catch { return view; } // same intent is recoverable by signed provider lookup; no duplicate link creation
  }
  return {
    async cancel(actor, receiptId) {
      const staffId = staffOnly(actor);
      if (typeof receiptId !== 'string' || !/^[a-f0-9]{64}$/.test(receiptId))
        fail('VALIDATION_FAILED', 'Invalid receipt');
      const command = await Command.findById(receiptId).lean();
      if (!command || command.result.receivedBy !== staffId)
        fail('RESOURCE_NOT_FOUND', 'Counter receipt unavailable', 404);
      if (command.result.status !== 'PENDING') return command.result;
      const intent = await col('paymentintents').findOne({
        _id: oid(command.result.intentId), kind: 'COUNTER_BOOKING'
      });
      if (!intent) fail('PAYMENT_INTENT_MISSING', 'Counter payment unavailable', 409);
      const cancelled = await verifyUnpaidAndRelease(intent, 'CANCELLED');
      if (!cancelled) fail('PAYMENT_RECONCILIATION_REQUIRED',
        'Không thể huỷ khi payOS chưa xác nhận chưa thu tiền. Vui lòng kiểm tra thanh toán.', 409);
      return cancelled;
    },
    async expireBatch() {
      const overdue = await col('paymentintents').find({
        kind: 'COUNTER_BOOKING', state: 'PENDING', expiresAt: { $lte: now() }
      }).sort({ expiresAt: 1, _id: 1 }).limit(50).toArray();
      let expired = 0, deferred = 0;
      for (const intent of overdue) {
        try {
          if ((await verifyUnpaidAndRelease(intent, 'EXPIRED'))?.status === 'EXPIRED') expired++;
          else deferred++;
        } catch { deferred++; }
      }
      return { expired, deferred };
    },
    async status(actor, receiptId) {
      const staffId = staffOnly(actor);
      if (typeof receiptId !== 'string' || !/^[a-f0-9]{64}$/.test(receiptId)) fail('VALIDATION_FAILED', 'Invalid receipt');
      const record = await Command.findById(receiptId).lean();
      if (!record || record.result.receivedBy !== staffId) fail('RESOURCE_NOT_FOUND', 'Counter receipt unavailable', 404);
      return qrView(record.result);
    },
    async recordPayment({ eventId, receipt, decision }) {
      const key = 'payos:' + eventId, intentId = oid(decision.intentId), intents = col('paymentintents');
      const fingerprint = digest(receipt), paidAt = new Date(receipt.receivedAt);
      let failureReason = decision.type === 'RECONCILE' ? decision.reason : null;
      if (!failureReason) {
        try {
          return await uow.run(async session => {
            if (await Command.exists({ _id: key }).session(session)) return { status: 'DUPLICATE' };
            const intent = await intents.findOne({ _id: intentId, kind: 'COUNTER_BOOKING', state: 'PENDING',
              version: decision.expectedIntentVersion, providerReference: receipt.providerOrderCode,
              amountVnd: receipt.amountVnd, currency: 'VND', expiresAt: { $gt: paidAt } }, { session });
            if (!intent || receipt.providerCode !== '00' || receipt.currency !== 'VND' || !receipt.providerTransactionReference)
              fail('INTENT_CHANGED_DURING_WEBHOOK', 'Counter intent changed', 409);
            if (await col('payments').findOne({ provider: 'PAYOS', providerTransactionReference: receipt.providerTransactionReference }, { session }))
              fail('REFERENCE_ALREADY_RECORDED', 'Bank reference already recorded', 409);
            const staffId = intent.counterStaffId;
            const command = await Command.findById(intent.counterReceiptId).session(session).lean();
            if (!command || command.result.status !== 'PENDING' || command.result.totalVnd !== intent.amountVnd)
              fail('INTENT_CHANGED_DURING_WEBHOOK', 'Counter payment command changed', 409);
            let booking = null, appointment = null;
            if (intent.bookingId) {
              booking = await col('bookings').findOneAndUpdate({
                _id: intent.bookingId, counterCheckoutId: intent.counterReceiptId,
                state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: { $gt: paidAt }
              }, { $set: { state: 'DISPATCH_PENDING', paymentState: 'PAID', paidAt },
                $inc: { version: 1, financeGuardVersion: 1 } }, { session, returnDocument: 'after' });
              if (!booking) fail('COUNTER_PAIR_CHANGED', 'Booking payment state changed', 409);
            }
            if (intent.groomingAppointmentId) {
              const prepaidVnd = intent.counterPreview.totals.totalVnd -
                (booking?.paymentSnapshot?.amountVnd ?? 0);
              if (!Number.isSafeInteger(prepaidVnd) || prepaidVnd < 0)
                fail('COUNTER_PAIR_CHANGED', 'Grooming payment amount mismatch', 409);
              appointment = await col('groomingappointments').findOneAndUpdate({
                _id: intent.groomingAppointmentId, counterCheckoutId: intent.counterReceiptId,
                status: 'BOOKED', counterPaymentState: 'AWAITING_PAYMENT'
              }, { $set: { counterPaymentState: 'PAID',
                payment: { method: 'VIETQR', amountVnd: prepaidVnd, paidAt, receivedBy: oid(staffId),
                  payosOrderCode: intent.providerReference },
                prepaid: { receiptId: intent.counterReceiptId, amountVnd: prepaidVnd, method: 'COUNTER_VIETQR',
                  paidAt, receivedBy: oid(staffId) } }, $inc: { version: 1 } },
              { session, returnDocument: 'after' });
              if (!appointment || appointment.pricing?.totalVnd !== prepaidVnd)
                fail('COUNTER_PAIR_CHANGED', 'Grooming payment state changed', 409);
            }
            if (!booking && !appointment) fail('COUNTER_PAIR_CHANGED', 'Counter order pair missing', 409);
            const result = { status: 'PAID', paid: true, receiptId: intent.counterReceiptId, totalVnd: intent.amountVnd,
              bookingId: booking ? String(booking._id) : null, appointmentId: appointment ? String(appointment._id) : null,
              receivedBy: staffId, paidAt, method: 'COUNTER_VIETQR',
              bookingAmountVnd: booking?.paymentSnapshot?.amountVnd ?? 0,
              groomingAmountVnd: appointment?.pricing?.totalVnd ?? 0 };
            await col('payments').insertOne({ _id: new Types.ObjectId(), bookingId: booking?._id ?? null, intentId,
              provider: 'PAYOS', providerEventId: eventId, providerTransactionReference: receipt.providerTransactionReference,
              state: booking ? 'VERIFIED' : 'COUNTER_VERIFIED',
              // This is the booking's allocation of the one payOS charge.
              // Dispatch, check-in and refunds require this receipt to equal booking.paymentSnapshot.
              receiptMoney: { amountVnd: booking?.paymentSnapshot?.amountVnd ?? intent.amountVnd, currency: 'VND' },
              counterReceiptId: intent.counterReceiptId, counterTotalVnd: intent.amountVnd,
              ...(appointment ? { groomingAppointmentId: appointment._id } : {}),
              receivedBy: oid(staffId), receivedAt: paidAt, verifiedAt: paidAt, version: 0, storageContractVersion: 1 }, { session });
            const changed = await intents.updateOne({ _id: intentId, version: intent.version, state: 'PENDING' },
              { $set: { state: 'PAID', paidAt }, $inc: { version: 1 } }, { session });
            if (!changed.matchedCount) fail('INTENT_CHANGED_DURING_WEBHOOK', 'Counter intent changed', 409);
            await Command.updateOne({ _id: intent.counterReceiptId, 'result.status': 'PENDING' }, { $set: { result } }, { session });
            if (booking) await notifications.payment({ eventId: key, booking, reconciliation: false }, session);
            await Event.create([{ _id: key, type: 'PaymentVerified', bookingId: result.bookingId, resourceId: String(intentId), actorId: null, at: paidAt }], { session });
            await Command.create([{ _id: key, fingerprint, result: { status: 'APPLIED' }, createdAt: paidAt }], { session });
            return { status: 'APPLIED' };
          });
        } catch (error) {
          if (!error.code || ![400, 403, 404, 409, 422, 503].includes(error.status)) throw error;
          failureReason = error.code;
        }
      }
      return uow.run(async session => {
        if (await Command.exists({ _id: key }).session(session)) return { status: 'DUPLICATE' };
        const intent = await intents.findOne({ _id: intentId, kind: 'COUNTER_BOOKING' }, { session });
        if (intent && receipt.providerCode === '00') {
          await intents.updateOne({ _id: intentId, state: { $ne: 'PAID' } }, { $set: { state: 'RECONCILIATION_REQUIRED' }, $inc: { version: 1 } }, { session });
          await Command.updateOne({ _id: intent.counterReceiptId, 'result.status': { $in: ['PENDING', 'EXPIRED'] } },
            { $set: { 'result.status': 'RECONCILIATION_REQUIRED' } }, { session });
        }
        await col('payments').insertOne({ bookingId: null, intentId, provider: 'PAYOS', providerEventId: eventId,
          providerTransactionReference: receipt.providerTransactionReference, state: 'RECONCILIATION_REQUIRED',
          receiptMoney: { amountVnd: receipt.amountVnd, currency: receipt.currency }, reconcileReason: failureReason,
          receivedAt: paidAt, version: 0, storageContractVersion: 1 }, { session });
        await Event.create([{ _id: key, type: 'PaymentReconciliationRequired', bookingId: null, resourceId: String(intentId), actorId: null, at: paidAt }], { session });
        if (receipt.providerCode === '00') await notifications.payment({ eventId: key, booking: null, reconciliation: true }, session);
        const result = { status: 'RECONCILIATION_REQUIRED', reason: failureReason };
        await Command.create([{ _id: key, fingerprint, result, createdAt: paidAt }], { session });
        return result;
      });
    },
    async settleVerified(actor, preview, receipt, session) {
      const created = await execute(actor, preview.input, receipt, session, preview.totals);
      return { ...paidResult({ ...created, receiptId: receipt.id }), receivedBy: actor.userId, paidAt: receipt.paidAt,
        method: preview.input.paymentMethod, bookingAmountVnd: created.booking?.totalVnd ?? 0,
        groomingAmountVnd: created.appointment?.pricing.totalVnd ?? 0 };
    },
    async slots(actor, body) {
      staffOnly(actor);
      exact(body, ['customerId', 'date', 'pets'], ['customerId', 'date', 'pets']);
      id(body.customerId);
      if (!isGroomingDate(body.date)) fail('VALIDATION_FAILED', 'Valid date required');
      if (!Array.isArray(body.pets)) fail('VALIDATION_FAILED', 'Select shop pets');
      if (!body.pets.length) return { slots: [] };
      return grooming.slots.list(body.customerId, groomingSlotsInput({ date: body.date, pets: body.pets }), { counter: true });
    },
    async preview(actor, body) {
      const staffId = staffOnly(actor), input = counterBookingInput(body);
      await assertFinanceSourceStorage(connection);
      const rollback = new Error('COUNTER_PREVIEW_ROLLBACK');
      let totals;
      try {
        await uow.run(async session => {
          const result = await execute(actor, input, { id: digest(['preview', String(new Types.ObjectId())]), paidAt: now() }, session);
          totals = { subtotalVnd: result.subtotalVnd, tierDiscountVnd: result.tierDiscountVnd, pickupFeeVnd: result.pickupFeeVnd, totalVnd: result.totalVnd };
          throw rollback; // validate capacity and both domains without retaining any bookings, receipts or codes
        });
      } catch (error) { if (error !== rollback) throw error; }
      const record = await DecisionSnapshot.create({ ownerId: input.customerId, kind: 'COUNTER_BOOKING', requestHash: digest(input),
        expiresAt: new Date(clock() + PREVIEW_MS), snapshot: { staffId, input, totals } });
      return { ...totals, previewId: String(record._id), expiresAt: record.expiresAt };
    },
    async checkout(actor, body, key) {
      const staffId = staffOnly(actor);
      exact(body, ['previewId'], ['previewId']);
      const previewId = id(body.previewId);
      if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail('VALIDATION_FAILED', 'Idempotency key required');
      const receiptId = digest([staffId, 'COUNTER_BOOKING', key]), fingerprint = digest(body);
      await assertFinanceSourceStorage(connection);
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await uow.run(async session => {
            await guardStaff(actor, session);
            const prior = await Command.findById(receiptId).session(session).lean();
            if (prior) {
              if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Checkout key reused', 409);
              return prior.result;
            }
            const preview = await readPreview(actor, previewId, session);
            const claim = 'counter-preview:' + previewId;
            if (await Command.exists({ _id: claim }).session(session)) fail('QUOTE_ALREADY_USED', 'Counter preview already confirmed', 409);
            const paidAt = now();
            if (preview.input.paymentMethod === 'COUNTER_VIETQR') {
              if (!provider || !webOrigin) fail('PAYMENT_PROVIDER_UNAVAILABLE', 'Counter VietQR is unavailable', 503);
              const intentId = new Types.ObjectId(), expiresAt = new Date(clock() + 15 * 60000);
              const created = await execute(actor, preview.input,
                { id: receiptId, phase: 'PENDING', paidAt, expiresAt }, session, preview.totals);
              const result = { status: 'PENDING', paid: false, receiptId, intentId: String(intentId), receivedBy: staffId,
                totalVnd: preview.totals.totalVnd, method: 'COUNTER_VIETQR', expiresAt,
                bookingId: created.booking?.id ?? null, appointmentId: created.appointment?.id ?? null };
              await col('paymentintents').insertOne({ _id: intentId, kind: 'COUNTER_BOOKING', provider: 'PAYOS',
                providerReference: String(randomInt(1000000000, 9999999999)), state: 'PENDING', version: 0,
                amountVnd: result.totalVnd, currency: 'VND', expiresAt, customerId: oid(preview.input.customerId),
                counterReceiptId: receiptId, counterStaffId: staffId, counterPreview: preview,
                ...(created.booking ? { bookingId: oid(created.booking.id) } : {}),
                ...(created.appointment ? { groomingAppointmentId: oid(created.appointment.id) } : {}),
                createdAt: paidAt }, { session });
              await Command.create([{ _id: receiptId, fingerprint, result, createdAt: paidAt },
                { _id: claim, fingerprint, result: { receiptId }, createdAt: paidAt }], { session, ordered: true });
              return result;
            }
            const created = await execute(actor, preview.input, { id: receiptId, paidAt }, session, preview.totals);
            const result = { ...paidResult({ ...created, receiptId }), receivedBy: staffId, paidAt,
              method: preview.input.paymentMethod, bookingAmountVnd: created.booking?.totalVnd ?? 0,
              groomingAmountVnd: created.appointment?.pricing.totalVnd ?? 0 };
            await Command.create([{ _id: receiptId, fingerprint, result, createdAt: paidAt },
              { _id: claim, fingerprint, result: { receiptId }, createdAt: paidAt }], { session, ordered: true });
            return result;
          });
          return qrView(result);
        } catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
      }
    }
  };
}
