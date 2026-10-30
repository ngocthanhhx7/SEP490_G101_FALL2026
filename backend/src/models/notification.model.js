import { Schema } from 'mongoose';

export function notificationModels(connection) {
  const options = { strict: 'throw', versionKey: false, bufferCommands: false };
  const notification = new Schema({ _id: String, eventId: String, recipientId: { type: String, required: true },
    role: { type: String, default: null }, eventType: String, title: String, message: String,
    channel: { type: String, default: 'IN_APP' }, deepLink: String, metadata: Schema.Types.Mixed,
    createdAt: { type: Date, required: true }, readAt: { type: Date, default: null } }, options);
  notification.index({ recipientId: 1, createdAt: -1, _id: -1 });
  const event = new Schema({ _id: String, fingerprint: String, notificationIds: [String] }, options);
  return {
    Notification: connection.models.Notification ?? connection.model('Notification', notification, 'notifications'),
    NotificationEvent: connection.models.NotificationEvent ?? connection.model('NotificationEvent', event)
  };
}
