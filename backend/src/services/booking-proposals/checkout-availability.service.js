import { HOME_BOOKING_NOTICE_MS } from '../../constants/booking-notice.js';
import { listPreviousPetSitters } from '../customer-care-history.service.js';
import { decisionSnapshotModels } from '../../models/decision-snapshot.model.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { bookingCheckoutInput } from '../../validators/booking-checkout.validator.js';
import { validatePricingSelection } from '../../validators/pricing-selection.validator.js';
import { exact, fail } from '../../validators/pet-care.validator.js';
import { readServicePresentation } from '../service-presentation.service.js';

export function createCheckoutAvailabilityService({ connection, repository, clock = Date.now, facilityAddress, facilityCoordinates }) {
  const { DecisionSnapshot } = decisionSnapshotModels(connection), { Pet, CustomerAddress } = petCareModels(connection);
  async function guard(actor, visit, session) {
    if (!repository) fail('SCHEDULING_UNAVAILABLE', 'Employee scheduling unavailable', 503);
    const sitterId = String(visit.requestedSitterId);
    await repository.employeeGuard(sitterId, session);
    await repository.eligible(sitterId, visit, session);
  }
  return {
    guard,
    async search(actor, body) {
      if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('CUSTOMER') || actor.synthetic) fail('FORBIDDEN', 'Customer required', 403);
      if (!repository) fail('SCHEDULING_UNAVAILABLE', 'Employee scheduling unavailable', 503);
      exact(body, ['quoteId', 'visit', 'directory', 'page'], ['quoteId', 'visit']);
      if ((body.directory !== undefined && body.directory !== true) || (body.page !== undefined && body.directory !== true)) fail('VALIDATION_FAILED', 'Invalid directory request');
      const input = bookingCheckoutInput({ quoteId: body.quoteId, visits: [body.visit], acceptServicePolicies: true }), row = input.visits[0];
      const at = clock();
      if (row.location === 'HOME' && row.startAt.getTime() < at + HOME_BOOKING_NOTICE_MS)
        fail('HOME_BOOKING_NOTICE_REQUIRED', 'At-home care must be booked at least 2 hours in advance');
      const quote = await DecisionSnapshot.findOne({ _id: input.quoteId, ownerId: actor.userId, kind: 'QUOTE', expiresAt: { $gt: new Date(at) } }).select('+snapshot').lean();
      if (!quote) fail('RESOURCE_NOT_FOUND', 'Current owned quote required', 404);
      const raw = quote.snapshot.input?.items?.[row.itemIndex];
      if (!raw) fail('VALIDATION_FAILED', 'Quoted item required');
      const selection = validatePricingSelection(raw), quoted = quote.snapshot.result?.items?.[row.itemIndex];
      const presentation = await readServicePresentation(connection, selection.serviceId);
      if (!presentation?.locations?.includes(row.location)) fail('VALIDATION_FAILED', 'Service location unsupported');
      const pets = await Pet.find({ _id: { $in: selection.petIds }, ownerId: actor.userId, state: 'ACTIVE' }).lean();
      if (pets.length !== selection.petIds.length || pets.some(pet => !quoted?.petVersions?.some(p => p.id === String(pet._id) && p.version === pet.version)))
        fail('QUOTE_CHANGED', 'Pet profile changed', 409);
      if (selection.dayCount) return { sitters: [], status: 'STAFF_CARE_PLAN_REQUIRED', complete: true };
      const address = row.location !== 'FACILITY' && await CustomerAddress.findOne({ _id: row.addressId, ownerId: actor.userId, state: 'ACTIVE', pointConfirmedAt: { $ne: null }, profileHidden: { $ne: true } }).select('+point').lean();
      if (row.location !== 'FACILITY' && !address) fail('RESOURCE_NOT_FOUND', 'Owned confirmed address required', 404);
      const visit = { ...row, serviceId: selection.serviceId, endAt: new Date(row.startAt.getTime() + selection.durationMinutes * 60000),
        areaCode: address?.areaCode ?? 'DISTRICT_HAI_BA_TRUNG', snapshots: { pets, serviceAddress: facilityAddress,
          point: address?.point ?? (facilityCoordinates ? { type: 'Point', coordinates: facilityCoordinates } : undefined) } };
      if (row.location === 'FACILITY' && !facilityAddress) fail('FACILITY_ADDRESS_REQUIRED', 'Facility address unavailable', 409);
      const previousSitters = await listPreviousPetSitters(connection.db, actor.userId, selection.petIds);
      const sitters = [], deadline = Date.now() + 10000;
      for (const sitter of previousSitters) {
        if (Date.now() >= deadline) {
          sitters.push({ ...sitter, eligible: false, unavailableReason: 'SCHEDULING_UNAVAILABLE' });
          continue;
        }
        try {
          await repository.eligible(sitter.id, visit);
          sitters.push({ ...sitter, eligible: true, unavailableReason: null });
        } catch (error) {
          if (error.status !== 409) throw error;
          sitters.push({ ...sitter, eligible: false, unavailableReason: error.code });
        }
      }
      return {
        sitters,
        nextPage: null,
        complete: true,
        status: sitters.length ? 'PREFERRED_SITTERS' : 'NO_PREVIOUS_SITTER'
      };
    }
  };
}
