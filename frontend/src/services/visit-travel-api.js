export function createVisitTravelApi(request, { dogWalk = false } = {}) {
  const path = id => `/employee-scheduling/visits/${encodeURIComponent(id)}/${dogWalk ? 'dog-walk' : 'travel'}`;
  return {
    travel: (id, { signal } = {}) => request(path(id), { signal }),
    travelCommand: (id, body) => request(path(id), { method: 'POST', body }),
    travelLocation: (id, body) => request(`${path(id)}/location`, { method: 'PUT', body }),
    ...(!dogWalk && {
      travelVisits: ({ cursor, signal } = {}) => request(`/employee-scheduling/travel-visits${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
      travelEta: id => request(`${path(id)}/eta`, { method: 'POST', body: {} })
    })
  };
}
