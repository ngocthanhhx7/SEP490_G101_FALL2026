import { describe, test, expect, jest } from '@jest/globals';
import { createVisitBoardService } from '../../src/services/visit-board.service.js';
import { AppError } from '../../src/utils/app-error.js';

const now = Date.parse('2026-10-15T02:00:00Z');
const actor = { userId: 'staff-1', state: 'ACTIVE', roles: ['STAFF'], expiresAt: now + 3600000 };
const customer = { ...actor, userId: 'customer-1', roles: ['CUSTOMER'] };
const visit = { id: 'visit-1', version: 1, state: 'SCHEDULED', customerId: customer.userId,
  serviceId: 'DOG_WALK', serviceName: 'Dắt chó', areaCode: 'Q1', startAt: '2026-10-16T02:00:00.000Z',
  endAt: '2026-10-16T03:00:00.000Z', originalVisitCount: 1, directed: false, noSitterReason: 'NO_ELIGIBLE_SITTER' };
const candidate = { sitterId: 'sitter-1', approved: true, active: true, services: ['DOG_WALK'],
  workAreas: ['Q1'], available: true, dayOffDates: [], conflicts: [] };
const query = { fromAt: '2026-10-15T17:00:00Z', toAt: '2026-10-16T17:00:00Z' };
const proposal = { actor, visitId: visit.id, expectedVersion: 1, idempotencyKey: 'propose-123', message: 'Có thể chuyển sang lịch này?',
  alternatives: [{ startAt: '2026-10-17T02:00:00Z', endAt: '2026-10-17T03:00:00Z' }] };
