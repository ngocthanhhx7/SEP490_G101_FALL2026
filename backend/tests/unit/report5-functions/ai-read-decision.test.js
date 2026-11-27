import { test, expect, jest } from '@jest/globals';
import { createAiService } from '../../../src/services/sitter-matching/recommendation.service.js';
const OWNER = '111111111111111111111111', OTHER = '222222222222222222222222', ID = '333333333333333333333333';
const NOW = Date.parse('2026-11-16T03:00:00Z');
function fixture() {
  const row = { _id: ID, ownerId: OWNER, kind: 'MATCH', expiresAt: new Date(NOW + 60000),
    snapshot: { result: { candidates: [{ sitterId: 'synthetic-sitter' }], returned: 1 } } };
  const findOne = jest.fn(filter => ({ select() { return this; }, lean: async () =>
    filter._id === ID && filter.ownerId === row.ownerId && filter.kind === row.kind && row.expiresAt > filter.expiresAt.$gt ? row : null }));
  return { row, target: createAiService({ repository: { models: { DecisionSnapshot: { findOne } } }, clock: () => NOW }).readDecision };
}

// SRS: GBR-02; IV Security: chỉ đọc dữ liệu gắn owner hiện tại.
test("AI-REC-02-UTCID01 [N] Owner đọc lại kết quả mà không sửa snapshot", async () => {
  const f = fixture(); const before = JSON.stringify(f.row);
  expect(await f.target(OWNER, ID)).toMatchObject({ id: ID, returned: 1, candidates: [{ sitterId: 'synthetic-sitter' }] });
  expect(JSON.stringify(f.row)).toBe(before);
});

// SRS: GBR-02; IV Security
test("AI-REC-02-UTCID02 [A] Owner khác không được xem kết quả", async () => {
  const f = fixture();
  await expect(f.target(OTHER, ID)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});
