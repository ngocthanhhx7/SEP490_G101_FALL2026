import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { authorize } from './read-projection.js';

const roles = { users: ['ADMIN'], services: ['ADMIN'], admin: ['ADMIN'], staff: ['STAFF'], sitter: ['PET_SITTER'], customer: ['CUSTOMER'] };
const dayKey = value => new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10);

export function createWorkspaceAnalytics({ connection, clock = Date.now }) {
  return { async read({ actor, kind, query = {} }) {
    if (!roles[kind]) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Unknown workspace');
    authorize(actor, roles[kind]);
    if (Object.keys(query).some(key => key !== 'days') || ![7, 30, 90].includes(Number(query.days ?? 7))) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Select 7, 30 or 90 days');
    }
    const days = Number(query.days ?? 7), now = new Date(clock()), today = dayKey(now);
    const end = new Date(`${today}T00:00:00+07:00`);
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    end.setTime(end.getTime() + 86400000);
    const collections = kind === 'users' ? ['users'] : kind === 'services'
      ? ['services', 'serviceversions', 'servicepriceversions', 'visits'] : kind === 'customer' ? ['visits', 'bookings'] : ['visits'];
    const existing = await connection.db.listCollections({ name: { $in: collections } }, { nameOnly: true }).toArray();
    if (collections.some(name => !existing.some(row => row.name === name))) {
      throw new AppError(503, 'ANALYTICS_SOURCE_UNAVAILABLE', 'Workspace data is not provisioned');
    }
    return connection.transaction(async session => {
      const options = { session, maxTimeMS: 5000 };
      const aggregate = (name, pipeline) => connection.db.collection(name).aggregate(pipeline, options).toArray();
      let metrics, groups, points;
      const daily = field => [{ $group: { _id: { $dateToString: { date: `$${field}`, format: '%Y-%m-%d', timezone: 'Asia/Ho_Chi_Minh' } }, value: { $sum: 1 } } }, { $sort: { _id: 1 } }];
      if (kind === 'users') {
        const states = await aggregate('users', [{ $group: { _id: '$state', value: { $sum: 1 } } }]);
        const roleRows = await aggregate('users', [{ $unwind: '$roles' }, { $group: { _id: '$roles', value: { $sum: 1 } } }]);
        const trend = await aggregate('users', [{ $match: { createdAt: { $gte: start, $lt: end } } }, ...daily('createdAt')]);
        const count = state => states.find(row => row._id === state)?.value ?? 0;
        metrics = [{ label: 'Tổng tài khoản', value: states.reduce((n, row) => n + row.value, 0) },
          { label: 'Đang hoạt động', value: count('ACTIVE') }, { label: 'Đã khóa', value: count('LOCKED') },
          { label: 'Đăng ký trong kỳ', value: trend.reduce((n, row) => n + row.value, 0) }];
        groups = roleRows; points = trend;
      } else {
        const owner = kind === 'sitter' ? { sitterId: actor.userId } : {};
        // Employee visit sitterId is an opaque string; Customer ids are ObjectIds.
        if (kind === 'sitter') owner.$or = [{ sitterId: actor.userId }, { sitterId: new Types.ObjectId(actor.userId) }];
        if (kind === 'sitter') delete owner.sitterId;
        const scopedVisits = kind === 'customer' ? [
          { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking' } },
          { $match: { 'booking.customerId': new Types.ObjectId(actor.userId) } }
        ] : [];
        const match = { ...owner, state: { $ne: 'SUPERSEDED' }, startAt: { $gte: start, $lt: end } };
        const states = await aggregate('visits', [{ $match: match }, ...scopedVisits, { $group: { _id: '$state', value: { $sum: 1 } } }]);
        const trend = await aggregate('visits', [{ $match: match }, ...scopedVisits, ...daily('startAt')]);
        const count = state => states.find(row => row._id === state)?.value ?? 0;
        metrics = [{ label: 'Buổi trong kỳ', value: states.reduce((n, row) => n + row.value, 0) },
          { label: 'Đã hoàn thành', value: count('COMPLETED') }, { label: 'Đang chăm sóc', value: count('IN_PROGRESS') },
          { label: 'Chờ phân công', value: count('SCHEDULED') }];
        groups = states; points = trend;
        if (kind === 'services') {
          const versions = await aggregate('serviceversions', [{ $match: { effectiveAt: { $lte: now } } }, { $sort: { serviceId: 1, effectiveAt: -1, version: -1 } },
            { $group: { _id: '$serviceId', state: { $first: '$state' } } }]);
          const prices = await aggregate('servicepriceversions', [{ $match: { effectiveAt: { $lte: now } } },
            { $group: { _id: '$serviceId' } }, { $count: 'value' }]);
          metrics = [{ label: 'Tổng dịch vụ', value: versions.length },
            { label: 'Đang cung cấp', value: versions.filter(row => row.state === 'ACTIVE').length },
            { label: 'Đã có giá hiệu lực', value: prices[0]?.value ?? 0 }, metrics[0]];
          groups = await aggregate('visits', [{ $match: match }, { $group: { _id: '$snapshots.serviceName', value: { $sum: 1 } } },
            { $sort: { value: -1, _id: 1 } }, { $limit: 13 }]);
        }
      }
      const lookup = new Map(points.map(row => [row._id, row.value]));
      const trend = Array.from({ length: days }, (_, i) => {
        const date = dayKey(start.getTime() + i * 86400000);
        return { date, value: lookup.get(date) ?? 0 };
      });
      return { kind, days, asOf: now.toISOString(), from: dayKey(start), to: today, metrics, trend,
        distribution: groups.map(row => ({ key: row._id ?? 'UNKNOWN', value: row.value })),
        trendLabel: kind === 'users' ? 'Tài khoản đăng ký' : 'Buổi chăm sóc theo ngày' };
    }, { readConcern: { level: 'snapshot' } });
  } };
}
