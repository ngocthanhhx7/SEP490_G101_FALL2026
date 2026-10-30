import { randomInt } from 'node:crypto';
import { Types } from 'mongoose';
import { bookingCheckoutInput } from '../../validators/booking-checkout.validator.js';
import { validatePricingSelection } from '../../validators/pricing-selection.validator.js';
import { fail, id, digest } from '../../validators/pet-care.validator.js';
import { decisionSnapshotModels } from '../../models/decision-snapshot.model.js';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { notificationModels } from '../../models/notification.model.js';
import { serviceVersionModel } from '../../models/service-version.model.js';
import { servicePolicyVersionModel } from '../../models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../../models/service-price-version.model.js';
import { servicePresentationModel } from '../../models/service-presentation.model.js';
import { systemSettingVersionModel } from '../../models/system-setting-version.model.js';
import { pricingModels } from '../../models/pricing.model.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { checkoutVisitMoney, CHECKOUT_POLICY_VERSION, PREPAY_WINDOW_MS } from './checkout-snapshot.service.js';

export function createBookingCheckoutService({ connection, clock = Date.now, provider, webOrigin, facilityAddress, facilityCoordinates }) {
  const { DecisionSnapshot } = decisionSnapshotModels(connection), { Pet, CustomerAddress } = petCareModels(connection);
  const { Notification } = notificationModels(connection);
  const { FinanceSourceCommand: commands, FinanceSourceEvent: events } = financeSourceModels(connection);
  const Version = serviceVersionModel(connection), Policy = servicePolicyVersionModel(connection), Price = servicePriceVersionModel(connection),
    Presentation = servicePresentationModel(connection), Setting = systemSettingVersionModel(connection), { PricingPolicy } = pricingModels(connection);
  const col = name => connection.db.collection(name), oid = value => new Types.ObjectId(value), now = () => new Date(clock());
  const uow = createUnitOfWork(connection);
  function customer(actor) {
    if (actor?.state !== 'ACTIVE' || actor.synthetic === true) fail('UNAUTHENTICATED', 'Authentication required', 401);
    id(actor.userId); if (!actor.roles?.includes('CUSTOMER')) fail('FORBIDDEN', 'Customer required', 403);
  }
  async function transact(work) {
    await assertFinanceSourceStorage(connection);
    for (let attempt = 0; ; attempt++) {
      try { return await uow.run(work); } catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
    }
  }
  async function owned(actor, bookingId, session) {
    const booking = await col('bookings').findOne({ _id: oid(bookingId), customerId: oid(actor.userId) }, { session });
    if (!booking) fail('RESOURCE_NOT_FOUND', 'Booking unavailable', 404); return booking;
  }
  async function view(booking, session) {
    const visits = booking.checkoutSnapshot?.customerVisits ?? await col('visits').find({ bookingId: booking._id }, { session }).sort({ sequence: 1 }).limit(60).toArray();
    const actual = await col('visits').find({ _id: { $in: booking.visitIds ?? [] }, customerScheduleConsent: { $exists: true } }, { session }).limit(60).toArray();
    const careShifts = await col('visits').find({ _id: { $in: booking.visitIds ?? [] }, state: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
      { session, projection: { _id: 1, startAt: 1, endAt: 1, 'snapshots.serviceName': 1 } }).sort({ startAt: 1 }).limit(200).toArray();
    const proposals = await col('employeescheduleproposals').find({ bookingId: String(booking._id), customerId: String(booking.customerId) }, { session,
      projection: { _id: 1, state: 1, expiresAt: 1 } }).sort({ _id: -1 }).limit(20).toArray();
    const expired = booking.state === 'AWAITING_PAYMENT' && booking.paymentDeadlineAt <= now();
    return { id: String(booking._id), state: expired ? 'PAYMENT_EXPIRED' : booking.state, version: booking.version,
      paymentState: booking.paymentState, paymentMode: booking.paymentMode, totalVnd: booking.paymentSnapshot.amountVnd,
      currency: 'VND', paymentDeadlineAt: booking.paymentDeadlineAt, quoteId: String(booking.quoteId),
      scheduleProposals: proposals.map(row => ({ id: String(row._id), state: row.state, expiresAt: row.expiresAt })),
      careShifts: careShifts.map(row => ({ id: String(row._id), startAt: row.startAt, endAt: row.endAt, serviceName: row.snapshots?.serviceName })),
      visits: visits.map(row => ({ id: String(row._id), state: row.state,
        startAt: actual.find(visit => visit.customerVisitId === String(row._id))?.startAt ?? row.startAt,
        endAt: actual.find(visit => visit.customerVisitId === String(row._id))?.endAt ?? row.endAt,
        serviceName: row.snapshots.serviceName, location: row.location, serviceAddress: row.snapshots.serviceAddress,
        requestedSitterId: row.requestedSitterId && String(row.requestedSitterId) })) };
  }
  return {
    async options(actor) {
      customer(actor);
      const sitters = await col('sitterpublicprofiles').aggregate([
        { $match: { state: 'APPROVED' } }, { $sort: { userId: 1 } }, { $limit: 100 },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } }, { $unwind: '$user' },
        { $match: { 'user.state': 'ACTIVE', 'user.roles': 'PET_SITTER' } },
        { $lookup: { from: 'sitterstatuses', localField: 'userId', foreignField: 'userId', as: 'status' } }, { $unwind: '$status' },
        { $match: { 'status.status': 'ACTIVE' } }, { $project: { _id: 0, id: { $toString: '$userId' }, displayName: '$user.displayName' } }
      ]).toArray();
      return { facilityAddress: facilityAddress ?? null, sitters, paymentWindowMinutes: 15, policyVersion: CHECKOUT_POLICY_VERSION };
    },
    async confirm(actor, body, key) {
      customer(actor); const input = bookingCheckoutInput(body);
      if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail('VALIDATION_FAILED', 'Idempotency key required');
      const fingerprint = digest(input), commandId = digest([actor.userId, 'BOOKING_CHECKOUT', key]);
      return transact(async session => {
        const previous = await commands.findById(commandId).session(session).lean();
        if (previous) {
          if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_REUSED', 'Checkout key already used', 409);
          return view(await owned(actor, previous.result.bookingId, session), session);
        }
        const quoteClaim = `checkout-quote:${input.quoteId}`;
        if (await commands.exists({ _id: quoteClaim }).session(session)) fail('QUOTE_ALREADY_USED', 'Quote already confirmed', 409);
        const at = now();
        const quote = await DecisionSnapshot.findOne({ _id: input.quoteId, ownerId: actor.userId, kind: 'QUOTE', expiresAt: { $gt: at } }).select('+snapshot').session(session).lean();
        if (!quote) fail('RESOURCE_NOT_FOUND', 'Quote unavailable or expired', 404);
        const result = quote.snapshot.result, selections = quote.snapshot.input?.items?.map(validatePricingSelection);
        if (!selections || !Array.isArray(result.items) || selections.length !== result.items.length || result.currency !== 'VND')
          fail('QUOTE_REVIEW_REQUIRED', 'Use a current basket quote', 409);
        const money = checkoutVisitMoney(result);
        if (input.visits.length !== money.length) fail('VALIDATION_FAILED', 'Schedule every quoted visit');
        const deadline = new Date(at.getTime() + PREPAY_WINDOW_MS), prepay = money.length > 1 || selections.some(row => row.dayCount > 1);
        const visible = await Setting.findOne({ key: 'SERVICE_CATALOG_VISIBLE', effectiveAt: { $lte: at } }).sort({ effectiveAt: -1, version: -1 }).session(session).lean();
        if (visible?.enabled !== true) fail('SERVICE_UNAVAILABLE', 'Catalogue unavailable', 409);
        const bookingId = new Types.ObjectId(), visits = [], seenPets = new Set(), seenAddresses = new Set();
        for (let itemIndex = 0; itemIndex < selections.length; itemIndex++) {
          const selection = selections[itemIndex], quoted = result.items[itemIndex];
          const filter = { serviceId: oid(selection.serviceId), effectiveAt: { $lte: at } };
          const version = await Version.findOne(filter).sort({ effectiveAt: -1, version: -1 }).session(session).lean();
          const price = await Price.findOne(filter).sort({ effectiveAt: -1, version: -1 }).session(session).lean();
          const policy = await Policy.findOne(filter).sort({ effectiveAt: -1, version: -1 }).session(session).lean();
          const pricing = await PricingPolicy.findOne({ ...filter, status: 'APPROVED', approvedAt: { $lte: at, $ne: null } }).sort({ version: -1 }).session(session).lean();
          const presentation = await Presentation.findOne({ serviceId: selection.serviceId }).session(session).lean();
          if (version?.state !== 'ACTIVE' || version.version !== quoted.serviceVersion || price?.version !== quoted.priceVersion ||
            pricing?.version !== quoted.policyVersion || policy?.state !== 'PUBLISHED' || policy.version !== quoted.servicePolicyVersion)
            fail('QUOTE_CHANGED', 'Service, price or policy changed; quote again', 409);
          if (pricing.billingMode === 'PER_VISIT' && selection.durationMinutes !== presentation?.durationMinutes)
            fail('QUOTE_CHANGED', 'Use the published service duration', 409);
          const pets = await Pet.find({ _id: { $in: selection.petIds }, ownerId: actor.userId, state: 'ACTIVE' }).session(session).lean();
          if (pets.length !== selection.petIds.length || pets.some(pet => !quoted.petVersions.some(p => p.id === String(pet._id) && p.version === pet.version)))
            fail('QUOTE_CHANGED', 'Pet profile changed; quote again', 409);
          for (const pet of pets) if (!seenPets.has(String(pet._id))) {
            const changed = await Pet.collection.updateOne({ _id: pet._id, version: pet.version, ownerId: oid(actor.userId), state: 'ACTIVE' }, { $inc: { bookingGuard: 1 } }, { session });
            if (!changed.matchedCount) fail('QUOTE_CHANGED', 'Pet profile changed', 409); seenPets.add(String(pet._id));
          }
          const scheduled = input.visits.filter(row => row.itemIndex === itemIndex), amounts = money.filter(row => row.itemIndex === itemIndex);
          if (scheduled.length !== quoted.visitCount) fail('VALIDATION_FAILED', 'Visit count must match each service');
          for (const [index, row] of scheduled.entries()) {
            if (row.requestedSitterId) {
              const published = await col('sitterpublicprofiles').findOne({ userId: oid(row.requestedSitterId), state: 'APPROVED' }, { session });
              const employee = await col('users').findOne({ _id: oid(row.requestedSitterId), state: 'ACTIVE', roles: 'PET_SITTER' }, { session });
              const status = await col('sitterstatuses').findOne({ userId: oid(row.requestedSitterId), status: 'ACTIVE' }, { session });
              if (!published || !employee || !status) fail('RESOURCE_NOT_FOUND', 'Selected employee is not available publicly', 404);
            }
            if (!presentation?.locations?.includes(row.location)) fail('VALIDATION_FAILED', 'Service location unsupported');
            if (row.startAt <= (prepay ? deadline : at)) fail('VALIDATION_FAILED', 'Visit must start after payment window');
            let serviceAddress = facilityAddress, areaCode = 'DISTRICT_HAI_BA_TRUNG', point = facilityCoordinates ? { type: 'Point', coordinates: [...facilityCoordinates] } : undefined;
            if (row.location !== 'FACILITY') {
              const address = await CustomerAddress.findOne({ _id: row.addressId, ownerId: actor.userId, state: 'ACTIVE', pointConfirmedAt: { $ne: null } }).select('+location +point').session(session).lean();
              if (!address) fail('RESOURCE_NOT_FOUND', 'Owned confirmed address unavailable', 404);
              serviceAddress = address.location;
              areaCode = address.areaCode;
              point = address.point;
              if (!seenAddresses.has(String(address._id))) {
                const changed = await CustomerAddress.collection.updateOne({ _id: address._id, version: address.version, state: 'ACTIVE' }, { $inc: { bookingGuard: 1 } }, { session });
                if (!changed.matchedCount) fail('QUOTE_CHANGED', 'Address changed', 409); seenAddresses.add(String(address._id));
              }
            }
            if (typeof serviceAddress !== 'string' || !serviceAddress.trim()) fail('FACILITY_ADDRESS_REQUIRED', 'Facility address must be configured', 409);
            const boarding = pricing.billingMode === 'PER_DAY';
            const endAt = new Date(row.startAt.getTime() + (boarding ? selection.dayCount * 1440 : selection.durationMinutes) * 60000);
            visits.push({ _id: new Types.ObjectId(), bookingId, customerId: oid(actor.userId), serviceId: oid(selection.serviceId),
              petIds: pets.map(p => p._id), sitterId: null, state: 'SCHEDULED', version: 0, sequence: visits.length,
              areaCode, requestedSitterId: row.requestedSitterId ? oid(row.requestedSitterId) : null,
              location: row.location, ...(row.addressId ? { addressId: oid(row.addressId) } : {}), startAt: row.startAt, endAt,
              evidenceRefs: [], snapshots: { ...amounts[index], boarding, serviceName: version.name, serviceAddress, ...(point ? { point } : {}),
                serviceScope: version.scope, checklistItemIds: ['service-scope', 'pet-condition'],
                checklistItems: [{ itemId: 'service-scope', label: version.scope }, { itemId: 'pet-condition', label: 'Ghi nhận tình trạng thú cưng sau chăm sóc' }],
                serviceVersion: version.version, servicePolicyVersion: policy.version, priceVersion: price.version, pricingPolicyVersion: pricing.version,
                careMinutes: selection.durationMinutes, ...(selection.dayCount ? { dayCount: selection.dayCount } : {}),
                ...(selection.distanceMeters ? { distanceMeters: selection.distanceMeters } : {}),
                pets: pets.map(p => ({ id: String(p._id), name: p.name, species: p.species, weightKg: p.weightKg, traits: p.traits, version: p.version })) } });
          }
        }
        for (let a = 0; a < visits.length; a++) for (let b = a + 1; b < visits.length; b++) {
          if (visits[a].startAt < visits[b].endAt && visits[b].startAt < visits[a].endAt && visits[a].petIds.some(p => visits[b].petIds.some(q => String(p) === String(q))))
            fail('VISIT_SCHEDULE_OVERLAP', 'A pet cannot attend overlapping visits', 409);
        }
        const booking = { _id: bookingId, customerId: oid(actor.userId), quoteId: quote._id, quoteVersion: 1,
          originalVisitCount: visits.length, visitIds: visits.map(row => row._id), state: prepay ? 'AWAITING_PAYMENT' : 'DISPATCH_PENDING',
          paymentMode: prepay ? 'PREPAY' : 'POSTPAY', paymentState: 'UNPAID', paymentSnapshot: { amountVnd: result.totalVnd, currency: 'VND' },
          ...(prepay ? { paymentDeadlineAt: deadline } : {}), version: 0, financeGuardVersion: 0, createdAt: at,
          carePlanState: 'NEEDS_REVIEW', careVisitCount: visits.length,
          checkoutSnapshot: { quote: result, selections, customerVisits: visits, consentAt: at, policyVersion: CHECKOUT_POLICY_VERSION } };
        await col('bookings').insertOne(booking, { session }); await col('visits').insertMany(visits, { session });
        if (prepay) await col('paymentintents').insertOne({ _id: new Types.ObjectId(), bookingId, customerId: oid(actor.userId), provider: 'PAYOS',
          providerReference: String(randomInt(1000000000000, 200000000000000)), amountVnd: result.totalVnd, currency: 'VND',
          state: 'PENDING', version: 0, expiresAt: deadline, createdAt: at }, { session });
        await commands.create([{ _id: commandId, fingerprint, result: { bookingId: String(bookingId) }, createdAt: at },
          { _id: quoteClaim, fingerprint, result: { bookingId: String(bookingId) }, createdAt: at }], { session, ordered: true });
        await events.create([{ _id: `booking-created:${bookingId}`, type: 'BookingCreated', bookingId: String(bookingId),
          actorId: actor.userId, resourceId: String(bookingId), at }], { session });
        await Notification.create([{ _id: digest(['BOOKING_CREATED', String(bookingId)]), eventId: `booking:${bookingId}`,
          recipientId: actor.userId, role: 'CUSTOMER', eventType: 'BOOKING_CREATED', title: 'Đã tiếp nhận đơn chăm sóc',
          message: prepay ? 'Đơn đã được tạo. Vui lòng hoàn tất bước thanh toán trong thời hạn của đơn.' : 'Đơn đã được tạo và đang chờ xác nhận kế hoạch chăm sóc.',
          deepLink: '/account/bookings', createdAt: at }], { session });
        return view(booking, session);
      });
    },
    async read(actor, bookingId) {
      customer(actor); id(bookingId); await assertFinanceSourceStorage(connection); return view(await owned(actor, bookingId));
    },
    async paymentLink(actor, bookingId, key) {
      customer(actor); id(bookingId); await assertFinanceSourceStorage(connection);
      if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail('VALIDATION_FAILED', 'Idempotency key required');
      const booking = await owned(actor, bookingId);
      if (booking.state !== 'AWAITING_PAYMENT' || booking.paymentState !== 'UNPAID' || booking.paymentDeadlineAt <= now()) fail('INVALID_STATE', 'Booking is not payable', 409);
      let intent = await col('paymentintents').findOne({ bookingId: booking._id, provider: 'PAYOS', state: 'PENDING' });
      if (!intent) fail('RESOURCE_NOT_FOUND', 'Payment intent unavailable', 404);
      if (intent.checkoutUrl) return { checkoutUrl: intent.checkoutUrl, expiresAt: intent.expiresAt };
      if (!provider || !webOrigin) fail('PAYMENT_PROVIDER_UNAVAILABLE', 'Payment link provider is unavailable', 503);
      if (intent.linkState) fail('PAYMENT_LINK_RECONCILIATION_REQUIRED', 'Existing provider request awaits reconciliation', 409);
      intent = await col('paymentintents').findOneAndUpdate({ _id: intent._id, state: 'PENDING', linkState: { $exists: false } },
        { $set: { linkState: 'CREATING', linkRequestedAt: now() } }, { returnDocument: 'after' });
      if (!intent) fail('COMMAND_PENDING', 'A link request is already running', 409);
      try {
        const link = await provider.createPaymentLink({ orderCode: Number(intent.providerReference), amount: intent.amountVnd,
          description: 'PAWWORLD', expiredAt: Math.floor(intent.expiresAt.getTime() / 1000),
          returnUrl: new URL(`/services?booking=${bookingId}`, webOrigin).href, cancelUrl: new URL(`/services?booking=${bookingId}`, webOrigin).href });
        const url = new URL(link.checkoutUrl);
        if (url.origin !== 'https://pay.payos.vn' || !url.pathname.startsWith('/web/') || link.orderCode !== Number(intent.providerReference) || link.amount !== intent.amountVnd || link.currency !== 'VND')
          fail('PAYMENT_LINK_RECONCILIATION_REQUIRED', 'Provider link does not match intent', 502);
        await col('paymentintents').updateOne({ _id: intent._id, linkState: 'CREATING' }, { $set: { linkState: 'READY', checkoutUrl: url.href, paymentLinkId: link.paymentLinkId } });
        return { checkoutUrl: url.href, expiresAt: intent.expiresAt };
      } catch (error) {
        await col('paymentintents').updateOne({ _id: intent._id, linkState: 'CREATING' }, { $set: { linkState: 'RECONCILIATION_REQUIRED' } }); throw error;
      }
    }
  };
}
