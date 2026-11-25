import { describe, expect, test } from '@jest/globals';
import { createSitterVisitService } from '../../src/services/sitter-visit.service.js';

const SITTER = 'sitter-fe14';
const VISIT = 'visit-fe14';
const actor = { userId: SITTER, roles: ['PET_SITTER'], state: 'ACTIVE' };

function visit(overrides = {}) {
  return {
    visitId: VISIT,
    sitterId: SITTER,
    version: 1,
    state: 'ASSIGNED',
    startAt: '2026-11-25T02:00:00.000Z',
    endAt: '2026-11-25T03:00:00.000Z',
    serviceName: 'Dog walking',
    areaCode: 'HNI-01',
    checkInAt: null,
    checkOutAt: null,
    pets: [{ id: 'pet-fe14', name: 'Milo', species: 'DOG' }],
    ...overrides
  };
}

function serviceFor(record = visit()) {
  return createSitterVisitService({
    repository: {
      async findVisitForSitter({ visitId, sitterId }) {
        return visitId === VISIT && sitterId === SITTER ? JSON.parse(JSON.stringify(record)) : null;
      }
    }
  });
}

describe('FE-14 Care Execution and Reporting integration contracts', () => {
  test('IT-FE14-UC42-01: assigned sitter can read a valid Visit before Check In', async () => {
    await expect(serviceFor().detail(actor, VISIT)).resolves.toMatchObject({
      visitId: VISIT,
      state: 'ASSIGNED',
      canCheckIn: true,
      canCheckOut: false,
      pets: [{ name: 'Milo', species: 'DOG' }]
    });
  });

  test('IT-FE14-UC42-03: a non-assigned sitter cannot access the Visit', async () => {
    await expect(serviceFor().detail({ ...actor, userId: 'another-sitter' }, VISIT))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('IT-FE14-UC42-06: an in-progress Visit exposes Check Out capability after Check In', async () => {
    await expect(serviceFor(visit({
      state: 'IN_PROGRESS',
      checkInAt: '2026-11-25T02:05:00.000Z'
    })).detail(actor, VISIT)).resolves.toMatchObject({
      state: 'IN_PROGRESS',
      canCheckIn: false,
      canCheckOut: true
    });
  });

  test('IT-FE14-UC43-01: a completed Visit no longer exposes Check In or Check Out', async () => {
    await expect(serviceFor(visit({
      state: 'COMPLETED',
      checkInAt: '2026-11-25T02:05:00.000Z',
      checkOutAt: '2026-11-25T03:00:00.000Z'
    })).detail(actor, VISIT)).resolves.toMatchObject({
      state: 'COMPLETED',
      canCheckIn: false,
      canCheckOut: false
    });
  });

  test('IT-FE14-UC42-05: invalid Visit state is rejected by the Visit boundary', async () => {
    await expect(serviceFor(visit({ state: 'SCHEDULED' })).detail(actor, VISIT))
      .rejects.toMatchObject({ code: 'VISIT_DATA_UNAVAILABLE' });
  });

  const pendingCases = [
    ['IT-FE14-UC42-02', 'early Check In is rejected with MSG29 and no persistence'],
    ['IT-FE14-UC42-04', 'replacement sitter can Check In only after handover'],
    ['IT-FE14-UC42-07', 'late Check In is highlighted on the Staff Visit Board'],
    ['IT-FE14-UC42-08', 'missing Check In after 30 minutes enters Needs action'],
    ['IT-FE14-UC43-02', 'Check Out requires all mandatory checklist tasks'],
    ['IT-FE14-UC43-03', 'Check Out requires evidence or a valid no-photo reason'],
    ['IT-FE14-UC43-04', 'successful Check Out creates and delivers a Care Report'],
    ['IT-FE14-UC43-05', 'missing Check Out after two hours enters Needs action'],
    ['IT-FE14-UC43-06', 'Staff can close a missing Check Out for Admin verification'],
    ['IT-FE14-UC43-07', 'Admin can verify sufficient completion evidence'],
    ['IT-FE14-UC43-08', 'Admin rejects insufficient evidence and creates a full refund'],
    ['IT-FE14-UC44-01', 'checklist is derived from acknowledged Care Instructions'],
    ['IT-FE14-UC44-02', 'saving checklist moves Visit to In progress'],
    ['IT-FE14-UC44-03', 'mandatory skipped task requires a reason'],
    ['IT-FE14-UC44-04', 'mandatory skipped task with reason is persisted'],
    ['IT-FE14-UC44-05', 'care photo is linked to the Visit'],
    ['IT-FE14-UC44-06', 'no-photo reason is persisted for Staff review'],
    ['IT-FE14-UC44-07', 'Customer note appears in the Care Report'],
    ['IT-FE14-UC44-08', 'repeated checklist saves do not duplicate Visit data'],
    ['IT-FE14-UC45-01', 'Customer can open the completed Visit Care Report'],
    ['IT-FE14-UC45-02', 'Booking Details opens the matching Care Report'],
    ['IT-FE14-UC45-03', 'Staff can open the Care Report read-only'],
    ['IT-FE14-UC45-04', 'Incident or Complaint opens matching evidence'],
    ['IT-FE14-UC45-05', 'Care Report shows checklist and Check In/Out photos'],
    ['IT-FE14-UC45-06', 'Care Report shows skipped task reason'],
    ['IT-FE14-UC45-07', 'Care Report shows the no-photo reason'],
    ['IT-FE14-UC45-08', 'Care Report opens Submit Complaint for the Visit'],
    ['IT-FE14-UC46-01', 'Customer sees live Dog Walk location after Check In'],
    ['IT-FE14-UC46-02', 'latest Pet Sitter location is delivered to Customer'],
    ['IT-FE14-UC46-03', 'non-Dog-Walk Visit has no location map'],
    ['IT-FE14-UC46-04', 'Dog Walk tracking closes without route history after Check Out'],
    ['IT-FE14-UC46-05', 'stale location data displays MSG146'],
    ['IT-FE14-UC46-06', 'Report Incident opens for the tracked Visit']
  ];

  for (const [id, description] of pendingCases) test.todo(`${id}: ${description}`);
});
