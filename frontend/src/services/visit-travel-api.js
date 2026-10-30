export function createVisitTravelApi(request) {
  const path = id => `/employee-scheduling/visits/${encodeURIComponent(id)}/travel`;
  return {
    travelVisits: ({ cursor, signal } = {}) => request(`/employee-scheduling/travel-visits${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
    travel: (id, { signal } = {}) => request(path(id), { signal }),
    travelCommand: (id, body) => request(path(id), { method: 'POST', body }),
    travelLocation: (id, body) => request(`${path(id)}/location`, { method: 'PUT', body }),
    travelEta: id => request(`${path(id)}/eta`, { method: 'POST', body: {} })
  };
}
