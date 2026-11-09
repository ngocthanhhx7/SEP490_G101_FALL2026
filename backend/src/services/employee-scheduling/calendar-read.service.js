import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';

const DAY = 86400000;
const dateTime = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date
  ? Date.parse(date + 'T00:00:00Z') : NaN;
const unavailable = () => { throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Calendar revision data is unavailable'); };

// Keep command/eligibility guards in the repository. This is a read-only view
// over existing authorities; no historical records or indexes are created.
export function createCalendarReader({ connection, Availability, Revision }) {
  return async ({ sitterId, fromLocalDate, toLocalDate }) => {
    const from = dateTime(fromLocalDate), to = dateTime(toLocalDate);
    if (!Types.ObjectId.isValid(sitterId) || !Number.isFinite(from) || !Number.isFinite(to)
      || to < from || (to - from) / DAY >= 31) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Calendar queries must cover between 1 and 31 local dates');
    }
    // Snapshot sessions pin the first read's cluster time across find/aggregate
    // without a transaction or commit. Supported by this project's MongoDB 8.x.
    const session = await connection.startSession({ snapshot: true, causalConsistency: false });
    try {
      const current = await Availability.findById(sitterId).select('dayOffDates').read('primary').session(session).maxTimeMS(5000).lean();
      const capability = await connection.db.collection('aisitterprofiles').findOne({ userId: new Types.ObjectId(sitterId) },
        { session, readPreference: 'primary', projection: { dayOffDates: 1 }, maxTimeMS: 5000 });
      let revision = await Revision.findOne({ sitterId, effectiveFrom: { $lte: fromLocalDate } })
        .sort({ effectiveFrom: -1, version: -1 }).select('effectiveFrom version workingWindows')
        .read('primary').session(session).maxTimeMS(5000).lean();
      const changes = from === to ? [] : await Revision.aggregate([
        { $match: { sitterId, effectiveFrom: { $gt: fromLocalDate, $lte: toLocalDate } } },
        { $sort: { effectiveFrom: -1, version: -1 } },
        { $group: { _id: '$effectiveFrom', effectiveFrom: { $first: '$effectiveFrom' },
          version: { $first: '$version' }, workingWindows: { $first: '$workingWindows' } } },
        { $limit: 32 }
      ]).read('primary').session(session).option({ maxTimeMS: 5000, allowDiskUse: false });
      if (changes.length > 31 || changes.some(row => !Number.isFinite(dateTime(row.effectiveFrom)))) unavailable();
      if (revision && !Number.isFinite(dateTime(revision.effectiveFrom))) unavailable();
      changes.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      const offDates = new Set([...(current?.dayOffDates ?? []), ...(capability?.dayOffDates ?? [])]);
      const result = []; let index = 0;
      for (let at = from; at <= to; at += DAY) {
        const localDate = new Date(at).toISOString().slice(0, 10), weekday = new Date(at).getUTCDay() || 7;
        while (index < changes.length && changes[index].effectiveFrom <= localDate) revision = changes[index++];
        if (revision && !Array.isArray(revision.workingWindows)) unavailable();
        const windows = (revision?.workingWindows ?? []).filter(row => row.weekday === weekday);
        result.push({ localDate, available: windows.length > 0 && !offDates.has(localDate), windows, isDayOff: offDates.has(localDate) });
      }
      return result;
    } finally { await session.endSession(); }
  };
}
