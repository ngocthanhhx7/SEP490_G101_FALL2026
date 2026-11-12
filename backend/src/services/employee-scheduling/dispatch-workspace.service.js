// Read-only operational projection. It never assigns visits or creates check-in evidence.
export function createDispatchWorkspaceService({ col, clock }) {
  const names = [
    { $lookup: { from: 'users', localField: 'customerId', foreignField: '_id', as: 'customer' } },
    { $lookup: { from: 'users', localField: 'sitterId', foreignField: '_id', as: 'sitter' } },
  ];
  return {
    async read() {
      const now = new Date(clock()),
        local = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10),
        start = new Date(local + 'T00:00:00+07:00'),
        end = new Date(start.getTime() + 86400000);
      const [result] = await col('visits')
        .aggregate(
          [
            { $match: { startAt: { $gte: start, $lt: end } } },
            {
              $facet: {
                summary: [
                  {
                    $group: {
                      _id: null,
                      total: { $sum: 1 },
                      completed: { $sum: { $cond: [{ $eq: ['$state', 'COMPLETED'] }, 1, 0] } },
                      inProgress: { $sum: { $cond: [{ $eq: ['$state', 'IN_PROGRESS'] }, 1, 0] } },
                      late: {
                        $sum: {
                          $cond: [
                            {
                              $and: [
                                { $eq: ['$state', 'ASSIGNED'] },
                                { $lt: ['$startAt', new Date(now.getTime() - 15 * 60000)] },
                                { $not: [{ $ifNull: ['$checkInAt', false] }] },
                              ],
                            },
                            1,
                            0,
                          ],
                        },
                      },
                    },
                  },
                ],
                items: [
                  { $sort: { startAt: 1, _id: 1 } },
                  { $limit: 51 },
                  ...names,
                  {
                    $project: {
                      _id: 1,
                      bookingId: 1,
                      startAt: 1,
                      endAt: 1,
                      state: 1,
                      areaCode: 1,
                      checkInAt: 1,
                      checkOutAt: 1,
                      'snapshots.serviceName': 1,
                      'snapshots.pets.name': 1,
                      customerName: { $arrayElemAt: ['$customer.displayName', 0] },
                      sitterName: { $arrayElemAt: ['$sitter.displayName', 0] },
                    },
                  },
                ],
              },
            },
          ],
          { maxTimeMS: 5000 },
        )
        .toArray();
      return {
        date: local,
        asOf: now,
        summary: result.summary[0] ?? { total: 0, completed: 0, inProgress: 0, late: 0 },
        hasMore: result.items.length > 50,
        items: result.items
          .slice(0, 50)
          .map((r) => ({
            id: String(r._id),
            bookingId: String(r.bookingId),
            serviceName: r.snapshots?.serviceName ?? 'Chăm sóc thú cưng',
          petNames: (r.snapshots?.pets ?? []).map(pet => pet.name).filter(name => typeof name === 'string').slice(0,10),
            startAt: r.startAt,
            endAt: r.endAt,
            state: r.state,
            areaCode: r.areaCode,
            customerName: r.customerName ?? null,
            sitterName: r.sitterName ?? null,
            late:
              r.state === 'ASSIGNED' &&
              !r.checkInAt &&
              new Date(r.startAt) < new Date(now.getTime() - 15 * 60000),
          })),
      };
    },
  };
}
