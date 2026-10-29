import { randomUUID } from 'node:crypto';
import { isMailbox } from '../utils/mailbox.js';
import { AppError } from '../utils/app-error.js';
import { CONTACT_TOPICS as topics } from '../constants/contact-topics.js';
export function createContactService({ config, ports }) {
  return {
    async send(body) {
      if (!isMailbox(config.contactInbox))
        throw new AppError(
          503,
          'CONTACT_UNAVAILABLE',
          'Contact email is not configured'
        );
      let result;
      try {
        result = await ports.notificationDelivery.send({
          kind: 'SYSTEM',
          channel: 'EMAIL',
          operationId: randomUUID(),
          to: config.contactInbox,
          title: `Liên hệ — ${topics[body.topic]}`,
          message: `Họ tên: ${body.name.trim()}\nEmail phản hồi: ${body.email}\nĐiện thoại: ${body.phone || 'Không cung cấp'}\nChủ đề: ${topics[body.topic]}\nĐồng ý liên hệ: Có\n\n${body.message.trim()}`
        });
      } catch {
        throw new AppError(
          503,
          'CONTACT_UNAVAILABLE',
          'Contact email is temporarily unavailable'
        );
      }
      if (result?.status !== 'ACCEPTED')
        throw new AppError(
          503,
          result?.uncertain
            ? 'CONTACT_DELIVERY_UNCERTAIN'
            : 'CONTACT_UNAVAILABLE',
          'Contact email could not be confirmed'
        );

      return { status: 'ACCEPTED' };
    }
  };
}
