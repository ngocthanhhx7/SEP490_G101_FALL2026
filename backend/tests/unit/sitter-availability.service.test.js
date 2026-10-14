import { describe, expect, jest, test } from '@jest/globals';
import { createSitterAvailabilityService, localDateTimeToUtc, normalizeWorkingWindows } from '../../src/services/sitter-availability.service.js';

const sitter = { userId: 'sitter-1', roles: ['PET_SITTER'], state: 'ACTIVE' };
const baseRecord = () => ({ sitterId: 'sitter-1', zone: 'Asia/Saigon', workingWindows: [], areas: ['HCMC:D1'],
  dayOffDates: ['2026-10-20'], state: 'ACTIVE', version: 3, customerAddress: 'must-not-leak' });

function createHarness({ conflicts = { items: [], hasMore: false }, now = '2026-10-14T02:00:00.000Z', clock, initialRecord = baseRecord() } = {}) {
  let record = initialRecord;
  const commands = new Map();
  const transaction = { transactionId: 'synthetic-transaction' };
  const availabilityRepository = {
    findBySitterId: jest.fn(async ({ sitterId }) => sitterId === 'sitter-1' ? record : null),
    listCalendar: jest.fn(async ({ fromLocalDate }) => [{ localDate: fromLocalDate, available: true, windows: [], isDayOff: false }]),
    findCommand: jest.fn(async ({ idempotencyKey }) => commands.get(idempotencyKey) ?? null),
    createIfAbsent: jest.fn(async ({ zone }) => { if (!record) record = { sitterId: 'sitter-1', zone, workingWindows: [], areas: [], dayOffDates: [], state: 'ACTIVE', version: 0 }; }),
    replaceIfVersion: jest.fn(async ({ sitterId, expectedVersion, patch }) => {
      if (sitterId !== 'sitter-1' || record.version !== expectedVersion) return null;
      record = { ...record, ...patch, version: record.version + 1 };
      return record;
    }),
    saveCommand: jest.fn(async command => commands.set(command.idempotencyKey, command))
  };
  const assignmentRepository = { findConflicts: jest.fn(async () => conflicts) };
  const withEligibilityGuard = jest.fn(async ({ sitterId }, operation) => {
    expect(sitterId).toBe('sitter-1');
    return operation(transaction);
  });
  const service = createSitterAvailabilityService({ availabilityRepository, assignmentRepository,
    withEligibilityGuard, clock: clock ?? (() => new Date(now)) });
  return { service, availabilityRepository, assignmentRepository, withEligibilityGuard, transaction, getRecord: () => record };
}

const scheduleCommand = overrides => ({ expectedVersion: 3, idempotencyKey: 'schedule-op-0001',
  zone: 'Asia/Saigon', effectiveFrom: '2026-10-14', workingWindows: [
    { weekday: 1, startLocalTime: '09:00', endLocalTime: '12:00' },
    { weekday: 7, startLocalTime: '22:00', endLocalTime: '02:00' }
  ], ...overrides });

