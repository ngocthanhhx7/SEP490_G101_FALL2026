import nodemailer from 'nodemailer';
import { createEmailPortOverrides } from '../services/smtp-email.service.js';
import { createSmsPortOverrides } from '../services/esms-sms.service.js';
import { createContactDelivery } from '../services/contact-delivery.service.js';

export function createProviderPortOverrides({ env = process.env, fallbackContactDelivery,
  createTransport = nodemailer.createTransport, fetchImpl, clock, sleep, logger = () => {} } = {}) {
  const email = createEmailPortOverrides({ env, createTransport, clock, sleep, logger });
  const sms = createSmsPortOverrides({ env, fetchImpl, clock, logger });
  const overrides = { ...email, ...sms };

  if (email.contactDelivery || sms.contactDelivery) {
    overrides.contactDelivery = createContactDelivery({
      email: email.contactDelivery,
      sms: sms.contactDelivery,
      fallback: fallbackContactDelivery
    });
  }

  return overrides;
}
