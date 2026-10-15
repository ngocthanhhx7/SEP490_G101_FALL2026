import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { isMailbox } from '../services/email-template.service.js';
import { AppError, metadata } from '../utils/app-error.js';

const topics = { BOOKING: 'Đặt lịch chăm sóc', SERVICE: 'Dịch vụ và khu vực', POLICY: 'Chính sách và hỗ trợ', OTHER: 'Liên hệ khác' };
export function contactModule({ config, ports }) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/messages', rateLimit({ windowMs: 3600000, limit: 3,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Please try again later'))
  }), async (req, res) => {
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
      throw new AppError(403, 'FORBIDDEN', 'Request origin is not allowed');
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 6
      || Object.keys(body).some(key => !['name', 'phone', 'email', 'topic', 'message', 'consent'].includes(key))
      || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 80
      || /[\x00-\x1f\x7f]/.test(body.name) || !isMailbox(body.email)
      || body.consent !== true || typeof body.phone !== 'string'
      || (body.phone !== '' && !/^[+0-9 ()-]{8,20}$/.test(body.phone))
      || !Object.hasOwn(topics, body.topic) || typeof body.message !== 'string'
      || body.message.trim().length < 10 || body.message.length > 3000
      || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.message)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Contact details are invalid');
    }
    if (!isMailbox(config.contactInbox)) throw new AppError(503, 'CONTACT_UNAVAILABLE', 'Contact email is not configured');
    let result;
    try {
      result = await ports.notificationDelivery.send({ kind: 'SYSTEM', channel: 'EMAIL',
        operationId: randomUUID(), to: config.contactInbox,
        title: `Liên hệ — ${topics[body.topic]}`,
        message: `Họ tên: ${body.name.trim()}\nEmail phản hồi: ${body.email}\nĐiện thoại: ${body.phone || 'Không cung cấp'}\nChủ đề: ${topics[body.topic]}\nĐồng ý liên hệ: Có\n\n${body.message.trim()}` });
    } catch { throw new AppError(503, 'CONTACT_UNAVAILABLE', 'Contact email is temporarily unavailable'); }
    if (result?.status !== 'ACCEPTED') throw new AppError(503,
      result?.uncertain ? 'CONTACT_DELIVERY_UNCERTAIN' : 'CONTACT_UNAVAILABLE', 'Contact email could not be confirmed');
    res.status(202).json({ data: { status: 'ACCEPTED' }, meta: metadata(req) });
  });
  return { name: 'contact', mount: '/api/v1/contact', router };
}
