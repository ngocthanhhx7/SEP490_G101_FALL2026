import { describe, expect, jest, test } from '@jest/globals';
import { AppError } from '../../src/utils/app-error.js';
import { createCustomerAddressService } from '../../src/services/customer-address.service.js';

const CUSTOMER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_CUSTOMER_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const SITTER_ID = 'cccccccccccccccccccccccc';
const OTHER_SITTER_ID = 'dddddddddddddddddddddddd';
const ADDRESS_A = '000000000000000000000001';
const ADDRESS_B = '000000000000000000000002';
const VISIT_ID = '999999999999999999999999';

const customer = { userId: CUSTOMER_ID, roles: ['CUSTOMER'], state: 'ACTIVE' };
const sitter = { userId: SITTER_ID, roles: ['PET_SITTER'], state: 'ACTIVE' };

function address(id, ownerId = CUSTOMER_ID, overrides = {}) {
  return {
    id, customerId: ownerId, label: `Address ${id.slice(-1)}`, location: '12 Synthetic Road',
    privateAccessNotes: 'Ring the blue bell', isDefault: false, state: 'ACTIVE', version: 0,
    createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides
  };
}

function makeRepository({ addresses = [], openBookings = {}, visits = {} } = {}) {
  const records = addresses.map(item => globalThis.structuredClone(item));
  const idempotency = new Map();
  const calls = {
    updateAddress: jest.fn(), archiveAddress: jest.fn(), createAddress: jest.fn(),
    listActiveAddresses: jest.fn(), findAssignedVisitSnapshot: jest.fn()
  };
  let nextId = 100;
  let commandQueue = Promise.resolve();

  return {
    records,
    calls,
    openBookings,
    visits,
    async runCustomerAddressCommand(command) {
      const prior = commandQueue;
      let release;
      commandQueue = new Promise(resolve => { release = resolve; });
      await prior;
      try {
        const key = [command.customerId, command.operation, command.addressId ?? '', command.idempotencyKey].join(':');
        const fingerprint = JSON.stringify(command.payload);
        const previous = idempotency.get(key);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'Operation key was reused');
        return globalThis.structuredClone(previous.result);
        }
        const before = globalThis.structuredClone(records);
        try {
          const result = await command.execute({ customerId: command.customerId });
          idempotency.set(key, { fingerprint, result: globalThis.structuredClone(result) });
          return result;
        } catch (error) {
          records.splice(0, records.length, ...before);
          throw error;
        }
      } finally { release(); }
    },
    async listActiveAddresses({ customerId, limit, cursor }) {
      calls.listActiveAddresses({ customerId, limit, cursor });
      const active = records.filter(item => item.customerId === customerId && item.state === 'ACTIVE')
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      const offset = cursor ? Math.max(0, active.findIndex(item => item.id === cursor) + 1) : 0;
      const selected = active.slice(offset, offset + limit + 1);
      return { addresses: selected.slice(0, limit), nextCursor: selected.length > limit ? selected[limit - 1].id : null };
    },
    async findActiveAddress({ customerId, addressId }) {
      return records.find(item => item.id === addressId && item.customerId === customerId && item.state === 'ACTIVE') ?? null;
    },
    async countActiveAddresses({ customerId }) {
      return records.filter(item => item.customerId === customerId && item.state === 'ACTIVE').length;
    },
    async countOpenBookingsUsingAddress({ customerId, addressId }) {
      return openBookings[`${customerId}:${addressId}`] ?? 0;
    },
    async createAddress({ customerId, values, now }) {
      calls.createAddress({ customerId, values, now });
      const created = address(String(nextId++).padStart(24, '0'), customerId, { ...values, createdAt: now, updatedAt: now });
      if (created.isDefault) records.filter(item => item.customerId === customerId && item.state === 'ACTIVE')
        .forEach(item => { item.isDefault = false; item.version += 1; });
      records.push(created);
        return globalThis.structuredClone(created);
    },
    async updateAddress({ customerId, addressId, expectedVersion, changes, now }) {
      calls.updateAddress({ customerId, addressId, expectedVersion, changes, now });
      const current = records.find(item => item.id === addressId && item.customerId === customerId && item.state === 'ACTIVE');
      if (!current || current.version !== expectedVersion) return null;
      if (changes.isDefault === true) records.filter(item => item.id !== addressId
        && item.customerId === customerId && item.state === 'ACTIVE' && item.isDefault)
        .forEach(item => { item.isDefault = false; item.version += 1; item.updatedAt = now; });
      Object.assign(current, changes, { version: current.version + 1, updatedAt: now });
      return globalThis.structuredClone(current);
    },
    async archiveAddress({ customerId, addressId, expectedVersion, archivedAt }) {
      calls.archiveAddress({ customerId, addressId, expectedVersion, archivedAt });
      const current = records.find(item => item.id === addressId && item.customerId === customerId && item.state === 'ACTIVE');
      if (!current || current.version !== expectedVersion) return null;
      Object.assign(current, { state: 'ARCHIVED', isDefault: false, archivedAt, version: current.version + 1, updatedAt: archivedAt });
      return globalThis.structuredClone(current);
    },
    async findAssignedVisitSnapshot({ visitId, sitterId }) {
      calls.findAssignedVisitSnapshot({ visitId, sitterId });
      const visit = visits[`${visitId}:${sitterId}`];
      return visit ? globalThis.structuredClone(visit) : null;
    }
  };
}

