import { Types } from 'mongoose';
import { workflowProjection } from '../care/workflow-snapshot.service.js';
import { DEMO_WORK_AREAS } from '../../constants/demo-work-areas.js';
import { hasRole } from '../../utils/roles.js';
import { fail, id } from '../../validators/pet-care.validator.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';

const CARE_FIELDS = ['feeding', 'handling', 'health', 'allergies', 'medication'];
const areas = new Map(DEMO_WORK_AREAS.map(({ code, label }) => [code, label]));
const oid = value => new Types.ObjectId(value);
const validOid = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const money = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const personName = (names, id) => names.get(String(id)) ?? null;
const validTimestamp = value => {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

function savedTerms(visit, names, areaNames) {
  const snapshot = visit.snapshots ?? {};
  return {
    serviceName: snapshot.serviceName ?? null,
    durationMinutes: snapshot.careMinutes ?? null,
    serviceAddress: snapshot.serviceAddress ?? null,
    areaName: areaNames.get(visit.areaCode) ?? areas.get(visit.areaCode) ?? visit.areaCode ?? null,
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
    tierDiscountVnd: money(quote?.tierDiscountVnd),
    tierCode: quote?.tier?.code ?? null,
    subtotalVnd: money(quote?.subtotalVnd),
    orderFeeVnd: money(quote?.orderFeeVnd),
    totalVnd: money(quote?.totalVnd) ?? money(booking.paymentSnapshot?.amountVnd)
  };
}

function savedPolicies(booking) {
  const snapshot = booking.checkoutSnapshot;
  const items = snapshot?.quote?.items;
  if (!snapshot?.consentAt || !Array.isArray(items)) return [];
  return items.slice(0, 60).flatMap((item, index) => {
    const { servicePolicy, servicePolicyVersion, visitCount } = item ?? {};
    if (!Number.isSafeInteger(servicePolicyVersion) || servicePolicyVersion < 1
      || typeof servicePolicy?.title !== 'string' || typeof servicePolicy.body !== 'string') return [];
    return [{ item: index + 1, version: servicePolicyVersion, title: servicePolicy.title, body: servicePolicy.body,
      visitCount: Number.isSafeInteger(visitCount) && visitCount > 0 ? visitCount : null }];
  });
}

export function createBookingDetailsService({ connection, clock = Date.now }) {
  async function project(booking, { includeCustomerName = false } = {}) {
    const original = booking.checkoutSnapshot?.customerVisits ?? [];
    const codes = [...new Set(original.map(visit => visit.areaCode).filter(code => typeof code === 'string'))];
    const areaRows = codes.length ? await connection.db.collection('serviceareas').find({ _id: { $in: codes } },
      { projection: { label: 1 }, maxTimeMS: 2000 }).limit(60).toArray() : [];
    const areaNames = new Map(areaRows.map(area => [area._id, area.label]));
    const visits = await connection.db.collection('visits').find({
      bookingId: booking._id, state: { $ne: 'SUPERSEDED' },
      ...(booking.visitIds?.length ? { _id: { $in: booking.visitIds } } : {})
    }, { projection: { startAt: 1, endAt: 1, state: 1, sitterId: 1, customerVisitId: 1, bookingChangeRequestId: 1, checkInAt: 1, checkOutAt: 1, cancelledAt: 1, cancellationFeeVnd: 1, cancellationReason: 1, checklist: 1, 'snapshots.checklistItems': 1, 'snapshots.workflow': 1, 'snapshots.pets': 1, workflowResults: 1, location: 1, evidenceRefs: 1,
      ...(includeCustomerName ? {} : { customerNote: 1 }) }, maxTimeMS: 2000 })
      .sort({ startAt: 1, _id: 1 }).limit(60).toArray();
    const refundRows = await connection.db.collection('refunds').find({
      bookingId: booking._id,
      state: { $in: ['RECORDED', 'APPROVED', 'TRANSFER_PENDING', 'PAID'] }
    }, { projection: { visitId: 1, sourceType: 1, state: 1, amountVnd: 1, lateFeeVnd: 1, comboDiscountAdjustmentVnd: 1, reason: 1, recordedAt: 1 }, maxTimeMS: 2000 })
      .sort({ recordedAt: -1, _id: -1 }).limit(60).toArray();
    const changeIds = [...new Set(visits.map(visit => visit.bookingChangeRequestId).filter(Boolean).map(String))]
      .filter(validOid).map(oid);
    const unassignedVisitIds = visits.filter(visit => visit.state === 'SCHEDULED' && !visit.sitterId).map(visit => visit._id);
    const ids = [...new Set([
      ...(includeCustomerName ? [booking.customerId] : []),
      ...original.map(visit => visit.requestedSitterId),
      ...visits.map(visit => visit.sitterId)
    ].filter(Boolean).map(String))].filter(validOid);
    const [users, approvedChanges, pendingOffers] = await Promise.all([
      ids.length ? connection.db.collection('users').find({ _id: { $in: ids.map(oid) } },
        { projection: { displayName: 1 }, maxTimeMS: 2000 }).toArray() : Promise.resolve([]),
      changeIds.length ? connection.db.collection('bookingchangerequests').find(
        { _id: { $in: changeIds }, state: 'APPROVED' },
        { projection: { items: 1 }, maxTimeMS: 2000 }
      ).limit(changeIds.length).toArray() : Promise.resolve([]),
      unassignedVisitIds.length ? connection.db.collection('employeevisitoffers').distinct('visitId',
        { visitId: { $in: unassignedVisitIds }, state: 'PENDING', deadline: { $gt: new Date(clock()) } },
        { maxTimeMS: 2000 }
      ) : Promise.resolve([])
    ]);
    const names = new Map(users.map(user => [String(user._id), user.displayName]));
    const changesById = new Map(approvedChanges.map(change => [String(change._id), change]));
    const pendingOfferVisitIds = new Set(pendingOffers.map(String));
    const bookingCode = booking.bookingCode ?? booking.code ?? null;
    const previousSlotFor = visit => {
      if (!visit.bookingChangeRequestId) return {};
      const change = changesById.get(String(visit.bookingChangeRequestId));
      const item = change?.items?.find(entry => String(entry.visitId) === String(visit._id));
      const oldStartMs = validTimestamp(item?.oldStartAt);
      const currentStartMs = validTimestamp(visit.startAt);
      if (oldStartMs === null || currentStartMs === null || oldStartMs === currentStartMs) return {};
      const oldEndMs = validTimestamp(item?.oldEndAt);
      return {
        previousStartAt: item.oldStartAt,
        ...(oldEndMs !== null ? { previousEndAt: item.oldEndAt } : {})
      };
    };
    return {
      ...(bookingCode ? { bookingCode } : {}),
      ...(includeCustomerName ? { customerName: personName(names, booking.customerId) } : {}),
      details: {
        consentAt: booking.checkoutSnapshot?.consentAt ?? null,
        servicePolicies: savedPolicies(booking),
        terms: original.map(visit => {
          const saved = savedTerms(visit, names, areaNames);
          const actual = visits.filter(row => row.customerVisitId === String(visit._id));
          return actual.length === 1 ? { ...saved, startAt: actual[0].startAt, endAt: actual[0].endAt } : saved;
        }).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)),
        visits: visits.map(visit => ({
          id: String(visit._id), ...(visit.snapshots?.workflow ? { workflow: workflowProjection(visit, { customer: !includeCustomerName }) } : {}), startAt: visit.startAt ?? null, endAt: visit.endAt ?? null,
          ...previousSlotFor(visit),
          ...(pendingOfferVisitIds.has(String(visit._id)) ? { hasPendingOffer: true } : {}),
          checkInAt: visit.checkInAt ?? null, checkOutAt: visit.checkOutAt ?? null,
          ...(!includeCustomerName && !visit.snapshots?.workflow && visit.customerNote ? { customerNote: visit.customerNote } : {}),
          checklist: (visit.checklist ?? []).slice(0, 100).map(item => ({ itemId: item.itemId,
            label: visit.snapshots?.checklistItems?.find(row => row.itemId === item.itemId)?.label ?? item.itemId,
            status: item.status, ...(item.reason ? { reason: item.reason } : {}) })),
          evidence: (visit.evidenceRefs ?? []).filter(item => ['CHECK_IN','CHECK_OUT'].includes(item.kind) && /^[a-f0-9]{64}$/.test(item.mediaId)).slice(0,2)
            .map(({kind,mediaId}) => ({kind,mediaId})),
          state: visit.state, sitterName: personName(names, visit.sitterId),
          ...(visit.cancelledAt ? { cancelledAt: visit.cancelledAt } : {}),
          ...(Number.isSafeInteger(visit.cancellationFeeVnd) ? { cancellationFeeVnd: visit.cancellationFeeVnd } : {}),
          ...(visit.cancellationReason ? { cancellationReason: visit.cancellationReason } : {})
        })),
        price: savedPrice(booking, original),
        refunds: refundRows.map(row => ({
          id: String(row._id),
          visitId: row.visitId ? String(row.visitId) : null,
          sourceType: row.sourceType ?? 'COMPLAINT',
          state: row.state ?? 'RECORDED',
          amountVnd: money(row.amountVnd) ?? 0,
          lateFeeVnd: money(row.lateFeeVnd) ?? 0,
          comboDiscountAdjustmentVnd: money(row.comboDiscountAdjustmentVnd) ?? 0,
          reason: row.reason ?? null,
          recordedAt: row.recordedAt ?? null
        }))
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
      return {
        id: String(booking._id),
        state: booking.state,
        paymentMode: booking.paymentMode,
        paymentState: booking.paymentState,
        ...(booking.paymentMode === 'PREPAY' ? { paymentDeadlineAt: booking.paymentDeadlineAt } : {}),
        ...await project(booking, { includeCustomerName: true })
      };
    }
  };
}
