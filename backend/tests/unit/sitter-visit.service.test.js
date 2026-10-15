import { describe, expect, test } from '@jest/globals';
import { createSitterVisitService } from '../../src/services/sitter-visit.service.js';

const SITTER = 'sitter-1';
const VISIT = 'visit-1';
const actor = { userId: SITTER, roles: ['PET_SITTER'], state: 'ACTIVE' };

function record(overrides = {}) {
  return { visitId: VISIT, sitterId: SITTER, version: 3, state: 'ASSIGNED',
    startAt: '2026-10-15T02:00:00.000Z', endAt: '2026-10-15T03:00:00.000Z',
    serviceName: 'Chăm sóc mèo', areaCode: 'Q1', checkInAt: null, checkOutAt: null,
    pets: [{ id: 'pet-1', name: 'Miu', species: 'CAT' }], privateAccessNotes: 'must never leak',
    address: 'must never leak', customerContact: 'must never leak', ...overrides };
}

function serviceFor(value = record()) {
  return createSitterVisitService({ repository: { findVisitForSitter: async ({ visitId, sitterId }) =>
    visitId === VISIT && sitterId === SITTER ? globalThis.structuredClone(value) : null } });
}

describe('sitter visit details', () => {
  test('returns bounded current assignment and omits private/customer fields', async () => {
    const result = await serviceFor().detail(actor, VISIT);
    expect(result).toMatchObject({ visitId: VISIT, state: 'ASSIGNED', version: 3, pets: [{ name: 'Miu' }], canCheckIn: true });
    expect(result).not.toHaveProperty('privateAccessNotes');
    expect(result).not.toHaveProperty('address');
    expect(result).not.toHaveProperty('customerContact');
  });

  test('only exposes the visit to its assigned sitter and denies non-sitter roles', async () => {
    await expect(serviceFor().detail({ ...actor, userId: 'other-sitter' }, VISIT)).rejects.toMatchObject({ status: 404 });
    await expect(serviceFor().detail({ ...actor, roles: ['CUSTOMER'] }, VISIT)).rejects.toMatchObject({ status: 403 });
  });

  test('does not expose check-in capability before assignment or after check-in', async () => {
    await expect(serviceFor(record({ state: 'SCHEDULED' })).detail(actor, VISIT)).rejects.toMatchObject({ code: 'VISIT_DATA_UNAVAILABLE' });
    await expect(serviceFor(record({ state: 'IN_PROGRESS', checkInAt: '2026-10-15T02:00:00.000Z' })).detail(actor, VISIT))
      .resolves.toMatchObject({ canCheckIn: false, canCheckOut: true });
  });
});