function serviceFor(repository, clock = () => Date.parse('2026-10-14T00:00:00.000Z')) {
  return createCustomerAddressService({ repository, clock });
}

describe('customer address ownership, projection and bounded reads', () => {
  test('limits lists to the session owner and uses a bounded cursor page', async () => {
    const addresses = Array.from({ length: 25 }, (_value, index) => address(String(index + 1).padStart(24, '0')));
    addresses.push(address(OTHER_CUSTOMER_ID, OTHER_CUSTOMER_ID));
    const repository = makeRepository({ addresses });
    const service = serviceFor(repository);
    const first = await service.list(customer, { limit: '20' });
    expect(first.addresses).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    expect(first.addresses[0]).toHaveProperty('privateAccessNotes', 'Ring the blue bell');
    expect(first.addresses[0]).not.toHaveProperty('customerId');
    const next = await service.list(customer, { limit: 20, cursor: first.nextCursor });
    expect(next.addresses).toHaveLength(5);
    expect(repository.calls.listActiveAddresses).toHaveBeenCalledWith({ customerId: CUSTOMER_ID, limit: 20, cursor: null });
    await expect(service.list(customer, { limit: 101 })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    await expect(service.list({ ...customer, roles: ['STAFF'] })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  test('normalizes required public location separately from private access notes and defaults the first address', async () => {
    const repository = makeRepository();
    const service = serviceFor(repository);
    const created = await service.create(customer, {
      label: '  Home   base ', location: '  12   Synthetic Road  \r\n  Ward  3  ',
      privateAccessNotes: '  Ring   the blue bell\nLeave keys with   the guard  '
    }, 'create-address-001');
    expect(created).toMatchObject({
      label: 'Home base', location: '12 Synthetic Road\nWard 3',
      privateAccessNotes: 'Ring the blue bell\nLeave keys with the guard', isDefault: true, state: 'ACTIVE', version: 0
    });
    expect(repository.calls.createAddress).toHaveBeenCalledTimes(1);
    expect(await service.list(customer)).toMatchObject({ addresses: [created], nextCursor: null, limit: 20 });
  });

  test.each([
    [{ label: 'Home' }, 'location required'],
    [{ label: 'Home', location: '   ' }, 'location nonempty'],
    [{ label: 'x'.repeat(61), location: '12 Synthetic Road' }, 'label max length'],
    [{ label: 'Home', location: '12 Synthetic Road', customerId: OTHER_CUSTOMER_ID }, 'mass assignment']
  ])('rejects invalid address creation (%s)', async input => {
    const service = serviceFor(makeRepository());
    await expect(service.create(customer, input, 'create-address-002'))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });
});

describe('address changes, confirmation and concurrency', () => {
  test('does not edit an address used by an open booking until the Customer confirms', async () => {
    const bookingSnapshot = { location: '12 Synthetic Road', privateAccessNotes: 'Old visit instructions', version: 0 };
    const repository = makeRepository({ addresses: [address(ADDRESS_A, CUSTOMER_ID, { isDefault: true })],
      openBookings: { [`${CUSTOMER_ID}:${ADDRESS_A}`]: 1 }, visits: { [`${VISIT_ID}:${SITTER_ID}`]: {
        state: 'ASSIGNED', startAt: new Date('2026-10-14T02:00:00.000Z'), checkOutAt: null,
        privateAccessNotesSnapshot: bookingSnapshot.privateAccessNotes, handoverRequired: false
      } } });
    const service = serviceFor(repository, () => Date.parse('2026-10-14T01:00:00.000Z'));
    const command = { location: '  28   Example Street ', expectedVersion: 0 };
    await expect(service.update(customer, ADDRESS_A, command, 'update-address-001'))
      .rejects.toMatchObject({ status: 409, code: 'ADDRESS_BOOKING_CONFIRMATION_REQUIRED', details: { decisionIds: ['ADDRESS_OPEN_BOOKING_IMPACT'] } });
    expect(repository.calls.updateAddress).not.toHaveBeenCalled();

    const updated = await service.update(customer, ADDRESS_A, { ...command, confirmOpenBookingImpact: true }, 'update-address-002');
    expect(updated).toMatchObject({ location: '28 Example Street', version: 1, isDefault: true });
    expect(bookingSnapshot).toEqual({ location: '12 Synthetic Road', privateAccessNotes: 'Old visit instructions', version: 0 });
    const access = await service.accessNotes(sitter, VISIT_ID);
    expect(access.privateAccessNotes).toBe('Old visit instructions');
    expect(access).not.toHaveProperty('location');
  });

  test('soft archives the default address and clears its default flag', async () => {
    const repository = makeRepository({ addresses: [address(ADDRESS_A, CUSTOMER_ID, { isDefault: true })] });
    const service = serviceFor(repository);
    const result = await service.archive(customer, ADDRESS_A, { expectedVersion: 0 }, 'archive-address-001');
    expect(result).toMatchObject({ id: ADDRESS_A, state: 'ARCHIVED', isDefault: false, version: 1 });
    expect(await service.list(customer)).toMatchObject({ addresses: [], nextCursor: null });
    await expect(service.update(customer, ADDRESS_A, { label: 'Another name', expectedVersion: 1 }, 'update-address-003'))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('serializes competing default changes and leaves exactly one active default', async () => {
    const repository = makeRepository({ addresses: [address(ADDRESS_A, CUSTOMER_ID, { isDefault: true }), address(ADDRESS_B)] });
    const service = serviceFor(repository);
    const outcomes = await Promise.all([
      service.update(customer, ADDRESS_A, { isDefault: true, expectedVersion: 0 }, 'default-address-001'),
      service.update(customer, ADDRESS_B, { isDefault: true, expectedVersion: 0 }, 'default-address-002')
    ]);
    expect(outcomes).toHaveLength(2);
    const active = repository.records.filter(item => item.state === 'ACTIVE');
    expect(active.filter(item => item.isDefault)).toHaveLength(1);
    expect(active.find(item => item.isDefault).id).toBe(ADDRESS_B);
  });

  test('rejects stale edits in a concurrent save instead of overwriting newer data', async () => {
    const repository = makeRepository({ addresses: [address(ADDRESS_A)] });
    const service = serviceFor(repository);
    const results = await Promise.allSettled([
      service.update(customer, ADDRESS_A, { label: 'First', expectedVersion: 0 }, 'edit-address-001'),
      service.update(customer, ADDRESS_A, { label: 'Second', expectedVersion: 0 }, 'edit-address-002')
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ status: 409, code: 'ADDRESS_VERSION_CONFLICT' });
  });

  test('replays the same idempotency key once and rejects reuse with a different payload', async () => {
    const repository = makeRepository();
    const service = serviceFor(repository);
    const input = { label: 'Home', location: '12 Synthetic Road' };
    const first = await service.create(customer, input, 'create-address-003');
    const replay = await service.create(customer, input, 'create-address-003');
    expect(replay).toEqual(first);
    expect(repository.calls.createAddress).toHaveBeenCalledTimes(1);
    await expect(service.create(customer, { label: 'Other', location: '14 Synthetic Road' }, 'create-address-003'))
      .rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});

describe('assigned sitter access-note window', () => {
  const startAt = Date.parse('2026-10-14T02:00:00.000Z');
  const snapshot = {
    state: 'ASSIGNED', startAt: new Date(startAt), checkOutAt: null,
    privateAccessNotesSnapshot: 'Snapshot instructions', handoverRequired: false, handoverAccepted: false
  };

  test('allows the assigned sitter from exactly 60 minutes before until check-out', async () => {
    const repository = makeRepository({ visits: { [`${VISIT_ID}:${SITTER_ID}`]: snapshot } });
    const beforeWindow = serviceFor(repository, () => startAt - 60 * 60 * 1000 - 1);
    await expect(beforeWindow.accessNotes(sitter, VISIT_ID)).rejects.toMatchObject({ status: 403, code: 'ACCESS_WINDOW_CLOSED' });
    const atWindow = serviceFor(repository, () => startAt - 60 * 60 * 1000);
    await expect(atWindow.accessNotes(sitter, VISIT_ID)).resolves.toEqual({ visitId: VISIT_ID, privateAccessNotes: 'Snapshot instructions' });
    const checkedOut = makeRepository({ visits: { [`${VISIT_ID}:${SITTER_ID}`]: { ...snapshot,
      state: 'COMPLETED', checkOutAt: new Date(startAt + 60_000) } } });
    await expect(serviceFor(checkedOut, () => startAt + 60_001).accessNotes(sitter, VISIT_ID))
      .rejects.toMatchObject({ status: 403, code: 'ACCESS_WINDOW_CLOSED' });
  });

  test('denies a non-assigned sitter, wrong role and replacement without handover', async () => {
    const repository = makeRepository({ visits: { [`${VISIT_ID}:${SITTER_ID}`]: snapshot,
      [`${VISIT_ID}:${OTHER_SITTER_ID}`]: { ...snapshot, handoverRequired: true, handoverAccepted: false } } });
    const service = serviceFor(repository, () => startAt - 30 * 60 * 1000);
    await expect(service.accessNotes({ ...sitter, userId: OTHER_SITTER_ID }, VISIT_ID))
      .rejects.toMatchObject({ status: 403, code: 'HANDOVER_REQUIRED' });
    await expect(service.accessNotes({ ...sitter, userId: 'eeeeeeeeeeeeeeeeeeeeeeee' }, VISIT_ID))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
    await expect(service.accessNotes(customer, VISIT_ID)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
