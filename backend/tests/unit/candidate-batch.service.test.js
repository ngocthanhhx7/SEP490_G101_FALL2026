import { describe, expect, jest, test } from '@jest/globals';
import { createCandidateBatchReader } from '../../src/services/dispatch/candidate-batch.service.js';
import { createSitterDispatchService } from '../../src/services/dispatch.service.js';

const request = { serviceId: 'DOG_WALK', areaCode: 'Q1',
  startAt: '2026-10-20T23:00:00+07:00', endAt: '2026-10-21T01:00:00+07:00' };
const profile = sitterId => ({ sitterId, approved: true, active: true,
  services: ['DOG_WALK'], workAreas: ['Q1'], activeWorkload: 0,
  available: true, isDayOff: false, hasConflict: false, privateNote: 'never expose' });
const fact = (sitterId, fields = {}) => ({ sitterId, available: true, isDayOff: false, hasConflict: false, ...fields });

function harness({ profiles = [profile('a')], snapshots = [fact('a')] } = {}) {
  const listProfiles = jest.fn(async () => profiles);
  const readAvailabilityBatch = jest.fn(async () => snapshots);
  const listCandidates = createCandidateBatchReader({ listProfiles, readAvailabilityBatch });
  return { listProfiles, readAvailabilityBatch, listCandidates,
    service: createSitterDispatchService({ listCandidates }) };
}

describe('P44 bounded candidate batch reader (internal ports, not Mongo integration)', () => {
  test.each([1, 10, 100])('%i candidates use one profile and one availability call', async count => {
    const profiles = Array.from({ length: count }, (_, i) => profile(`s${i}`));
    const snapshots = profiles.map(item => fact(item.sitterId));
    const h = harness({ profiles, snapshots });
    const result = await h.service.suggest({ request });
    expect(h.listProfiles).toHaveBeenCalledTimes(1);
    expect(h.readAvailabilityBatch).toHaveBeenCalledTimes(1);
    expect(h.listProfiles).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    expect(h.readAvailabilityBatch).toHaveBeenCalledWith(expect.objectContaining({
      sitterIds: profiles.map(item => item.sitterId), request: expect.objectContaining({ localDate: '2026-10-20' })
    }));
    expect(result.eligibleCount).toBe(count);
    expect(result.selected).toHaveLength(Math.min(count, 10));
    expect(JSON.stringify(result)).not.toMatch(/privateNote|never expose/);
  });

  test('empty profiles skip availability; missing snapshots fail closed despite stale profile facts', async () => {
    const empty = harness({ profiles: [], snapshots: [] });
    expect((await empty.service.suggest({ request })).selected).toEqual([]);
    expect(empty.readAvailabilityBatch).not.toHaveBeenCalled();
    const missing = harness({ snapshots: [] });
    const result = await missing.service.suggest({ request });
    expect(result.selected).toEqual([]);
    expect(result.excluded[0].reasons).toContain('AVAILABILITY_UNKNOWN');
    expect(result.excluded[0].reasons).toContain('CONFLICT_STATUS_UNKNOWN');
  });

  test.each([
    [fact('unknown')], [fact('a'), fact('a')], [fact('a', { hasConflict: undefined })],
    [null], null
  ])('rejects malformed or out-of-batch availability: %j', async snapshots => {
    const h = harness({ snapshots });
    await expect(h.service.suggest({ request })).rejects.toMatchObject({ code: 'DISPATCH_UNAVAILABLE' });
  });

  test.each([null, [null], [profile('a'), profile('a')], [profile(' bad')],
    Array.from({ length: 101 }, (_, i) => profile(`s${i}`))])('rejects invalid profile batches', async profiles => {
    const h = harness({ profiles });
    await expect(h.service.suggest({ request })).rejects.toMatchObject({ code: 'DISPATCH_UNAVAILABLE' });
    expect(h.readAvailabilityBatch).not.toHaveBeenCalled();
  });

  test('uses fresh facts after schedule, leave, assignment, cancellation and area changes', async () => {
    const h = harness();
    expect((await h.service.suggest({ request })).selected).toHaveLength(1);
    for (const facts of [fact('a', { available: false }), fact('a', { isDayOff: true }),
      fact('a', { hasConflict: true }), fact('a')]) {
      h.readAvailabilityBatch.mockResolvedValueOnce([facts]);
      expect((await h.service.suggest({ request })).selected).toHaveLength(facts.available && !facts.isDayOff && !facts.hasConflict ? 1 : 0);
    }
    h.listProfiles.mockResolvedValueOnce([{ ...profile('a'), workAreas: ['Q2'] }]);
    expect((await h.service.suggest({ request })).selected).toHaveLength(0);
    expect(h.listProfiles).toHaveBeenCalledTimes(6);
    expect(h.readAvailabilityBatch).toHaveBeenCalledTimes(6);
  });

  test('snapshot fields cannot override profile eligibility or inject private fields', async () => {
    const h = harness({ profiles: [{ ...profile('a'), approved: false }],
      snapshots: [fact('a', { approved: true, services: ['OTHER'], privateNote: 'hidden' })] });
    const result = await h.service.suggest({ request });
    expect(result.selected).toEqual([]);
    expect(result.excluded[0].reasons).toContain('NOT_APPROVED');
  });

  test('honors abort before reads and between ports; maps provider errors safely', async () => {
    const h = harness();
    const controller = new globalThis.AbortController();
    controller.abort();
    await expect(h.listCandidates({ request, signal: controller.signal }))
      .rejects.toMatchObject({ code: 'DISPATCH_UNAVAILABLE' });
    expect(h.listProfiles).not.toHaveBeenCalled();
    const next = new globalThis.AbortController();
    h.listProfiles.mockImplementationOnce(async () => { next.abort(); return [profile('a')]; });
    await expect(h.listCandidates({ request, signal: next.signal }))
      .rejects.toMatchObject({ code: 'DISPATCH_UNAVAILABLE' });
    expect(h.readAvailabilityBatch).not.toHaveBeenCalled();
    h.listProfiles.mockRejectedValueOnce(new Error('private DB detail'));
    await expect(h.listCandidates({ request })).rejects.toMatchObject({ message: 'Sitter candidates are unavailable' });
  });
});
