import { describe, expect, jest, test } from '@jest/globals';
import { createContactDelivery } from '../../src/services/contact-delivery.service.js';

describe('composed contact delivery', () => {
  test('keeps EMAIL commands on the SMTP adapter', async () => {
    const email = { send: jest.fn(async command => ({ status: 'ACCEPTED', command })) };
    const sms = { send: jest.fn() };
    const fallback = { send: jest.fn() };
    const delivery = createContactDelivery({ email, sms, fallback });
    const command = { channel: 'EMAIL', kind: 'OTP', to: 'owner@example.test' };

    await expect(delivery.send(command)).resolves.toMatchObject({ status: 'ACCEPTED', command });
    expect(email.send).toHaveBeenCalledWith(command);
    expect(sms.send).not.toHaveBeenCalled();
    expect(fallback.send).not.toHaveBeenCalled();
  });

  test('maps P06 PHONE to the P12 SMS adapter channel', async () => {
    const sms = { send: jest.fn(async command => ({ status: 'ACCEPTED', command })) };
    const delivery = createContactDelivery({
      email: { send: jest.fn() }, sms, fallback: { send: jest.fn() }
    });
    const command = { channel: 'PHONE', kind: 'OTP', to: '+84912345678' };

    await expect(delivery.send(command)).resolves.toMatchObject({
      status: 'ACCEPTED', command: { ...command, channel: 'SMS' }
    });
    expect(sms.send).toHaveBeenCalledWith({ ...command, channel: 'SMS' });
  });

  test('uses the P02 fail-closed adapter when a channel is unavailable', async () => {
    const fallback = { send: jest.fn(async () => ({ status: 'FAILED', code: 'PROVIDER_UNAVAILABLE' })) };
    const delivery = createContactDelivery({ sms: { send: jest.fn() }, fallback });
    const command = { channel: 'EMAIL', kind: 'OTP' };

    await expect(delivery.send(command)).resolves.toEqual({ status: 'FAILED', code: 'PROVIDER_UNAVAILABLE' });
    expect(fallback.send).toHaveBeenCalledWith(command);
  });
});
