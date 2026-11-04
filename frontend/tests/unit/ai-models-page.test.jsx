import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiModelsPage } from '../../src/pages/admin/AiModelsPage.jsx';
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: () => ({ getCsrfToken: undefined }) }));
const draft = { id: 'a'.repeat(24), version: 'synthetic-draft-v1', state: 'DRAFT', reviewVersion: 0,
  weights: { fit: 30, travel: 25, quality: 20, reliability: 15, workload: 10 }, trainingRows: 200, testMae: 1, baselineMae: 2, evidenceAttached: true };
const status = (models = []) => ({ rankingSource: 'EXPLAINABLE_RULES', activeModel: null, fallbackReason: 'NO_APPROVED_MODEL', models,
  policyWeights: draft.weights, data: { outcomes: 0, verifiedCandidates: 0, capturedVisits: 0, minimumObservations: 200, minimumBookingGroups: 50 } });
test('Admin sees rules, missing model and honest data gates without training or activating anything', async () => {
  const api = { status: jest.fn().mockResolvedValue({ data: status() }), importModel: jest.fn(), reviewModel: jest.fn() };
  render(<AiModelsPage api={api} />);
  expect(await screen.findByText('Bộ quy tắc giải thích được')).toBeInTheDocument();
  expect(screen.getByText('Chưa nhập model nào trong môi trường hiện tại.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lưu model nháp' })).toBeDisabled();
  expect(api.importModel).not.toHaveBeenCalled(); expect(api.reviewModel).not.toHaveBeenCalled();
});
test('uncertain model review freezes the selected version and retries the identical request and key', async () => {
  const active = { ...draft, state: 'APPROVED', reviewVersion: 1 };
  const api = { status: jest.fn().mockResolvedValueOnce({ data: status([draft]) }).mockResolvedValue({ data: { ...status([active]), activeModel: active, rankingSource: 'APPROVED_ADDITIVE_MODEL' } }),
    reviewModel: jest.fn().mockRejectedValueOnce({ code: 'PROVIDER_UNAVAILABLE', status: 503 }).mockResolvedValue({ data: active }) };
  render(<AiModelsPage api={api} />); await screen.findByText('Lịch sử model');
  fireEvent.change(screen.getByLabelText(/Model cần review/), { target: { value: draft.id } });
  fireEvent.change(screen.getByLabelText(/Tham chiếu review nguồn dữ liệu/), { target: { value: 'synthetic-reviewed-source' } });
  fireEvent.change(screen.getByLabelText(/Lý do quyết định/), { target: { value: 'Synthetic holdout review' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận quyết định' }));
  await screen.findByText('Chưa nhận được xác nhận. Hãy kiểm tra lại cùng yêu cầu.');
  expect(screen.getByLabelText(/Model cần review/)).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại yêu cầu' }));
  await waitFor(() => expect(api.reviewModel).toHaveBeenCalledTimes(2));
  expect(api.reviewModel.mock.calls[0]).toEqual(api.reviewModel.mock.calls[1]);
  expect(await screen.findByText('Model synthetic-draft-v1')).toBeInTheDocument();
});
