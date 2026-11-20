import { createHash, randomUUID } from 'node:crypto';
import { sendNotification } from 'web-push';
import { identityModels } from '../../models/identity.model.js';
import { notificationModels } from '../../models/notification.model.js';
import { AppError } from '../../utils/app-error.js';
import { validateWebPushSubscription } from '../../validators/web-push.validator.js';

const minute = 60_000;
const deliveryDelay = 8_000;
const maximumAge = 24 * 60 * minute;
const batchSize = 8;

export function createWebPushService({ connection, config, sessionPort, clock = Date.now, send = sendNotification }) {
  const { AuthSession } = identityModels(connection);
  const { Notification } = notificationModels(connection);
  const active = () => ({ revokedAt: null, expiresAt: { $gt: new Date(clock()) } });
  const ownSession = actor => ({ sessionId: actor.sessionId, userId: actor.userId, ...active() });

  async function status(actor) {
    const session = await AuthSession.findOne({ ...ownSession(actor), 'webPush.nextAt': { $exists: true } })
      .select('_id').lean();
    return { enabled: Boolean(config), subscribed: Boolean(session), publicKey: config?.publicKey };
  }

  async function unsubscribe(actor) {
    await AuthSession.updateOne(ownSession(actor), { $unset: { webPush: 1 } });
    return { status: 'UNSUBSCRIBED' };
  }

  async function subscribe(actor, input) {
    if (!config) throw new AppError(503, 'PUSH_UNSUPPORTED', 'Web Push is unavailable');
    const subscription = validateWebPushSubscription(input);
    const endpointDigest = createHash('sha256').update(subscription.endpoint).digest('hex');
    if (!await AuthSession.exists(ownSession(actor))) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    const current = await AuthSession.findOne({ ...ownSession(actor), 'webPush.endpointDigest': endpointDigest })
      .select('+webPush').lean();
    if (current?.webPush.keys.auth === subscription.keys.auth && current.webPush.keys.p256dh === subscription.keys.p256dh) {
      return { status: 'ALREADY_EXISTS' };
    }
    // On a new login in the same browser, move its endpoint to the active session.
    // The unique index covers retries and concurrent registrations.
    await AuthSession.updateOne({ 'webPush.endpointDigest': endpointDigest, 'webPush.keys.auth': subscription.keys.auth,
      sessionId: { $ne: actor.sessionId } },
      { $unset: { webPush: 1 } });
    const now = new Date(clock());
    try {
      const result = await AuthSession.updateOne(ownSession(actor), { $set: { webPush: {
        ...subscription, endpointDigest, subscriptionId: randomUUID(), since: now, nextAt: now
      } } });
      if (!result.matchedCount) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    } catch (error) {
      if (error.code === 11000) throw new AppError(409, 'PUSH_SUBSCRIPTION_CONFLICT', 'Retry Web Push registration');
      throw error;
    }
    return { status: 'SUBSCRIBED' };
  }

  async function processOne() {
    const now = clock();
    // A lease prevents two releases or processes from claiming the same subscription.
    const leasedUntil = new Date(now + 2 * minute);
    const subscription = await AuthSession.findOneAndUpdate({
      ...active(), 'webPush.nextAt': { $lte: new Date(now) }
    }, { $set: { 'webPush.nextAt': leasedUntil } }, {
      sort: { 'webPush.nextAt': 1 }, returnDocument: 'after', timestamps: false
    }).select('sessionId userId +webPush').lean();
    if (!subscription) return;
    const { webPush: device, sessionId, userId, _id } = subscription;
    const claimed = { _id, ...active(), 'webPush.subscriptionId': device.subscriptionId, 'webPush.nextAt': leasedUntil };
    const actor = { sessionId, userId: userId.toString() };
    const user = await sessionPort.getCurrentUser(actor);
    if (!user) {
      await AuthSession.updateOne({ _id, 'webPush.subscriptionId': device.subscriptionId }, { $unset: { webPush: 1 } });
      return;
    }
    const since = new Date(Math.max(+device.since, now - maximumAge));
    const latest = await Notification.findOne({
      recipientId: actor.userId, readAt: null, role: { $in: [null, ...user.roles] },
      createdAt: { $gt: since, $lte: new Date(now - deliveryDelay) }
    }).sort({ createdAt: -1, _id: -1 }).select('_id createdAt').lean();
    const update = { 'webPush.nextAt': new Date(clock() + minute) };
    if (latest && await AuthSession.exists(claimed)) {
      try {
        validateWebPushSubscription(device);
        // A lock-screen alert has no names, message, links or object identifiers.
        await send({ endpoint: device.endpoint, keys: device.keys }, '{}', {
          vapidDetails: { subject: config.contact, publicKey: config.publicKey, privateKey: config.privateKey },
          TTL: 15 * 60, urgency: 'normal', topic: 'pwc-notifications', timeout: 4000
        });
        update['webPush.since'] = latest.createdAt;
      } catch (error) {
        if ([404, 410].includes(error.statusCode) || error.code === 'VALIDATION_FAILED') {
          await AuthSession.updateOne(claimed, { $unset: { webPush: 1 } });
          return;
        }
        update['webPush.nextAt'] = new Date(clock() + 5 * minute);
      }
    }
    await AuthSession.updateOne(claimed, { $set: update }, { timestamps: false });
  }

  async function runBatch() {
    if (!config) return;
    // Limit provider I/O while permitting overlapping blue/green runtimes.
    const results = await Promise.allSettled(Array.from({ length: batchSize }, processOne));
    if (results.some(result => result.status === 'rejected')) throw new Error('Web Push batch failed');
  }

  return { status, subscribe, unsubscribe, runBatch };
}
