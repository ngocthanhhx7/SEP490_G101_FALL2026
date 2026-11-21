import { expect, jest, test } from '@jest/globals';
import { createApplicationMailService } from '../../src/services/applications/application-mail.service.js';

const row = { _id: 'mail-1', ownerUserId: 'owner-1', applicationState: 'PENDING', contactCiphertext: 'cipher', operationId: 'op-1', attempts: 1 };
function setup({ response = { status: 'ACCEPTED' }, verified = true, attempts = 1 } = {}) {
  const Mail = { updateMany: jest.fn(), updateOne: jest.fn(), findOneAndUpdate: jest.fn() };
  const chain = { select: () => ({ lean: async () => Mail.findOneAndUpdate.mock.calls.length === 1 ? { ...row, attempts } : null }) };
  Mail.findOneAndUpdate.mockReturnValue(chain);
  const Contact = { exists: jest.fn(async () => verified) };
  const connection = { models: { ApplicationMail: Mail, Contact, OtpChallenge: {}, OtpThrottle: {}, AuthSession: {} } };
  const delivery = { send: jest.fn(async () => response) };
  const service = createApplicationMailService({ connection, contactCrypto: { decrypt: () => 'user@example.test', lookup: () => ({ lookupKey: 'key' }) }, delivery, clock: () => 1000 });
  return { service, Mail, Contact, delivery };
}

test.each([['UTCID01', 0], ['UTCID02', 21], ['UTCID03', 1.5], ['UTCID04', '1']])('%s rejects an unbounded batch limit before claiming mail', async (_id, limit) => {
  await expect(setup().service.runBatch({ limit })).rejects.toThrow('Bounded mail batch required');
});
test('UTCID05 marks accepted delivery after claiming one pending row', async () => {
  const { service, Mail, delivery } = setup();
  await expect(service.runBatch()).resolves.toEqual({ processed: 1, accepted: 1, failed: 0, unknown: 0 });
  expect(delivery.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.test', operationId: 'op-1' }));
  expect(Mail.updateOne).toHaveBeenCalledWith(expect.objectContaining({ deliveryState: 'SENDING', attempts: 1 }), expect.objectContaining({ $set: expect.objectContaining({ deliveryState: 'ACCEPTED' }) }));
});
test('UTCID06 preserves an uncertain provider outcome as UNKNOWN', async () => {
  const { service, Mail } = setup({ response: { status: 'FAILED', uncertain: true, code: 'TIMEOUT' } });
  await expect(service.runBatch()).resolves.toEqual({ processed: 1, accepted: 0, failed: 0, unknown: 1 });
  expect(Mail.updateOne.mock.calls.at(-1)[1].$set.deliveryState).toBe('UNKNOWN');
});
test('UTCID07 skips delivery when the verified recipient has been replaced', async () => {
  const { service, Mail, delivery } = setup({ verified: false });
  await expect(service.runBatch()).resolves.toEqual({ processed: 1, accepted: 0, failed: 0, unknown: 0 });
  expect(delivery.send).not.toHaveBeenCalled();
  expect(Mail.updateOne.mock.calls.at(-1)[1].$set.deliveryState).toBe('SKIPPED');
});
test('UTCID08 requires an HTTPS origin without credentials', () => {
  expect(() => createApplicationMailService({ connection: { models: { ApplicationMail: {}, Contact: {}, OtpChallenge: {}, OtpThrottle: {}, AuthSession: {} } }, contactCrypto: {}, delivery: {}, webOrigin: 'http://pawworldvn.shop' })).toThrow(TypeError);
});
test('UTCID09 converts an unexpected delivery throw into an unknown outcome', async () => {
  const { service, delivery, Mail } = setup();
  delivery.send.mockRejectedValue(new Error('socket reset'));
  await expect(service.runBatch()).resolves.toEqual({ processed: 1, accepted: 0, failed: 0, unknown: 1 });
  expect(Mail.updateOne.mock.calls.at(-1)[1].$set).toMatchObject({ deliveryState: 'UNKNOWN', failureCode: 'PROVIDER_ERROR' });
});
test('UTCID10 keeps a retryable failure pending before its third attempt', async () => {
  const { service, Mail } = setup({ response: { status: 'FAILED', retryable: true, code: 'THROTTLED' } });
  await expect(service.runBatch()).resolves.toEqual({ processed: 1, accepted: 0, failed: 1, unknown: 0 });
  expect(Mail.updateOne.mock.calls.at(-1)[1].$set).toMatchObject({ deliveryState: 'PENDING', failureCode: 'THROTTLED' });
});
test('UTCID11 marks a retryable third attempt as FAILED', async () => {
  const { service, Mail } = setup({ attempts: 3, response: { status: 'FAILED', retryable: true, code: 'THROTTLED' } });
  await expect(service.runBatch()).resolves.toEqual({ processed: 1, accepted: 0, failed: 1, unknown: 0 });
  expect(Mail.updateOne.mock.calls.at(-1)[1].$set.deliveryState).toBe('FAILED');
});
test('UTCID12 marks expired sending leases UNKNOWN before claiming work', async () => {
  const { service, Mail } = setup();
  await service.runBatch();
  expect(Mail.updateMany).toHaveBeenCalledWith(expect.objectContaining({ deliveryState: 'SENDING' }), expect.objectContaining({ $set: expect.objectContaining({ deliveryState: 'UNKNOWN', failureCode: 'ACKNOWLEDGEMENT_UNKNOWN' }) }));
});
