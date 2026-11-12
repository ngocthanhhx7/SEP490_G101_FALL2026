import { notificationModels } from '../../models/notification.model.js';
import { createScopedCursor } from '../../utils/scoped-cursor.js';
import { digest, fail } from '../../validators/pet-care.validator.js';

export function createMongoNotificationRepository({ connection, cursorSecret, clock = Date.now }) {
  const { Notification, NotificationEvent } = notificationModels(connection);
  const cursor = createScopedCursor({ secret: cursorSecret, namespace: 'notifications-v1', clock });
  const scope = ({ recipientId, roles }) => ({ recipientId, $or: [{ role: null }, { role: { $in: roles } }] });
  return {
    async list({ recipientId, roles, unreadOnly, limit, cursor: token }) {
      const registered = await connection.db.listCollections({ name: Notification.collection.name }, { nameOnly: true }).toArray();
      if (!registered.length) fail('NOTIFICATION_STORAGE_NOT_READY', 'Provision notification storage first', 503);
      const context = { recipientId, roles: [...roles].sort(), unreadOnly, limit };
      const filter = { ...scope({ recipientId, roles }), ...(unreadOnly ? { readAt: null } : {}) };
      if (token) {
        const last = cursor.decode(token, context);
        if (!/^[a-f0-9]{64}$/.test(last.id ?? '') || !Number.isFinite(Date.parse(last.createdAt))) fail('VALIDATION_FAILED', 'Invalid notification cursor');
        filter.$and = [{ $or: [{ createdAt: { $lt: new Date(last.createdAt) } }, { createdAt: new Date(last.createdAt), _id: { $lt: last.id } }] }];
      }
      return connection.transaction(async session => {
        const rows = await Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).session(session).lean();
        const unreadCount = await Notification.countDocuments({ ...scope({ recipientId, roles }), readAt: null }).session(session);
        const page = rows.slice(0, limit), last = page.at(-1);
        return { items: page.map(row => ({ ...row, id: row._id })), unreadCount,
          nextCursor: rows.length > limit ? cursor.encode({ id: last._id, createdAt: last.createdAt.toISOString() }, context) : null };
      }, { readConcern: { level: 'snapshot' } });
    },
    async markRead({ recipientId, roles, notificationId, readAt }) {
      const filter = { _id: notificationId, ...scope({ recipientId, roles }) };
      const changed = await Notification.findOneAndUpdate({ ...filter, readAt: null }, { $set: { readAt: new Date(readAt) } }, { returnDocument: 'after' }).lean();
      if (changed) return { status: 'READ', readAt: changed.readAt.toISOString() };
      const previous = await Notification.findOne(filter).lean();
      return previous ? { status: 'ALREADY_READ', readAt: previous.readAt.toISOString() } : { status: 'NOT_FOUND' };
    },
    async markAllRead({ recipientId, roles, cutoff, readAt, idempotencyKey }) {
      const receiptId = `read-all:${digest([recipientId, idempotencyKey])}`;
      const fingerprint = digest({ recipientId, roles: [...roles].sort() });
      const acknowledged = record => {
        if (record.operation !== 'READ_ALL' || record.fingerprint !== fingerprint)
          fail('IDEMPOTENCY_CONFLICT', 'Operation scope changed', 409);
        return record.result;
      };
      try {
        return await connection.transaction(async session => {
          const prior = await NotificationEvent.findById(receiptId).session(session).lean();
          if (prior) return acknowledged(prior);
          const result = await Notification.updateMany(
            { ...scope({ recipientId, roles }), readAt: null, createdAt: { $lte: new Date(cutoff) } },
            { $set: { readAt: new Date(readAt) } }, { session }
          );
          const response = { status: 'READ', markedCount: result.modifiedCount, readAt: new Date(readAt).toISOString() };
          await NotificationEvent.create([{ _id: receiptId, operation: 'READ_ALL', fingerprint,
            result: response, expiresAt: new Date(+new Date(readAt) + 30 * 86400000) }], { session });
          return response;
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        const prior = await NotificationEvent.findById(receiptId).lean();
        if (!prior) throw error;
        return acknowledged(prior);
      }
    },
    async createEvent(body) {
      const { occurredAt, ...content } = body;
      delete content.idempotencyKey;
      const fingerprint = digest(content);
      return connection.transaction(async session => {
        const previous = await NotificationEvent.findById(body.eventId).session(session).lean();
        if (previous) return previous.fingerprint === fingerprint
          ? { status: 'ALREADY_EXISTS', notificationIds: previous.notificationIds } : { status: 'IDEMPOTENCY_CONFLICT' };
        const rows = body.recipients.map(({ recipientId, role }) => ({ _id: digest([body.eventId, recipientId, role]),
          eventId: body.eventId, recipientId, role, eventType: body.eventType, title: body.title, message: body.message,
          channel: body.channel, deepLink: body.deepLink, metadata: body.metadata, createdAt: new Date(occurredAt) }));
        await Notification.create(rows, { session });
        const notificationIds = rows.map(row => row._id);
        await NotificationEvent.create([{ _id: body.eventId, fingerprint, notificationIds }], { session });
        return { status: 'CREATED', notificationIds };
      });
    }
  };
}
