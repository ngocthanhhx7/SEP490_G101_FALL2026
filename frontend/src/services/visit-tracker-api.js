import { ApiError, createApiClient } from './api-client.js';

const milestoneKeys = ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'FINISHED', 'REPORT_READY'];
const validId = value => typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value);
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function createVisitTrackerApi(request = createApiClient()) {
  return async (bookingId, visitId, { signal } = {}) => {
    if (![bookingId, visitId].every(validId)) throw new ApiError('RESOURCE_NOT_FOUND', 404);
    const path = '/bookings/' + bookingId + '/visits/' + visitId + '/tracker';
    const { data, status } = await request(path, { signal });
    if (status !== 200 || data?.booking?.id !== bookingId.toLowerCase() || data.visit?.id !== visitId.toLowerCase()
      || !validDate(data.asOf) || typeof data.visit.status !== 'string' || typeof data.visit.showProgress !== 'boolean'
      || ![data.visit.startAt, data.visit.endAt].every(value => value === null || validDate(value))
      || !Array.isArray(data.visit.pets) || !Array.isArray(data.milestones) || data.milestones.length !== milestoneKeys.length
      || !data.milestones.every((step, index) => step?.key === milestoneKeys[index]
        && typeof step.reached === 'boolean' && (step.at === null || validDate(step.at)))
      || !Array.isArray(data.updates) || !data.updates.every(row => milestoneKeys.includes(row?.key) && validDate(row.at))
      || typeof data.actions?.careReport !== 'boolean') throw new ApiError('INVALID_RESPONSE', status);
    return data;
  };
}
