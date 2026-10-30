import { Types } from 'mongoose';
import { decisionSnapshotModels } from '../../models/decision-snapshot.model.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { bookingCheckoutInput } from '../../validators/booking-checkout.validator.js';
import { validatePricingSelection } from '../../validators/pricing-selection.validator.js';
import { exact, fail } from '../../validators/pet-care.validator.js';

export function createCheckoutAvailabilityService({ connection, repository, clock = Date.now, facilityAddress, facilityCoordinates }) {
  const { DecisionSnapshot } = decisionSnapshotModels(connection), { Pet, CustomerAddress } = petCareModels(connection);
  const col = name => connection.collection(name), oid = value => new Types.ObjectId(value);
  async function guard(actor, visit, session) {
    if (!repository) fail('SCHEDULING_UNAVAILABLE', 'Employee scheduling unavailable', 503);
    const sitterId = String(visit.requestedSitterId);
    const published = await col('sitterpublicprofiles').findOne({ userId: oid(sitterId), state: 'APPROVED' }, { session });
    if (!published) fail('SITTER_NOT_ELIGIBLE', 'Employee is no longer publicly available', 409);
    await repository.employeeGuard(sitterId, session);
    await repository.eligible(sitterId, visit, session);
  }
  return {
    guard,
    async search(actor, body) {
      if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('CUSTOMER') || actor.synthetic) fail('FORBIDDEN', 'Customer required', 403);
      if (!repository) fail('SCHEDULING_UNAVAILABLE', 'Employee scheduling unavailable', 503);
      exact(body, ['quoteId', 'visit'], ['quoteId', 'visit']);
      const input = bookingCheckoutInput({ quoteId: body.quoteId, visits: [body.visit], acceptServicePolicies: true }), row = input.visits[0];
      const quote = await DecisionSnapshot.findOne({ _id: input.quoteId, ownerId: actor.userId, kind: 'QUOTE', expiresAt: { $gt: new Date(clock()) } }).select('+snapshot').lean();
      if (!quote) fail('RESOURCE_NOT_FOUND', 'Current owned quote required', 404);
      const raw = quote.snapshot.input?.items?.[row.itemIndex];
      if (!raw) fail('VALIDATION_FAILED', 'Quoted item required');
      const selection = validatePricingSelection(raw), quoted = quote.snapshot.result?.items?.[row.itemIndex];
      const presentation = await col('servicepresentations').findOne({ serviceId: oid(selection.serviceId) });
      if (!presentation?.locations?.includes(row.location)) fail('VALIDATION_FAILED', 'Service location unsupported');
      const pets = await Pet.find({ _id: { $in: selection.petIds }, ownerId: actor.userId, state: 'ACTIVE' }).lean();
      if (pets.length !== selection.petIds.length || pets.some(pet => !quoted?.petVersions?.some(p => p.id === String(pet._id) && p.version === pet.version)))
        fail('QUOTE_CHANGED', 'Pet profile changed', 409);
      if (selection.dayCount) return { sitters: [], status: 'STAFF_CARE_PLAN_REQUIRED', complete: true };
      const address = row.location !== 'FACILITY' && await CustomerAddress.findOne({ _id: row.addressId, ownerId: actor.userId, state: 'ACTIVE', pointConfirmedAt: { $ne: null } }).select('+point').lean();
      if (row.location !== 'FACILITY' && !address) fail('RESOURCE_NOT_FOUND', 'Owned confirmed address required', 404);
      const visit = { ...row, serviceId: selection.serviceId, endAt: new Date(row.startAt.getTime() + selection.durationMinutes * 60000),
        areaCode: address?.areaCode ?? 'DISTRICT_HAI_BA_TRUNG', snapshots: { pets, serviceAddress: facilityAddress,
          point: address?.point ?? (facilityCoordinates ? { type: 'Point', coordinates: facilityCoordinates } : undefined) } };
      if (row.location === 'FACILITY' && !facilityAddress) fail('FACILITY_ADDRESS_REQUIRED', 'Facility address unavailable', 409);
      const profiles = await col('sitterpublicprofiles').find({ state: 'APPROVED' }, { projection: { userId: 1 } }).sort({ userId: 1 }).limit(101).toArray();
      const sitters = [], deadline = Date.now() + 10000;
      let scanned = 0;
      for (const profile of profiles.slice(0, 100)) {
        if (Date.now() >= deadline) break;
        scanned++;
        const user = await col('users').findOne({ _id: profile.userId, state: 'ACTIVE', roles: 'PET_SITTER', synthetic: { $ne: true } }, { projection: { displayName: 1 } });
        const status = await col('sitterstatuses').findOne({ userId: profile.userId, status: 'ACTIVE' });
        if (!user || !status) continue;
        try {
          await repository.eligible(String(user._id), visit);
          sitters.push({ id: String(user._id), displayName: user.displayName });
        } catch (error) { if (error.status !== 409) throw error; }
      }
      const complete = profiles.length <= 100 && scanned === profiles.length;
      return { sitters, complete, status: sitters.length ? 'AVAILABLE' : complete ? 'NO_ELIGIBLE_SITTER' : 'SEARCH_INCOMPLETE' };
    }
  };
}
