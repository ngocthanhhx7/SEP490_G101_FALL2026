import { Types } from 'mongoose';
import { DEMO_WORK_AREAS } from '../../constants/demo-work-areas.js';
import { hasRole } from '../../utils/roles.js';
import { fail, id } from '../../validators/pet-care.validator.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';

const CARE_FIELDS = ['feeding', 'handling', 'health', 'allergies', 'medication'];
const areas = new Map(DEMO_WORK_AREAS.map(({ code, label }) => [code, label]));
const oid = value => new Types.ObjectId(value);
const money = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const personName = (names, id) => names.get(String(id)) ?? null;

function savedTerms(visit, names) {
  const snapshot = visit.snapshots ?? {};
  return {
    serviceName: snapshot.serviceName ?? null,
    durationMinutes: snapshot.careMinutes ?? null,
    serviceAddress: snapshot.serviceAddress ?? null,
    areaName: areas.get(visit.areaCode) ?? visit.areaCode ?? null,
    startAt: visit.startAt ?? null,
    endAt: visit.endAt ?? null,
    petNames: (snapshot.pets ?? []).map(pet => pet.name).filter(Boolean),
    requestedSitterName: personName(names, visit.requestedSitterId),
    careRequirements: (snapshot.care?.pets ?? []).flatMap(pet => CARE_FIELDS.flatMap(key => {
      const entry = pet.careProfile?.[key];
      return entry?.status === 'KNOWN' && typeof entry.value === 'string'
        ? [`${pet.name}: ${entry.value}`] : [];
    }))
  };
}

function savedPrice(booking, visits) {
  const quote = booking.checkoutSnapshot?.quote;
  const prices = visits.map(({ snapshots }) => {
    const base = money(snapshots?.baseVnd), surcharge = money(snapshots?.surchargeVnd);
    return base === null || surcharge === null ? null : money(base + surcharge);
  });
  return {
    visitCount: money(quote?.visitCount) ?? money(booking.originalVisitCount) ?? (visits.length || null),
    visitPricesVnd: prices.includes(null) ? [] : [...new Set(prices)].sort((a, b) => a - b),
    discountVnd: money(quote?.discountVnd),
    orderFeeVnd: money(quote?.orderFeeVnd),
    totalVnd: money(quote?.totalVnd) ?? money(booking.paymentSnapshot?.amountVnd)
  };
}

export function createBookingDetailsService({ connection, clock = Date.now }) {
  async function project(booking, { includeCustomerName = false } = {}) {
    const original = booking.checkoutSnapshot?.customerVisits ?? [];
    const visits = await connection.db.collection('visits').find({
      bookingId: booking._id, state: { $ne: 'SUPERSEDED' },
      ...(booking.visitIds?.length ? { _id: { $in: booking.visitIds } } : {})
    }, { projection: { startAt: 1, endAt: 1, state: 1, sitterId: 1 }, maxTimeMS: 2000 })
      .sort({ startAt: 1, _id: 1 }).limit(60).toArray();
    const ids = [...new Set([
      ...(includeCustomerName ? [booking.customerId] : []),
      ...original.map(visit => visit.requestedSitterId),
      ...visits.map(visit => visit.sitterId)
    ].filter(Boolean).map(String))].filter(value => /^[a-f\d]{24}$/i.test(value));
    const users = ids.length ? await connection.db.collection('users').find({ _id: { $in: ids.map(oid) } },
      { projection: { displayName: 1 }, maxTimeMS: 2000 }).toArray() : [];
    const names = new Map(users.map(user => [String(user._id), user.displayName]));
    return {
      ...(includeCustomerName ? { customerName: personName(names, booking.customerId) } : {}),
      details: {
        consentAt: booking.checkoutSnapshot?.consentAt ?? null,
        terms: original.map(visit => savedTerms(visit, names)),
        visits: visits.map(visit => ({
          id: String(visit._id), startAt: visit.startAt ?? null, endAt: visit.endAt ?? null,
          state: visit.state, sitterName: personName(names, visit.sitterId)
        })),
        price: savedPrice(booking, original)
      }
    };
  }

  return {
    project,
    async readStaff(actor, bookingId) {
      if (actor?.state !== 'ACTIVE' || actor.synthetic === true)
        fail('UNAUTHENTICATED', 'Authentication required', 401);
      if (!hasRole(actor.roles, 'STAFF')) fail('FORBIDDEN', 'Staff or Admin required', 403);
      id(bookingId);
      await assertFinanceSourceStorage(connection);
      const booking = await connection.db.collection('bookings').findOne({ _id: oid(bookingId) },
        { maxTimeMS: 2000 });
      if (!booking) fail('RESOURCE_NOT_FOUND', 'Booking unavailable', 404);
      const expired = booking.state === 'AWAITING_PAYMENT' && booking.paymentDeadlineAt <= new Date(clock());
      return {
        id: String(booking._id),
        state: expired ? 'PAYMENT_EXPIRED' : booking.state,
        paymentMode: booking.paymentMode,
        paymentState: booking.paymentState,
        ...(booking.paymentMode === 'PREPAY' ? { paymentDeadlineAt: booking.paymentDeadlineAt } : {}),
        ...await project(booking, { includeCustomerName: true })
      };
    }
  };
}
