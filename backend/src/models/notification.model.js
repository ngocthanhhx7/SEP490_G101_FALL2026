import { Schema } from 'mongoose';

export function notificationModels(connection) {
  const options = { strict: 'throw', versionKey: false, bufferCommands: false };
  const notification = new Schema({ _id: String, eventId: String, recipientId: { type: String, required: true },
    role: { type: String, default: null }, eventType: String, title: String, message: String,
    channel: { type: String, default: 'IN_APP' }, deepLink: String, metadata: Schema.Types.Mixed,
    createdAt: { type: Date, required: true }, readAt: { type: Date, default: null } }, options);
  notification.index({ recipientId: 1, createdAt: -1, _id: -1 });
  const event = new Schema({ _id: String, fingerprint: String, notificationIds: [String],
    operation: { type: String, enum: ['READ_ALL'] }, result: Schema.Types.Mixed, expiresAt: Date }, options);
  // Historical publication events have no expiresAt and retain permanent deduplication.
  event.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'notification_operation_expiry' });
  return {
    Notification: connection.models.Notification ?? connection.model('Notification', notification, 'notifications'),
    NotificationEvent: connection.models.NotificationEvent ?? connection.model('NotificationEvent', event)
  };
}
