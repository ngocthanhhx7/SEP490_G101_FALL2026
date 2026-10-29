import { body } from '../validators/notification.validator.js';

import { metadata } from '../utils/app-error.js';
function response(res, req, status, data) {
  return res.status(status).json({ data, meta: metadata(req) });
}

export function createNotificationController({ service } = {}) {
  return {
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
    createSubscriptions: async (req, res) =>
      response(
        res,
        req,
        201,
        await service.registerPushSubscription({
          actor: req.auth,
          subscription: body(req, ['subscription']).subscription,
          idempotencyKey: req.get('idempotency-key')
        })
      )
  };
}
