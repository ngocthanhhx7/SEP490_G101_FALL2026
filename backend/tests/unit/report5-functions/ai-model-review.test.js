import { test, expect, jest } from '@jest/globals';
import { createModelRegistry } from '../../../src/services/sitter-matching/model-registry.service.js';
function fixture() {
  const read = jest.fn(() => { throw new Error('Anonymous must not reach repository'); });
  const repository = { models: { SitterRankModel: { find: read, findOne: read, findById: read, create: read },
    SitterRankModelReview: {} }, connection: { transaction: read } };
  return { service: createModelRegistry({ repository }), read };
}

// SRS: GBR-01; IV Security
test("AI-MODEL-02-UTCID01 [A] Anonymous không được truy cập model registry", async () => {
  const f = fixture();
  await expect(f.service.review(null, '111111111111111111111111', {}, 'synthetic-key')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  expect(f.read).not.toHaveBeenCalled();
});
