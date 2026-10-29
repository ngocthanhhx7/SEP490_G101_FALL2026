import { AppError } from '../utils/app-error.js';
import { isMailbox } from '../utils/mailbox.js';
import { CONTACT_TOPICS as topics } from '../constants/contact-topics.js';
export function validateContactInput(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 6 ||
    Object.keys(body).some(
      (key) =>
        !['name', 'phone', 'email', 'topic', 'message', 'consent'].includes(key)
    ) ||
    typeof body.name !== 'string' ||
    body.name.trim().length < 2 ||
    body.name.length > 80 ||
    /[\x00-\x1f\x7f]/.test(body.name) ||
    !isMailbox(body.email) ||
    body.consent !== true ||
    typeof body.phone !== 'string' ||
    (body.phone !== '' && !/^[+0-9 ()-]{8,20}$/.test(body.phone)) ||
    !Object.hasOwn(topics, body.topic) ||
    typeof body.message !== 'string' ||
    body.message.trim().length < 10 ||
    body.message.length > 3000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.message)
  ) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Contact details are invalid');
  }

  return body;
}
