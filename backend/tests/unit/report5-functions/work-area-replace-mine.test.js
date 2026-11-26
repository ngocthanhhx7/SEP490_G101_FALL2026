import { test, expect, jest } from '@jest/globals';
import { createSitterWorkAreasService } from '../../../src/services/sitter-work-areas.service.js';
const ACTOR = { userId: 'synthetic-sitter', roles: ['PET_SITTER'], state: 'ACTIVE' };
function fixture() {
  const records = [{ sitterId: ACTOR.userId, version: 0, areas: ['DISTRICT_A'] },
    { sitterId: 'other-sitter', version: 0, areas: ['DISTRICT_B'] }];
  const ports = {
    listCoverageAreas: async () => [{ code: 'DISTRICT_A', label: 'Khu vực tổng hợp A', level: 'DISTRICT' },
      { code: 'DISTRICT_B', label: 'Khu vực tổng hợp B', level: 'DISTRICT' }],
    getSitterAvailability: async id => globalThis.structuredClone(records.find(row => row.sitterId === id)),
    replaceSitterAreas: jest.fn(async ({ sitterId, areas, expectedVersion }) => {
      const row = records.find(item => item.sitterId === sitterId && item.version === expectedVersion);
      if (!row) return null;
      row.areas = [...areas]; row.version++; return globalThis.structuredClone(row);
    })
  };
  return { replaceMine: createSitterWorkAreasService(ports).replaceMine, ports, records };
}

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45; GBR-28.
test("WORK-AREA-01-UTCID01 [N] Lưu các khu vực Admin đã cấu hình", async () => {
  const f = fixture();
  const actual = await f.replaceMine({ actor: ACTOR, areas: ["DISTRICT_A", "DISTRICT_B"], expectedVersion: 0, idempotencyKey: 'synthetic-areas-01' });
  expect(actual.selectedCodes).toEqual(["DISTRICT_A", "DISTRICT_B"]);
  expect(f.records[0].areas).toEqual(["DISTRICT_A", "DISTRICT_B"]);
  expect(f.records[1].areas).toEqual(['DISTRICT_B']);
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45; GBR-28.
test("WORK-AREA-01-UTCID02 [N] Bỏ chọn toàn bộ khu vực nhận việc", async () => {
  const f = fixture();
  const actual = await f.replaceMine({ actor: ACTOR, areas: [], expectedVersion: 0, idempotencyKey: 'synthetic-areas-01' });
  expect(actual.selectedCodes).toEqual([]);
  expect(f.records[0].areas).toEqual([]);
  expect(f.records[1].areas).toEqual(['DISTRICT_B']);
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("WORK-AREA-01-UTCID03 [A] Không chọn mã ngoài danh sách Admin", async () => {
  const f = fixture();
  await expect(f.replaceMine({ actor: ACTOR, areas: ['DISTRICT_UNKNOWN'], expectedVersion: 0,
    idempotencyKey: 'synthetic-areas-01' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.ports.replaceSitterAreas).not.toHaveBeenCalled();
});

// SRS: GBR-01/02; UC-29; GBR-45.
test("WORK-AREA-01-UTCID04 [A] Staff không thay danh sách cá nhân qua method của sitter", async () => {
  const f = fixture();
  await expect(f.replaceMine({ actor: { ...ACTOR, roles: ['STAFF'] }, areas: ['DISTRICT_A'], expectedVersion: 0, idempotencyKey: 'synthetic-areas-01' })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.ports.replaceSitterAreas).not.toHaveBeenCalled();
});

// SRS: GBR-01/02; UC-29; GBR-45.
test("WORK-AREA-01-UTCID05 [A] Chưa đăng nhập không thay khu vực", async () => {
  const f = fixture();
  await expect(f.replaceMine({ actor: null, areas: ['DISTRICT_A'], expectedVersion: 0, idempotencyKey: 'synthetic-areas-01' })).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  expect(f.ports.replaceSitterAreas).not.toHaveBeenCalled();
});