describe('Sitter availability calendar service', () => {
  test('converts local wall time in Asia/Saigon to the canonical UTC instant', () => {
    expect(localDateTimeToUtc('2026-10-18', '23:30', 'Asia/Saigon')).toBe('2026-10-18T16:30:00.000Z');
    expect(localDateTimeToUtc('2026-10-19', '00:30')).toBe('2026-10-18T17:30:00.000Z');
  });

  test('rejects malformed local dates and timezone values', () => {
    expect(() => localDateTimeToUtc('2026-02-30', '09:00')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    expect(() => localDateTimeToUtc('2026-10-14', '09:00', 'UTC')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  test('detects overlapping intervals across midnight and the week boundary', () => {
    expect(() => normalizeWorkingWindows([
      { weekday: 2, startLocalTime: '01:00', endLocalTime: '03:00' },
      { weekday: 1, startLocalTime: '22:00', endLocalTime: '02:00' }
    ])).toThrow(expect.objectContaining({ code: 'AVAILABILITY_WINDOW_OVERLAP' }));
    expect(() => normalizeWorkingWindows([
      { weekday: 1, startLocalTime: '09:00', endLocalTime: '10:00' },
      { weekday: 1, startLocalTime: '10:00', endLocalTime: '11:00' }
    ])).not.toThrow();
  });

  test('derives the resource owner from the active Sitter session and returns no private visit fields', async () => {
    const harness = createHarness();
    await expect(harness.service.getMine({ actor: sitter, sitterId: 'other-sitter' })).resolves.toMatchObject({
      zone: 'Asia/Ho_Chi_Minh', workingWindows: [], areas: ['HCMC:D1'], dayOffDates: ['2026-10-20'], expectedVersion: 3
    });
    expect(harness.availabilityRepository.findBySitterId).toHaveBeenCalledWith({ sitterId: 'sitter-1' });
    await expect(harness.service.getMine({ actor: { ...sitter, userId: 'other-sitter' } })).resolves.toBeNull();
    expect(harness.availabilityRepository.findBySitterId.mock.calls.at(-1)[0].sitterId).toBe('other-sitter');
    await expect(harness.service.getMine({ actor: { ...sitter, roles: ['CUSTOMER'] } }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    const result = await harness.service.getMine({ actor: sitter });
    expect(result).not.toHaveProperty('customerAddress');
    expect(result).not.toHaveProperty('sitterId');
  });

  test('bounds calendar date queries and passes an explicit server limit', async () => {
    const harness = createHarness();
    await harness.service.listMyCalendar({ actor: sitter, fromLocalDate: '2026-10-14', toLocalDate: '2026-11-13' });
    expect(harness.availabilityRepository.listCalendar).toHaveBeenCalledWith({ sitterId: 'sitter-1',
      fromLocalDate: '2026-10-14', toLocalDate: '2026-11-13', limit: 31 });
    await expect(harness.service.listMyCalendar({ actor: sitter, fromLocalDate: '2026-10-14', toLocalDate: '2026-11-14' }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('serializes update, checks conflicts before replace, and preserves unrelated availability fields', async () => {
    const harness = createHarness();
    const result = await harness.service.updateMine({ actor: sitter, command: scheduleCommand() });
    expect(harness.withEligibilityGuard).toHaveBeenCalledWith({ sitterId: 'sitter-1', actorRef: 'sitter-1', authEpoch: undefined }, expect.any(Function));
    expect(harness.assignmentRepository.findConflicts).toHaveBeenCalledWith(expect.objectContaining({
      sitterId: 'sitter-1', limit: 101, transaction: harness.transaction
    }));
    expect(harness.availabilityRepository.replaceIfVersion).toHaveBeenCalledWith(expect.objectContaining({
      sitterId: 'sitter-1', expectedVersion: 3, transaction: harness.transaction
    }));
    expect(result).toMatchObject({ expectedVersion: 4, zone: 'Asia/Ho_Chi_Minh', areas: ['HCMC:D1'], dayOffDates: ['2026-10-20'] });
  });

  test('creates the initial empty calendar atomically for an approved Sitter', async () => {
    const harness = createHarness({ initialRecord: null });
    const result = await harness.service.updateMine({ actor: sitter, command: scheduleCommand({ expectedVersion: 0, workingWindows: [] }) });
    expect(harness.availabilityRepository.createIfAbsent).toHaveBeenCalledWith({ sitterId: 'sitter-1', zone: 'Asia/Ho_Chi_Minh', transaction: harness.transaction });
    expect(result).toMatchObject({ expectedVersion: 1, zone: 'Asia/Ho_Chi_Minh', workingWindows: [], areas: [], dayOffDates: [] });
  });

  test('keeps confirmed visits assigned and requires Staff review without returning customer details', async () => {
    const harness = createHarness({ conflicts: { items: Array.from({ length: 101 }, (_, index) => ({ id: `visit-${index}`, customerAddress: 'private' })), hasMore: true } });
    await expect(harness.service.updateMine({ actor: sitter, command: scheduleCommand() }))
      .rejects.toMatchObject({ status: 409, code: 'CONFIRMED_VISIT_CONFLICT', details: {
        conflictCount: 101, resolution: 'STAFF_REVIEW_REQUIRED'
      } });
    expect(harness.availabilityRepository.replaceIfVersion).not.toHaveBeenCalled();
    expect(harness.availabilityRepository.saveCommand).not.toHaveBeenCalled();
  });

  test('rejects a stale version and replays an identical idempotent command', async () => {
    const harness = createHarness();
    await expect(harness.service.updateMine({ actor: sitter,
      command: scheduleCommand({ expectedVersion: 2 }) })).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    expect(harness.assignmentRepository.findConflicts).not.toHaveBeenCalled();
    const first = await harness.service.updateMine({ actor: sitter, command: scheduleCommand() });
    const second = await harness.service.updateMine({ actor: sitter, command: scheduleCommand() });
    expect(second).toEqual(first);
    expect(harness.assignmentRepository.findConflicts).toHaveBeenCalledTimes(1);
    expect(harness.availabilityRepository.replaceIfVersion).toHaveBeenCalledTimes(1);
  });

  test('replays a saved command after its effective date has passed', async () => {
    let now = '2026-10-14T02:00:00.000Z';
    const harness = createHarness({ clock: () => new Date(now) });
    const first = await harness.service.updateMine({ actor: sitter, command: scheduleCommand() });
    now = '2026-10-15T02:00:00.000Z';
    await expect(harness.service.updateMine({ actor: sitter, command: scheduleCommand() })).resolves.toEqual(first);
    expect(harness.availabilityRepository.replaceIfVersion).toHaveBeenCalledTimes(1);
  });

  test('rejects a local date already past in Asia/Saigon even when UTC has not crossed midnight', async () => {
    const harness = createHarness({ now: '2026-10-13T18:30:00.000Z' });
    await expect(harness.service.updateMine({ actor: sitter,
      command: scheduleCommand({ effectiveFrom: '2026-10-13' }) })).rejects.toMatchObject({
      status: 409, code: 'DEADLINE_PASSED'
    });
  });
});