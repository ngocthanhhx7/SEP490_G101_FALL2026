import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { pickupFeeForDistance } from '../pickup/pickup-fee-settings.service.js';

const fail = (code = 'PICKUP_DISTANCE_UNAVAILABLE', message = 'Driving distance is unavailable', status = 503) => {
  throw new AppError(status, code, message);
};
const isLngLat = point => Array.isArray(point) && point.length === 2
  && point.every(Number.isFinite) && point[0] >= -180 && point[0] <= 180
  && point[1] >= -90 && point[1] <= 90;

// OSRM's route/v1 returns METERS, not a straight-line distance and not seconds.
// Pickup does not use sitter matching's ETA cache or ranking data.
export function createPickupDrivingRoute({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!baseUrl || typeof baseUrl !== 'string') return async () => fail();
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000)
    throw new TypeError('Invalid pickup routing timeout');
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw new TypeError('Invalid OSRM routing base URL');
  return async (origin, destination) => {
    if (!isLngLat(origin) || !isLngLat(destination)) fail();
    const path = 'route/v1/driving/' + origin.join(',') + ';' + destination.join(',');
    const url = new URL(path, base.href.endsWith('/') ? base.href : base.href + '/');
    url.searchParams.set('overview', 'false');
    url.searchParams.set('steps', 'false');
    const controller = new globalThis.AbortController();
    let timer;
    try {
      timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
      if (!response?.ok) fail();
      const body = await response.json();
      if (body?.code !== 'Ok' || !Array.isArray(body.routes) || body.routes.length < 1
        || !Number.isFinite(body.routes[0]?.distance) || body.routes[0].distance < 0)
        fail();
      return body.routes[0].distance;
    } catch (error) {
      if (error instanceof AppError) throw error;
      fail();
    } finally { clearTimeout(timer); }
  };
}

export function createCounterPickupService({
  connection, settings, facilityCoordinates, routeDistance
}) {
  const { CustomerAddress } = petCareModels(connection);
  async function quoteForCustomer(customerId, addressId, session = null, { counter = false } = {}) {
    if (!Types.ObjectId.isValid(customerId) || !Types.ObjectId.isValid(addressId))
      fail('VALIDATION_FAILED', 'Customer/address selection is invalid', 422);
    if (!isLngLat(facilityCoordinates) || typeof routeDistance !== 'function') fail();
    const policy = await settings.current({ session });
    if (!policy) fail();
    const address = await CustomerAddress.findOne({
      _id: addressId, ownerId: customerId, state: 'ACTIVE',
      pointConfirmedAt: { $type: 'date' }, ...(counter ? {} : { profileHidden: { $ne: true } })
    }).select('+point +location').session(session).lean();
    if (!isLngLat(address?.point?.coordinates))
      fail('ADDRESS_CONFIRMATION_REQUIRED', 'Select an active confirmed address', 422);
    if (session) {
      const guard = await CustomerAddress.collection.updateOne({ _id: address._id, version: address.version, state: 'ACTIVE' },
        { $inc: { bookingGuard: 1 } }, { session });
      if (!guard.matchedCount) fail('QUOTE_CHANGED', 'Address changed', 409);
    }
    const distanceMeters = await routeDistance(facilityCoordinates, address.point.coordinates);
    const fare = pickupFeeForDistance(policy, distanceMeters);
    return {
      ...fare, policyVersion: policy.version,
      ...(fare.allowed ? { snapshot: {
        addressId: String(address._id), addressLabel: address.label,
        addressText: address.location, distanceMeters, tier: fare.tier, feeVnd: fare.feeVnd, policyVersion: policy.version
      } } : {})
    };
  }
  return Object.freeze({
    quoteForCustomer,
    async confirm(customerId, selection, session, options) {
      const fare = await quoteForCustomer(customerId, selection.addressId, session, options);
      if (!fare.allowed) fail('PICKUP_DISTANCE_EXCEEDED', 'Địa chỉ này cách cửa hàng ' + fare.distanceKm.toFixed(1) + ' km, quá ' + fare.maxKm + ' km. Không đón được; vui lòng mang thú cưng đến cửa hàng.', 422);
      if (fare.policyVersion !== selection.policyVersion || fare.feeVnd !== selection.expectedFeeVnd)
        fail('PICKUP_QUOTE_CHANGED', 'Phí đón vừa thay đổi. Vui lòng xem lại trước khi xác nhận.', 409);
      return fare.snapshot;
    },
    async quote(actor, { customerId, addressId } = {}) {
      if (actor?.state !== 'ACTIVE' || !actor.roles?.some(role => ['SALE_STAFF', 'ADMIN'].includes(role)))
        fail('FORBIDDEN', 'Counter staff role required', 403);
      return quoteForCustomer(customerId, addressId, null, { counter: true });
    }
  });
}
