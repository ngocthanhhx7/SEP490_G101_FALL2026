import { describe, expect, jest, test } from '@jest/globals';
import { Types } from 'mongoose';
import { createAccountSettingsService } from '../../src/services/account-settings.service.js';

describe('account settings contact projection', () => {
  test('returns only masked verified contacts scoped to the session owner', async () => {
    const userId = new Types.ObjectId();
    const find = jest.fn(() => {
      const query = {
        select: jest.fn(() => query),
        lean: jest.fn(async () => [
          { _id: new Types.ObjectId(), channel: 'EMAIL', canonicalCiphertext: 'email-cipher', verifiedAt: new Date('2026-10-14T00:00:00Z') },
          { _id: new Types.ObjectId(), channel: 'PHONE', canonicalCiphertext: 'phone-cipher', verifiedAt: new Date('2026-10-14T00:00:00Z') }
        ])
      };
      return query;
    });
    const service = createAccountSettingsService({
      models: { Contact: { find } },
      contactCrypto: { decrypt: value => value === 'email-cipher' ? 'person@example.test' : '+84912345678' }
    });

    const contacts = await service.listVerifiedContacts({ userId: userId.toString() });

    expect(find).toHaveBeenCalledWith({ userId, state: 'VERIFIED' });
    expect(contacts.map(({ channel, value }) => ({ channel, value }))).toEqual([
      { channel: 'EMAIL', value: 'p*****@example.test' },
      { channel: 'PHONE', value: '+•••••••5678' }
    ]);
    expect(JSON.stringify(contacts)).not.toContain('person@example.test');
    expect(JSON.stringify(contacts)).not.toContain('+84912345678');
    expect(JSON.stringify(contacts)).not.toMatch(/canonicalCiphertext|lookupKey|userId/);
  });

  test('rejects a missing or malformed owner instead of querying contacts', async () => {
    const find = jest.fn();
    const service = createAccountSettingsService({
      models: { Contact: { find } }, contactCrypto: { decrypt: jest.fn() }
    });

    await expect(service.listVerifiedContacts({ userId: 'not-an-id' }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(find).not.toHaveBeenCalled();
  });
});
