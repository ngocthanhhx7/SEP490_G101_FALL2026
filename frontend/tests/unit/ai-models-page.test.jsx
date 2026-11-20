import { fireEvent, render, screen } from '@testing-library/react';
import { SitterRankingPolicyPage } from '../../src/pages/admin/SitterRankingPolicyPage.jsx';
import { createSitterRankingPolicyApi } from '../../src/services/sitter-ranking-policy-api.js';

jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: () => ({ getCsrfToken: undefined }) }));

const policy = version => ({ rankingSource: 'EXPLAINABLE_RULES', policyVersion: version,
  policyWeights: { fit: 30, travel: 25, quality: 20, reliability: 15, workload: 10 } });

test('renders the active fixed policy and refreshes the approved version', async () => {
  const request = jest.fn().mockResolvedValueOnce({ data: policy(1) }).mockResolvedValueOnce({ data: policy(2) });
  render(<SitterRankingPolicyPage api={createSitterRankingPolicyApi(request)} />);
  expect(await screen.findByRole('heading', { name: 'Chính sách xếp hạng phiên bản 1' })).toBeInTheDocument();
  expect(screen.getByText('25%')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /model/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tải lại trạng thái' }));
  expect(await screen.findByRole('heading', { name: 'Chính sách xếp hạng phiên bản 2' })).toBeInTheDocument();
  expect(request.mock.calls.every(([path]) => path === '/ai/admin/status')).toBe(true);
});

test('rejects a malformed ranking policy before rendering it', async () => {
  const data = { ...policy(1), policyWeights: { fit: 100 } };
  const api = createSitterRankingPolicyApi(jest.fn().mockResolvedValue({ data }));
  await expect(api.status()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