function setup(patch = {}, clock = () => now) {
  let data = { visit: { ...visit, ...patch }, remedy: null, audit: [], operations: new Map() };
  let lock = Promise.resolve();
  const tx = {
    authorize: jest.fn(async () => {}), getVisit: jest.fn(async () => data.visit),
    getCandidate: jest.fn(async () => candidate),
    findOperation: jest.fn(async ({ actorId, idempotencyKey }) => data.operations.get(actorId + idempotencyKey)),
    recordOperation: jest.fn(async record => data.operations.set(record.actorId + record.idempotencyKey, record)),
    validateAlternativeSlots: jest.fn(async () => {}),
    createRemedy: jest.fn(async record => {
      if (data.remedy?.state === 'PENDING_CUSTOMER_CONFIRMATION') throw new AppError(409, 'REMEDY_EXISTS', 'Pending remedy exists');
      data.remedy = record; return record;
    }), getRemedy: jest.fn(async id => data.remedy?.id === id ? data.remedy : null),
    getPendingRemedy: jest.fn(async () => data.remedy?.state === 'PENDING_CUSTOMER_CONFIRMATION' ? data.remedy : null),
    updateRemedy: jest.fn(async record => { data.remedy = record; return record; }),
    confirmAlternativeSlot: jest.fn(async ({ selectedSlot }) => { data.visit = { ...data.visit, ...selectedSlot, version: data.visit.version + 1 }; }),
    assignVisit: jest.fn(async ({ sitterId, expectedVersion }) => {
      if (data.visit.version !== expectedVersion || data.visit.sitterId) throw new AppError(409, 'VERSION_CONFLICT', 'Changed');
      data.visit = { ...data.visit, version: expectedVersion + 1, state: 'ASSIGNED', sitterId }; return data.visit;
    }), appendAuditAndOutbox: jest.fn(async record => data.audit.push(record))
  };
  const repository = {
    list: jest.fn(async () => ({ items: [{ ...data.visit, kind: 'VISIT', petCount: 1,
      customerEmail: 'private@example.invalid', homeAccessNotes: 'private entry', medicalNotes: 'private medical' }], nextCursor: null })),
    detail: jest.fn(async () => ({ ...data.visit, remedy: data.remedy })),
    // Synthetic serial/rollback port verifies orchestration, not real database race safety.
    runGuarded: jest.fn((context, work) => {
      const run = lock.then(async () => {
        const snapshot = { ...data, visit: { ...data.visit }, remedy: data.remedy, audit: [...data.audit], operations: new Map(data.operations) };
        try { return await work(tx); } catch (error) { data = snapshot; throw error; }
      });
      lock = run.catch(() => {}); return run;
    })
  };
  const scopePort = { resolve: jest.fn(async () => ({ areaCodes: ['Q1'], version: 2 })) };
  return { service: createVisitBoardService({ repository, scopePort, clock }), repository, scopePort, tx, read: () => data };
}
describe('bounded Staff operational board', () => {
  test.each(['CUSTOMER', 'PET_SITTER'])('role %s denied before repository read', async role => {
    const { service, repository } = setup();
    await expect(service.list({ actor: { ...actor, roles: [role] }, query })).rejects.toMatchObject({ status: 403 });
    expect(repository.list).not.toHaveBeenCalled();
  });
  test.each([{ state: 'LOCKED' }, { expiresAt: now }, { synthetic: true }])('invalid session %j denied', async patch => {
    const { service } = setup();
    await expect(service.list({ actor: { ...actor, ...patch }, query })).rejects.toMatchObject({ status: 401 });
  });
  test('Admin inherits operational read but server scope is still required', async () => {
    const { service, scopePort } = setup();
    expect((await service.list({ actor: { ...actor, roles: ['ADMIN'] }, query })).items).toHaveLength(1);
    scopePort.resolve.mockResolvedValue({ areaCodes: [], version: 1 });
    await expect(service.list({ actor: { ...actor, roles: ['ADMIN'] }, query })).rejects.toMatchObject({ status: 403 });
  });
  test('bounded projected query and scope; no private fields serialized', async () => {
    const { service, repository } = setup();
    const result = await service.list({ actor, query: { ...query, kind: 'VISIT', limit: '1', cursor: 'signed_cursor' } });
    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 1, fetchLimit: 2, cursor: 'signed_cursor',
      filter: expect.objectContaining({ areaCodes: ['Q1'] }) }));
    expect(result.timeZone).toBe('Asia/Ho_Chi_Minh');
    expect(JSON.stringify(result)).not.toMatch(/private|homeAccess|medical|customerEmail/);
  });
  test.each([{ limit: 51 }, { limit: 0 }, { kind: 'ALL', state: 'PENDING' }, { cursor: '../secret' },
    { fromAt: '2026-10-01' }, { fromAt: '2026-02-30T17:00:00Z' }, { toAt: '2027-01-01T00:00:00Z' }, { customerId: 'other' }])('invalid filter %j rejected', async patch => {
    const { service, repository } = setup();
    await expect(service.list({ actor, query: { ...query, ...patch } })).rejects.toMatchObject({ status: 422 });
    expect(repository.list).not.toHaveBeenCalled();
  });
  test('cross-area filter denied; corrupt repository scope fails closed', async () => {
    const { service, repository } = setup();
    await expect(service.list({ actor, query: { ...query, areaCode: 'Q2' } })).rejects.toMatchObject({ status: 403 });
    repository.list.mockResolvedValue({ items: [{ ...visit, kind: 'VISIT', areaCode: 'Q2' }], nextCursor: null });
    await expect(service.list({ actor, query })).rejects.toMatchObject({ status: 503 });
  });
});
describe('no-sitter remedy audit and Customer confirmation', () => {
  test('pending proposal changes no visit, assigns no sitter, creates one audit/outbox; replay is idempotent', async () => {
    const { service, tx, read } = setup();
    const pending = await service.proposeRemedy(proposal);
    expect(pending).toMatchObject({ state: 'PENDING_CUSTOMER_CONFIRMATION', response: null, visitResolved: false });
    expect(await service.proposeRemedy(proposal)).toEqual(pending);
    expect(tx.createRemedy).toHaveBeenCalledTimes(1);
    expect(read().visit).toEqual(visit);
    expect(read().audit).toHaveLength(1);
    expect(tx.assignVisit).not.toHaveBeenCalled();
    expect(tx.confirmAlternativeSlot).not.toHaveBeenCalled();
  });
  test('same key with modified content conflicts; no duplicate audit', async () => {
    const { service, read } = setup();
    await service.proposeRemedy(proposal);
    await expect(service.proposeRemedy({ ...proposal, message: 'Changed' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(read().audit).toHaveLength(1);
  });
  test('Customer must explicitly confirm a proposed slot; Staff/other Customer cannot choose', async () => {
    const { service, tx, read } = setup();
    const remedy = await service.proposeRemedy(proposal);
    const response = { actor: customer, visitId: visit.id, remedyId: remedy.id, expectedVersion: 1, remedyVersion: 0,
      idempotencyKey: 'response-123', choice: 'CONFIRM_SLOT', alternativeId: '1', confirmed: true, message: 'Đồng ý giờ mới' };
    await expect(service.respondRemedy({ ...response, confirmed: false })).rejects.toMatchObject({ status: 422 });
    await expect(service.respondRemedy({ ...response, actor })).rejects.toMatchObject({ status: 403 });
    await expect(service.respondRemedy({ ...response, actor: { ...customer, userId: 'other' } })).rejects.toMatchObject({ status: 404 });
    const result = await service.respondRemedy(response);
    expect(result).toMatchObject({ state: 'CUSTOMER_CONFIRMED', visitResolved: false, response: { message: 'Đồng ý giờ mới' } });
    expect(tx.confirmAlternativeSlot).toHaveBeenCalledTimes(1);
    expect(tx.assignVisit).not.toHaveBeenCalled();
    expect(read().visit.state).toBe('SCHEDULED');
    expect(read().audit[1].type).toBe('NoSitterRemedyResponded');
    expect(await service.respondRemedy(response)).toEqual(result);
  });
  test('decline records response while visit stays unresolved', async () => {
    const { service, tx } = setup(); const remedy = await service.proposeRemedy(proposal);
    expect(await service.respondRemedy({ actor: customer, visitId: visit.id, remedyId: remedy.id, expectedVersion: 1,
      remedyVersion: 0, choice: 'DECLINE', message: 'Không phù hợp', idempotencyKey: 'decline-123' }))
      .toMatchObject({ state: 'REJECTED', visitResolved: false });
    expect(tx.confirmAlternativeSlot).not.toHaveBeenCalled();
  });
  test('stale visit or slot rejected; no fabricated progress', async () => {
    const { service, tx } = setup();
    await expect(service.proposeRemedy({ ...proposal, expectedVersion: 0 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(service.proposeRemedy({ ...proposal, alternatives: [{ startAt: new Date(now).toISOString(), endAt: new Date(now + 1000).toISOString() }] }))
      .rejects.toMatchObject({ code: 'SLOT_EXPIRED' });
    expect(tx.createRemedy).not.toHaveBeenCalled();
  });
  test('audit failure rolls back pending record through transactional repository contract', async () => {
    const { service, tx, read } = setup(); tx.appendAuditAndOutbox.mockRejectedValue(Error('private database error'));
    await expect(service.proposeRemedy(proposal)).rejects.toMatchObject({ status: 503, message: 'Visit board is unavailable' });
    expect(read().remedy).toBeNull();
  });
});
describe('manual assignment under fresh eligibility and shared guard port', () => {
  const assign = { actor, visitId: visit.id, sitterId: candidate.sitterId, expectedVersion: 1, idempotencyKey: 'assign-123', reason: 'Điều phối đã liên hệ' };
  test('active eligible sitter assigned and audited, transaction requests same guard context', async () => {
    const { service, repository, tx } = setup();
    expect(await service.manualAssign(assign)).toMatchObject({ state: 'ASSIGNED', version: 2 });
    expect(repository.runGuarded).toHaveBeenCalledWith(expect.objectContaining({ sitterId: candidate.sitterId, visitId: visit.id }), expect.any(Function));
    expect(tx.authorize).toHaveBeenCalled();
    expect(tx.getCandidate).toHaveBeenCalledWith(candidate.sitterId, expect.objectContaining({ version: 1 }));
    expect(tx.appendAuditAndOutbox).toHaveBeenCalledWith(expect.objectContaining({ type: 'VisitAssigned' }));
  });
  test('pending Customer choice blocks manual assignment even if sitter is eligible', async () => {
    const { service, tx } = setup(); await service.proposeRemedy(proposal);
    await expect(service.manualAssign(assign)).rejects.toMatchObject({ code: 'CUSTOMER_CONFIRMATION_REQUIRED' });
    expect(tx.assignVisit).not.toHaveBeenCalled();
  });
  test('start deadline reached during eligibility read blocks assignment', async () => {
    let time = now;
    const { service, tx } = setup({ startAt: new Date(now + 1000).toISOString(), endAt: new Date(now + 3600000).toISOString() }, () => time);
    tx.getCandidate.mockImplementation(async () => { time += 1000; return candidate; });
    await expect(service.manualAssign(assign)).rejects.toMatchObject({ code: 'VISIT_NOT_ASSIGNABLE' });
    expect(tx.assignVisit).not.toHaveBeenCalled();
  });
  test.each([{ active: false }, { approved: false }, { workAreas: ['Q2'] }, { conflicts: ['occupied'] }, { available: false }])('ineligible snapshot %j denied', async patch => {
    const { service, tx } = setup(); tx.getCandidate.mockResolvedValue({ ...candidate, ...patch });
    await expect(service.manualAssign(assign)).rejects.toMatchObject({ code: 'SITTER_NOT_ELIGIBLE' });
    expect(tx.assignVisit).not.toHaveBeenCalled();
  });
  test.each([{ originalVisitCount: 2, paymentStatus: 'PENDING' }, { originalVisitCount: undefined },
    { directed: true }, { sitterId: 'occupied', state: 'ASSIGNED' }])('visit gate %j prevents assignment', async patch => {
    const { service, tx } = setup(patch);
    await expect(service.manualAssign(assign)).rejects.toMatchObject({ status: 409 }); expect(tx.assignVisit).not.toHaveBeenCalled();
  });
  test('directed Customer confirmation must match sitter, slot and Visit version', async () => {
    const { service } = setup({ directed: true, confirmedProposal: { state: 'CUSTOMER_CONFIRMED', sitterId: candidate.sitterId,
      startAt: visit.startAt, endAt: visit.endAt, visitVersion: 1 } });
    expect(await service.manualAssign(assign)).toMatchObject({ state: 'ASSIGNED' });
  });
  test('two concurrent assignment commands have one winner in the guarded contract', async () => {
    const { service, tx } = setup();
    const results = await Promise.allSettled([service.manualAssign(assign), service.manualAssign({ ...assign, idempotencyKey: 'assign-456' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.code).toBe('VERSION_CONFLICT');
    expect(tx.assignVisit).toHaveBeenCalledTimes(1);
  });
  test('auth/scope revocation inside transaction blocks mutation', async () => {
    const { service, tx } = setup(); tx.authorize.mockRejectedValue(new AppError(403, 'FORBIDDEN', 'Scope revoked'));
    await expect(service.manualAssign(assign)).rejects.toMatchObject({ status: 403 }); expect(tx.assignVisit).not.toHaveBeenCalled();
  });
});
