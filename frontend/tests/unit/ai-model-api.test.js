import { createAiModelApi } from '../../src/services/ai-model-api.js';
const row = { id: 'a'.repeat(24), version: 'synthetic-v1', state: 'DRAFT', reviewVersion: 0, trainingRows: 200, testMae: 1, baselineMae: 2 };
test('malformed or unrelated successful model writes remain unknown acknowledgements', async () => {
  for (const data of [null, {}, { ...row, id: 'b'.repeat(24) }]) {
    const api = createAiModelApi(jest.fn().mockResolvedValue({ data, status: 200 }));
    await expect(api.reviewModel(row.id, { action: 'APPROVE' }, 'same-key')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  }
});
test('pending and valid acknowledgements retain transport body and operation key', async () => {
  const request = jest.fn().mockResolvedValueOnce({ pending: true, status: 202 }).mockResolvedValue({ data: row, status: 201 });
  const api = createAiModelApi(request), body = { artifactJson: '{}', evidence: {} };
  expect((await api.importModel(body, 'same-key')).pending).toBe(true);
  expect((await api.importModel(body, 'same-key')).data).toEqual(row);
  expect(request.mock.calls[0]).toEqual(request.mock.calls[1]);
});
test('malformed history rows cannot crash status presentation', async () => {
  const api = createAiModelApi(jest.fn().mockResolvedValue({ data: { rankingSource: 'EXPLAINABLE_RULES', models: [{ ...row, testMae: null }], data: {} } }));
  await expect(api.status()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
