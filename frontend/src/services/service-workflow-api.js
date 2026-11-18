import { ApiError } from './api-client.js';
const id = (value) => {
  if (!/^[a-f0-9]{24}$/i.test(value ?? '')) throw new ApiError('VALIDATION_FAILED', 422);
  return value;
};
export function createServiceWorkflowApi(request) {
  const acknowledge = async (promise, resourceId, version, kind) => {
    const response = await promise;
    if (response?.pending) return response;
    if (response?.data?.[kind] !== resourceId || (response.data.version ?? response.data.revision) !== version)
      throw new ApiError('INVALID_RESPONSE', response?.status ?? 0);
    return response;
  };
  return {
    read: (serviceId, options = {}, before) =>
      request(
        `/services/admin/${id(serviceId)}/workflow${before ? `?before=${encodeURIComponent(before)}` : ''}`,
        options
      ),
    template: async (serviceId, action, body, key) => {
      const promise = request(`/services/admin/${id(serviceId)}/workflow/${action}`, {
        method: action === 'draft' ? 'PUT' : 'POST',
        body,
        idempotencyKey: key
      });
      if (action === 'validation') {
        const response = await promise;
        if (!response.pending && response.data?.valid !== true) throw new ApiError('INVALID_RESPONSE', response.status);
        return response;
      }
      return acknowledge(promise, serviceId, body.expectedVersion + 1, 'serviceId');
    },
    visit: (visitId, options = {}) => request(`/visits/${id(visitId)}/workflow`, options),
    saveTask: (visitId, body, key) =>
      acknowledge(
        request(`/visits/${id(visitId)}/workflow/tasks`, { method: 'PATCH', body, idempotencyKey: key }),
        visitId,
        body.expectedVersion + 1,
        'visitId'
      ),
    review: (visitId, body, key) =>
      acknowledge(
        request(`/visits/${id(visitId)}/workflow/reviews`, { method: 'POST', body, idempotencyKey: key }),
        visitId,
        body.expectedVersion + 1,
        'visitId'
      )
  };
}
