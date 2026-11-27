import { test, expect, jest } from '@jest/globals';
import { cachedMatrix, edgeKey } from '../../../src/services/sitter-matching/routing.service.js';
const A = [106.7, 10.8], B = [106.71, 10.81];
const NOW = Date.parse('2026-11-16T03:00:00Z');
function fixture({ cached = true, unreachable = false } = {}) {
  const map = new Map([[edgeKey(A, A), 0], [edgeKey(A, B), unreachable ? null : 12],
    [edgeKey(B, A), 19], [edgeKey(B, B), 0]]);
  const rows = [...map].map(([key, minutes]) => ({ key, minutes, expiresAt: new Date(NOW + 60000) }));
  const Routing = { find: jest.fn(filter => ({ lean: async () => cached
    ? rows.filter(r => filter.key.$in.includes(r.key) && r.expiresAt > filter.expiresAt.$gt) : [] })),
  bulkWrite: jest.fn(async () => ({ ok: 1 })) };
  const provider = { matrix: jest.fn(async () => ({ map, recordedAt: new Date(NOW), source: 'SYNTHETIC_ETA' })) };
  return { input: { points: [A, B], Routing, provider, clock: () => NOW }, Routing, provider };
}

// SRS: GBR-12; JOB-02: thời gian di chuyển phải được dùng đúng khi kiểm lịch; không suy diễn TTL/cache policy là SRS.
test("ROUTING-01-UTCID01 [N] Giữ đúng ETA hai chiều lấy từ cache", async () => {
  const f = fixture();
  const route = await cachedMatrix(f.input);
  expect(route(A, B)).toBe(12); expect(route(B, A)).toBe(19);
  expect(f.provider.matrix).not.toHaveBeenCalled();
});

// SRS: GBR-12; JOB-02: thời gian di chuyển phải được dùng đúng khi kiểm lịch; không suy diễn TTL/cache policy là SRS.
test("ROUTING-01-UTCID02 [N] Giữ đúng ETA khi cần đọc provider", async () => {
  const f = fixture({ cached: false });
  const route = await cachedMatrix(f.input);
  expect(route(A, B)).toBe(12); expect(route(B, A)).toBe(19);
  expect(f.provider.matrix).toHaveBeenCalledWith([A, B]);
});

// SRS: GBR-12; JOB-02: thời gian di chuyển phải được dùng đúng khi kiểm lịch; không suy diễn TTL/cache policy là SRS.
test("ROUTING-01-UTCID03 [A] Không biến tuyến không đi được thành ETA bằng 0", async () => {
  const f = fixture({ cached: false, unreachable: true });
  const route = await cachedMatrix(f.input);
  expect(route(A, B)).toBeNull(); expect(route(B, A)).toBe(19);
});
