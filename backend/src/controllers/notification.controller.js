import { body } from '../validators/notification.validator.js';

import { metadata } from '../utils/app-error.js';
function response(res, req, status, data) {
  return res.status(status).json({ data, meta: metadata(req) });
}

export function createNotificationController({ service, webPush } = {}) {
  return {
    getIntent: async (req, res) => response(res, req, 200,
      await service.resolveIntent({ actor: req.auth, notificationId: req.params.notificationId })),
    getRoot: async (req, res) =>
      response(
        res,
        req,
        200,
        await service.list({
          actor: req.auth,
          cursor: req.query.cursor,
          unreadOnly: req.query.unreadOnly === 'true',
          limit: req.query.limit
        })
      ),
    createByNotificationIdReadReceipts: async (req, res) =>
      response(
        res,
        req,
        200,
        await service.markRead({
          actor: req.auth,
          notificationId: req.params.notificationId,
          idempotencyKey: req.get('idempotency-key')
        })
      ),
    createReadAll: async (req, res) => {
      if (req.body !== undefined) body(req, []);
      return response(
        res,
        req,
        200,
        await service.markAllRead({
          actor: req.auth,
          idempotencyKey: req.get('idempotency-key')
        })
      );
    },
    updatePreferences: async (req, res) =>
      response(
        res,
        req,
        200,
        await service.updatePreferences({
          actor: req.auth,
          preferences: body(req, ['preferences']).preferences,
          idempotencyKey: req.get('idempotency-key')
        })
      ),
    getPushStatus: async (req, res) => response(res, req, 200, await webPush.status(req.auth)),
    deleteSubscriptions: async (req, res) => response(res, req, 200, await webPush.unsubscribe(req.auth)),
    createSubscriptions: async (req, res) =>
      response(
        res,
        req,
        201,
        webPush ? await webPush.subscribe(req.auth, body(req, ['subscription']).subscription)
          : await service.registerPushSubscription({
            actor: req.auth,
            subscription: body(req, ['subscription']).subscription,
            idempotencyKey: req.get('idempotency-key')
          })
      )
  };
}
